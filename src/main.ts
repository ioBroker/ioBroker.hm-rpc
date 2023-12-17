import * as utils from '@iobroker/adapter-core';
import { images } from './lib/images';
import * as tools from './lib/tools';
import { metaRoles } from './lib/roles';
import { randomBytes } from 'crypto';
import { setTimeout as wait } from 'timers/promises';
import type {
    ParamsetObjectWithSpecial,
    ParamsetObject,
    DatapointTypeObject,
    MulticallEvent,
    ListDevicesEntry
} from './lib/_types';

import { dmHmRpc } from './lib/deviceManager';

let connected = false;
const displays: Record<string, any> = {};

let clientId: string;

let rpc: any;
let rpcClient: any;

let rpcServer: any;

export class HomematicRpc extends utils.Adapter {
    /** On failed rpc call retry in X ms */
    private readonly RETRY_DELAY_MS = 150;
    private readonly metaValues: Record<string, ParamsetObject> = {};
    private readonly dpTypes: Record<string, DatapointTypeObject> = {};
    private lastEvent = 0;
    private eventInterval: NodeJS.Timeout | undefined;
    private connInterval: NodeJS.Timeout | undefined;
    private connTimeout: NodeJS.Timeout | undefined;
    private daemonURL = '';
    private daemonProto = '';
    private homematicPath: string | undefined;
    private readonly COMMON_TYPE_MAPPING = {
        ACTION: 'boolean',
        BOOL: 'boolean',
        FLOAT: 'number',
        ENUM: 'number',
        INTEGER: 'number',
        STRING: 'string',
        EPAPER_LINE: 'string',
        EPAPER_ICON: 'string',
        EPAPER_TONE: 'string',
        EPAPER_SIGNAL: 'string',
        EPAPER_TONE_INTERVAL: 'number',
        EPAPER_TONE_REPETITIONS: 'number'
    } as const;

    private deviceManagement: dmHmRpc | undefined;

    private readonly methods = {
        event: (err: any, params: any) => {
            if (err) {
                this.log.error(`${this.config.type}rpc <- received error event: ${err}`);
                return '';
            }

            if (!Array.isArray(params)) {
                this.log.error(`${this.config.type}rpc <- Invalid params "${params}" received`);
                return '';
            }

            this.log.debug(`${this.config.type}rpc <- event ${JSON.stringify(params)}`);
            let val;
            // CUxD ignores all prefixes!!
            if (params[0] === 'CUxD' || !params[0].includes(this.name)) {
                params[0] = this.namespace;
            }
            const channel = params[1].replace(':', '.').replace(tools.FORBIDDEN_CHARS, '_');
            if (params[0] === clientId) {
                // convert back our clientId to our namespace
                params[0] = this.namespace;
            }
            const name = `${params[0]}.${channel}.${params[2]}`;

            if (this.dpTypes[name]) {
                if (this.dpTypes[name].UNIT === '100%') {
                    val = Math.round(params[3] * 1_000) / 10;
                } else {
                    val = params[3];
                }
            } else {
                // for every device we know (listDevices), there will be a dpType, so this way we filter out stuff like PONG event and https://github.com/ioBroker/ioBroker.hm-rpc/issues/298
                this.log.debug(`${this.config.type}rpc <- event: ${name}:${params[3]} discarded, no matching device`);
                return '';
            }

            val = tools.fixEvent({ val, dpType: this.dpTypes[name] });

            this.log.debug(
                `${name} ==> UNIT: "${this.dpTypes[name] ? this.dpTypes[name].UNIT : 'none'}" (min: ${
                    this.dpTypes[name] ? this.dpTypes[name].MIN : 'none'
                }, max: ${this.dpTypes[name] ? this.dpTypes[name].MAX : 'none'}) From "${params[3]}" => "${val}"`
            );

            this.setState(`${channel}.${params[2]}`, { val: val, ack: true });
            // unfortunately this is necessary
            return '';
        }
    };

    constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'hm-rpc',
            error: (e: any) => {
                if (e.code === 'EADDRNOTAVAIL') {
                    this.log.error(
                        `Address ${this.config.adapterAddress} not available, maybe your HOST IP has changed due to migration`
                    );
                    // doesn't work in that case, so let it correctly be handled by controller at least we can log
                    // return true;
                }

                // don't know how to handle so let it burn ;-)
                return false;
            }
        });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        this.deviceManagement = new dmHmRpc(this);

        this.subscribeStates('*');

        this.homematicPath = this.config.daemon === 'virtual-devices' ? '/groups/' : '/';

        this.config.reconnectInterval = this.config.reconnectInterval || 30;
        if (this.config.reconnectInterval < 10) {
            this.log.error('Reconnect interval is less than 10 seconds. Set reconnect interval to 10 seconds.');
            this.config.reconnectInterval = 10;
        }

        this.config.checkInitInterval = this.config.checkInitInterval || 10;
        if (this.config.checkInitInterval < 10) {
            this.log.error('Check init interval is less than 10 seconds. Set init interval to 10 seconds.');
            this.config.checkInitInterval = 10;
        }

        this.setState('info.connection', false, true);

        if (this.config.type === 'bin') {
            rpc = require('binrpc');
            this.daemonProto = 'xmlrpc_bin://';
        } else {
            rpc = require('homematic-xmlrpc');
            this.config.type = 'xml';
            this.daemonProto = 'http://';
        }

        // Clean up objects if still hm-rpc.meta exist
        try {
            const doc = await this.getObjectListAsync({
                startkey: 'hm-rpc.meta',
                endkey: 'hm-rpc.meta\u9999'
            });

            if (doc && doc.rows) {
                if (doc.rows.length >= 50) {
                    this.log.info('Cleaning up meta folder... this may take some time');
                }

                for (const row of doc.rows) {
                    try {
                        await this.delForeignObjectAsync(row.id);
                    } catch (e: any) {
                        this.log.warn(`Could not delete ${row.id}: ${e.message}`);
                    }
                }
            }
        } catch (e: any) {
            this.log.error(`getObjectListAsync hm-rpc: ${e.message}`);
        }

        try {
            const res = await this.getObjectViewAsync('system', 'state', {
                startkey: `${this.namespace}.`,
                endkey: `${this.namespace}.\u9999`
            });

            if (res.rows) {
                for (const row of res.rows) {
                    if (row.id === `${this.namespace}.updated`) {
                        continue;
                    }

                    const obj = row.value;

                    if (!obj || !obj.native) {
                        this.log.warn(`State ${row.id} does not have native.`);
                        this.dpTypes[row.id] = { UNIT: '', TYPE: '' };
                    } else {
                        this.dpTypes[row.id] = {
                            UNIT: obj.native.UNIT,
                            TYPE: obj.native.TYPE
                        };

                        if (typeof obj.native.MIN === 'number') {
                            this.dpTypes[row.id].MIN = obj.native.MIN;
                            this.dpTypes[row.id].MAX = obj.native.MAX;

                            if (this.dpTypes[row.id].MAX === 99) {
                                this.dpTypes[row.id].MAX = 100;
                            } else if (this.dpTypes[row.id].MAX === 1.005 || this.dpTypes[row.id].MAX === 1.01) {
                                this.dpTypes[row.id].MAX = 1;
                            }
                        }
                    }

                    // apply new roles, that were defined later
                    const key = row.id.split('.').pop();
                    if (key && obj && obj.common && !obj.common.role && metaRoles.dpNAME[key]) {
                        obj.common.role = metaRoles.dpNAME[key];
                        await this.setForeignObjectAsync(obj._id, obj);
                    }
                }
            }
        } catch (e: any) {
            this.log.error(`Could not get state view on start: ${e.message}`);
        }

        // Start Adapter
        this.initRpcServer();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback call this in any case, it is necessary to clean up the adapter correctly
     */
    private async onUnload(callback: () => void): Promise<void> {
        try {
            if (this.eventInterval) {
                clearInterval(this.eventInterval);
                this.eventInterval = undefined;
            }

            if (this.connInterval) {
                clearInterval(this.connInterval);
                this.connInterval = undefined;
            }

            if (this.connTimeout) {
                clearTimeout(this.connTimeout);
                this.connTimeout = undefined;
            }

            if (this.config && rpcClient) {
                this.log.info(
                    `${this.config.type}rpc -> ${this.config.homematicAddress}:${this.config.homematicPort}${
                        this.homematicPath
                    } init ${JSON.stringify([this.daemonURL, ''])}`
                );
                try {
                    // tell CCU that we are no longer the client under this URL - legacy idk if necessary
                    await this.rpcMethodCallAsync('init', [this.daemonURL, '']);
                    if (connected) {
                        this.log.info('Disconnected');
                        connected = false;
                        this.setState('info.connection', false, true);
                    }

                    if (rpcServer && rpcServer.server) {
                        try {
                            rpcServer.server.close(() => {
                                console.log('server closed.');
                                rpcServer.server.unref();
                            });
                        } catch {
                            // ignore
                        }
                    }

                    if (rpcClient?.socket) {
                        try {
                            rpcClient.socket.destroy();
                        } catch {
                            // ignore
                        }
                    }

                    if (typeof callback === 'function') {
                        callback();
                    }
                } catch (e: any) {
                    if (connected) {
                        this.log.info('Disconnected');
                        connected = false;
                        this.setState('info.connection', false, true);
                    }
                    this.log.error(`Cannot call init: [${this.daemonURL}, ""] ${e.message}`);
                    if (typeof callback === 'function') {
                        callback();
                    }
                }
            } else {
                if (typeof callback === 'function') {
                    callback();
                }
            }
        } catch (e: any) {
            if (this.log) {
                this.log.error(`Unload error: ${e.message}`);
            } else {
                console.log(`Unload error: ${e.message}`);
            }
            if (typeof callback === 'function') {
                callback();
            }
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id the state id
     * @param state the actual state, nullish if deleted
     */
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state || state.ack === true) {
            return;
        }

        const tmp = id.split('.');
        let val;

        if (id === `${this.namespace}.updated` || /_ALARM$/.test(id)) {
            return;
        }

        this.log.debug(`${this.config.type}rpc -> setValue ${tmp[3]} ${tmp[4]}: ${state.val}`);

        if (!this.dpTypes[id]) {
            this.log.error(`${this.config.type}rpc -> setValue: no dpType for ${id}!`);
            // log this for debug purposes
            this.log.error(JSON.stringify(this.dpTypes));
            return;
        }

        /* It should not be necessary to scale on % values - see https://github.com/ioBroker/ioBroker.hm-rpc/issues/263
        if (dpTypes[id].UNIT === '%' && dpTypes[id].MIN !== undefined) {
            state.val = (state.val / 100) * (dpTypes[id].MAX - dpTypes[id].MIN) + dpTypes[id].MIN;
            state.val = Math.round(state.val * 1000) / 1000;
        } else */
        if (this.dpTypes[id].UNIT === '100%' && typeof state.val === 'number') {
            state.val = Math.round((state.val / 100) * 1000) / 1000;
        }

        const type = this.dpTypes[id].TYPE;

        if (type === 'EPAPER_TONE_REPETITIONS') {
            // repeats have to be between 0 and 15 -> 0 is unlimited
            if (typeof state.val !== 'number') {
                state.val = 1;
            }
            val = Math.min(Math.max(state.val, 0), 15);
            this.setForeignState(id, val, true);
            return;
        }

        if (type === 'EPAPER_TONE_INTERVAL') {
            // offset has to be between 0 and 160
            if (typeof state.val !== 'number') {
                state.val = 0;
            }
            val = Math.min(Math.max(Math.round(state.val / 10) * 10, 10), 160);
            this.setForeignState(id, val, true);
            return;
        }

        if (type === 'EPAPER_LINE' || type === 'EPAPER_ICON') {
            const _id = `${tmp[0]}.${tmp[1]}.${tmp[2]}`;
            if (displays[_id] && displays[_id].timer) {
                clearTimeout(displays[_id].timer);
                if (displays[_id].withTone) {
                    displays[_id] = { timer: setTimeout(() => this.readSignals(_id), 300), withTone: true };
                    return;
                }
            }
            displays[_id] = { timer: setTimeout(() => this.readSettings(_id), 300), withTone: false };
            return;
        } else if (type === 'EPAPER_SIGNAL' || type === 'EPAPER_TONE') {
            const _id = `${tmp[0]}.${tmp[1]}.${tmp[2]}`;
            if (displays[_id] && displays[_id].timer) {
                clearTimeout(displays[_id].timer);
            }
            displays[_id] = { timer: setTimeout(() => this.readSignals(_id), 300), withTone: true };
            return;
        } else if (tmp[4] === 'DISPLAY_DATA_STRING') {
            // new EPAPER HMIP-WRCD has own states but needs to encode special chars by DIN_66003
            val = tools.replaceSpecialChars(state.val ? state.val.toString() : '');
            this.log.debug(`Encoded ${state.val} to ${val}`);
        } else if (tmp[4] === 'COMBINED_PARAMETER' && state.val && /DDS=.+,/g.test(state.val.toString())) {
            // new EPAPER and DISPLAY_DATA_STRING is given, we need to replace
            let text = state.val.toString();
            for (const line of text.split(/},(\s+)?{/g)) {
                if (line === undefined) {
                    continue;
                }
                const start = line.search(/DDS=.+/g) + 4;
                const end = line.indexOf(',', start);
                const origText = line.slice(start, end);
                const replacedText = tools.replaceSpecialChars(origText);

                const lineReplaced = line.replace(`DDS=${origText}`, `DDS=${replacedText}`);
                text = text.replace(line, lineReplaced);
            }
            val = text;
            this.log.debug(`Encoded ${state.val} to ${val}`);
        } else {
            switch (type) {
                case 'BOOL':
                    val = state.val === 'false' || state.val === '0' ? false : !!state.val;
                    break;
                case 'FLOAT':
                    val = { explicitDouble: state.val };
                    break;
                default:
                    val = state.val;
            }
        }

        this.log.debug(`setValue ${JSON.stringify([`${tmp[2]}:${tmp[3]}`, tmp[4], val])} ${type}`);

        try {
            if (rpcClient && connected) {
                await this.rpcMethodCallAsync('setValue', [`${tmp[2]}:${tmp[3]}`, tmp[4], val]);
            } else {
                this.log.warn(`Cannot setValue "${id}", because not connected.`);
            }
        } catch (e: any) {
            this.log.error(
                `${this.config.type}rpc -> setValue ${JSON.stringify([
                    `${tmp[2]}:${tmp[3]}`,
                    tmp[4],
                    state.val
                ])} ${type}`
            );
            this.log.error(`Cannot call setValue: ${e.message}`);
        }
    }

    /**
     * Handle messages send to this instance
     * @param obj the message object
     */
    private async onMessage(obj: ioBroker.Message): Promise<void> {
        this.log.debug(`[MSSG] Received: ${JSON.stringify(obj)}`);

        if (obj.command.startsWith('dm:')) {
            return;
        }

        if (
            obj.command === undefined ||
            obj.command === null ||
            typeof obj.message !== 'object' ||
            obj.message === null
        ) {
            this.log.warn(
                `Received invalid command via message "${obj.command}" "${JSON.stringify(obj.message)}" from ${
                    obj.from
                }`
            );
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { error: 'Invalid command' }, obj.callback);
            }
            return;
        }

        if (obj.message.params === undefined || obj.message.params === null) {
            try {
                if (rpcClient && connected) {
                    // if device specific command, send it's ID and paramType
                    const data = await this.rpcMethodCallAsync(
                        obj.command,
                        obj.message.ID !== undefined ? [obj.message.ID, obj.message.paramType] : []
                    );
                    if (obj.callback) {
                        this.sendTo(
                            obj.from,
                            obj.command,
                            {
                                result: data,
                                error: null
                            },
                            obj.callback
                        );
                    }
                } else {
                    this.log.warn(`Cannot send "${obj.command}" "${obj.message.ID}": because not connected`);
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, { error: 'not connected' }, obj.callback);
                    }
                }
            } catch (e: any) {
                this.log.error(`Cannot call ${obj.command}: ${e.message}`);
                this.sendTo(obj.from, obj.command, { error: e }, obj.callback);
            }
        } else {
            try {
                if (rpcClient && connected) {
                    const data = await this.rpcMethodCallAsync(obj.command, [
                        obj.message.ID,
                        obj.message.paramType,
                        obj.message.params
                    ]);
                    if (obj.callback) {
                        this.sendTo(
                            obj.from,
                            obj.command,
                            {
                                result: data,
                                error: null
                            },
                            obj.callback
                        );
                    }
                } else {
                    this.log.warn(`Cannot send "${obj.command}" "${obj.message.ID}": because not connected`);
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, { error: 'not connected' }, obj.callback);
                    }
                }
            } catch (e: any) {
                this.log.error(`Cannot call ${obj.command}: ${e.message}`);
                this.sendTo(obj.from, obj.command, { error: e }, obj.callback);
            }
        }
    }

    /**
     * Connect to the CCU
     *
     * @param isFirst if it's the initial connection
     */
    private connect(isFirst: boolean): void {
        if (!rpcClient && !this.config.useHttps) {
            try {
                rpcClient = rpc.createClient({
                    host: this.config.homematicAddress,
                    port: this.config.homematicPort,
                    path: this.homematicPath,
                    reconnectTimeout: this.config.reconnectInterval * 1000
                });
            } catch (e: any) {
                this.log.error(`Could not create non-secure ${this.config.type}-rpc client: ${e.message}`);
                return void this.restart();
            }

            // If we have bin-rpc, only need it here because bin-rpc cannot have https
            if (rpcClient.on) {
                rpcClient.on('error', (err: any) => {
                    this.log.error(`Socket error: ${err}`);
                });
            }
        } else if (!rpcClient) {
            this.getForeignObject('system.config', (err, obj) => {
                let password;
                let username;

                if (obj && obj.native && obj.native.secret) {
                    password = tools.decrypt(obj.native.secret, this.config.password || '');
                    username = tools.decrypt(obj.native.secret, this.config.username || '');
                } else {
                    password = tools.decrypt('Zgfr56gFe87jJOM', this.config.password || '');
                    username = tools.decrypt('Zgfr56gFe87jJOM', this.config.username || '');
                }

                try {
                    rpcClient = rpc.createSecureClient({
                        host: this.config.homematicAddress,
                        port: this.config.homematicPort,
                        path: this.homematicPath,
                        reconnectTimeout: this.config.reconnectInterval * 1_000,
                        basic_auth: { user: username, pass: password },
                        rejectUnauthorized: false
                    });
                } catch (e: any) {
                    this.log.error(`Could not create secure ${this.config.type}-rpc client: ${e.message}`);
                    return void this.restart();
                }
            });
        }

        this.connTimeout = undefined;
        this.log.debug('Connect...');
        if (this.eventInterval) {
            this.log.debug('clear ping interval');
            clearInterval(this.eventInterval);
            this.eventInterval = undefined;
        }

        if (isFirst) {
            this.sendInit();
        }

        // Periodically try to reconnect
        if (!this.connInterval) {
            this.log.debug('start connecting interval');
            this.connInterval = setInterval(() => this.sendInit(), this.config.reconnectInterval * 1_000);
        }
    }

    /**
     * Send ping to API, if error response, set status disconnected and try reconnect
     */
    private async sendPing(): Promise<void> {
        if (rpcClient) {
            this.log.debug('Send PING...');
            try {
                await this.rpcMethodCallAsync('ping', [clientId]);
                this.log.debug('PING ok');
            } catch (e: any) {
                this.log.error(`Ping error [${clientId}]: ${e.message}`);
                if (connected) {
                    this.log.info('Disconnected');
                    connected = false;
                    this.setState('info.connection', false, true);
                    this.connect(false);
                }
            }
        } else {
            this.log.warn('Called PING, but client does not exist');
            if (connected) {
                this.log.info('Disconnected');
                connected = false;
                this.setState('info.connection', false, true);
                this.connect(false);
            }
        }
    }

    /**
     * Keeps connection alive by pinging or reconnecting if ping is too old
     */
    private keepAlive(): void {
        this.log.debug('[KEEPALIVE] Check if connection is alive');

        if (this.connInterval) {
            clearInterval(this.connInterval);
            this.connInterval = undefined;
        }

        const _now = Date.now();
        // Check last event time. If timeout => send init again
        if (!this.lastEvent || _now - this.lastEvent >= this.config.checkInitInterval * 1_000) {
            this.log.debug('[KEEPALIVE] Connection timed out, initializing new connection');
            this.connect(false);
        } else {
            this.sendPing();
        }
    }

    /**
     * Sends init to RPC server
     */
    private async sendInit(): Promise<void> {
        try {
            if (rpcClient && (rpcClient.connected === undefined || rpcClient.connected)) {
                this.log.debug(
                    `${this.config.type}rpc -> ${this.config.homematicAddress}:${this.config.homematicPort}${
                        this.homematicPath
                    } init ${JSON.stringify([this.daemonURL, clientId])}`
                );
                await this.rpcMethodCallAsync('init', [this.daemonURL, clientId]);
                if (this.config.daemon === 'CUxD') {
                    try {
                        await this.getCuxDevices();
                        this.updateConnection();
                    } catch (e: any) {
                        this.log.error(`getCuxDevices error: ${e.message}`);
                    }
                } else {
                    this.updateConnection();
                }
            }
        } catch (e: any) {
            this.log.error(`Init not possible, going to stop: ${e.message}`);
            // setTimeout(() => this.stop && this.stop(), 30_000);
        }
    }

    /**
     * Inits the RPC server
     */
    private async initRpcServer(): Promise<void> {
        this.config.useHttps = this.config.useHttps || false;

        // adapterPort was introduced in v1.0.1. If not set yet then try 2000
        const desiredAapterPort = parseInt(this.config.port) || parseInt(this.config.homematicPort) || 2_000;
        const callbackAddress = this.config.callbackAddress || this.config.adapterAddress;
        const adapterPort = await this.getPortAsync(desiredAapterPort);
        this.daemonURL = `${this.daemonProto + callbackAddress}:${adapterPort}`;

        try {
            // somehow we cannot catch EADDRNOTAVAIL, also not with a cb here
            rpcServer = rpc.createServer({
                host: this.config.adapterAddress,
                port: adapterPort
            });
        } catch (e: any) {
            this.log.error(`Could not create RPC Server: ${e.message}`);
            return void this.restart();
        }

        // build up unique client id
        clientId = this.namespace;

        try {
            const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
            clientId = `${obj?.common?.host}:${clientId}`;
        } catch (e: any) {
            this.log.warn(`Could not get hostname, using default id "${clientId}" to register: ${e.message}`);
        }

        clientId += `:${randomBytes(16).toString('hex')}`;

        this.log.info(
            `${this.config.type}rpc server is trying to listen on ${this.config.adapterAddress}:${adapterPort}`
        );
        this.log.info(
            `${this.config.type}rpc client is trying to connect to ${this.config.homematicAddress}:${
                this.config.homematicPort
            }${this.homematicPath} with ${JSON.stringify([this.daemonURL, clientId])}`
        );

        this.connect(true);

        // Not found has special structure and no callback
        rpcServer.on('NotFound', (method: string, params: any) => {
            this.log.warn(
                `${this.config.type}rpc <- undefined method ${method} with parameters ${
                    typeof params === 'object' ? JSON.stringify(params).slice(0, 80) : params
                }`
            );
        });

        type RPCCallback = (err: any, res: any) => void;

        rpcServer.on('readdedDevice', (error: any, params: any, callback: RPCCallback) => {
            this.log.info(`Readded device ${JSON.stringify(params)}`);
            callback(null, '');
        });

        rpcServer.on('firmwareUpdateStatusChanged', (error: any, params: any, callback: RPCCallback) => {
            this.log.info(`Firmware update status of ${params[1]} changed to ${params[2]}`);
            callback(null, '');
        });

        rpcServer.on('replaceDevice', async (error: any, params: any[], callback: RPCCallback) => {
            const oldDeviceName = params[1];
            const newDeviceName = params[2];
            this.log.info(`Device "${oldDeviceName}" has been replaced by "${newDeviceName}"`);

            // remove the old device
            await this.deleteDeviceAsync(oldDeviceName);
            this.log.info(`Replaced device "${oldDeviceName}" deleted`);

            // add the new device
            this.log.info(`${this.config.type}rpc -> getDeviceDescription ${JSON.stringify([newDeviceName])}`);
            try {
                const res = await this.rpcMethodCallAsync('getDeviceDescription', [newDeviceName]);
                await this.createDevices([res]);
            } catch (e: any) {
                this.log.error(`Error while creating replacement device "${newDeviceName}": ${e.message}`);
            }

            callback(null, '');
        });

        rpcServer.on('error', (e: any) => {
            // not sure if this can really be triggered
            this.log.error(`RPC Server error: ${e.message}`);
        });

        rpcServer.on('system.multicall', (err: any, params: any, callback: RPCCallback) => {
            this.updateConnection();
            const response = [];
            const events: MulticallEvent[] = params[0];

            for (const param of events) {
                if (param.methodName === 'event') {
                    this.log.debug(`${this.config.type} multicall <${param.methodName}>: ${param.params}`);
                    response.push(this.methods[param.methodName](null, param.params));
                } else {
                    this.log.debug(`Unknown multicall event: ${param.methodName}: ${param.params}`);
                    response.push('');
                }
            }
            callback(null, response);
        });

        rpcServer.on('system.listMethods', (err: any, params: any, callback: RPCCallback) => {
            if (err) {
                this.log.warn(`Error on system.listMethods: ${err}`);
            }
            this.log.info(`${this.config.type}rpc <- system.listMethods ${JSON.stringify(params)}`);
            callback(null, [
                'event',
                'firmwareUpdateStatusChanged',
                'deleteDevices',
                'listDevices',
                'newDevices',
                'readdedDevice',
                'replaceDevice',
                'system.listMethods',
                'system.multicall',
                'setReadyConfig'
            ]);
        });

        rpcServer.on('event', (err: any, params: any, callback: RPCCallback) => {
            if (err) {
                this.log.warn(`Error on event: ${err}`);
            }
            this.updateConnection();
            try {
                callback(null, this.methods.event(err, params));
            } catch (e: any) {
                this.log.error(`Cannot send response to event: ${e.message}`);
            }
        });

        rpcServer.on('newDevices', async (err: any, params: any, callback: RPCCallback) => {
            if (err) {
                this.log.warn(`Error on newDevices: ${err}`);
            }

            let newDevices = params[1];

            if (!Array.isArray(newDevices)) {
                this.log.warn(`CCU delivered unexpected result (${params[1]}) on "newDevices": ${newDevices}`);
                newDevices = [];
            }

            this.log.info(`${this.config.type}rpc <- newDevices ${newDevices.length}`);

            // for a HmIP-adapter (and virtual-devices) we have to filter out the devices that
            // are already present if forceReinit is not set
            if (
                this.config.forceReInit === false &&
                (this.config.daemon === 'HMIP' || this.config.daemon === 'virtual-devices')
            ) {
                let doc;
                try {
                    doc = await this.getObjectViewAsync('hm-rpc', 'listDevices', {
                        startkey: `${this.namespace}.`,
                        endkey: `${this.namespace}.\u9999`
                    });
                } catch (e: any) {
                    this.log.error(`getObjectViewAsync hm-rpc: ${e.message}`);
                }

                if (doc?.rows) {
                    for (const row of doc.rows) {
                        if (row.id === `${this.namespace}.updated`) {
                            continue;
                        }

                        // lets get the device description
                        const val: ListDevicesEntry = row.value;

                        if (typeof val.ADDRESS === 'undefined') {
                            continue;
                        }

                        // lets find the current device in the newDevices array
                        // and if it doesn't exist we can delete it
                        let index = -1;
                        for (let j = 0; j < newDevices.length; j++) {
                            if (newDevices[j].ADDRESS === val.ADDRESS && newDevices[j].VERSION === val.VERSION) {
                                index = j;
                                break;
                            }
                        }

                        // if index is -1 than the newDevices doesn't have the
                        // device with address val.ADDRESS anymore, thus we can delete it
                        if (index === -1) {
                            if (val.ADDRESS && !this.config.dontDelete) {
                                if (val.ADDRESS.includes(':')) {
                                    const address = val.ADDRESS.replace(':', '.').replace(tools.FORBIDDEN_CHARS, '_');
                                    const parts = address.split('.');
                                    try {
                                        await this.deleteChannelAsync(parts[parts.length - 2], parts[parts.length - 1]);
                                        this.log.info(`obsolete channel ${address} ${JSON.stringify(address)} deleted`);
                                    } catch (e: any) {
                                        this.log.error(
                                            `Could not delete obsolete channel ${address} ${JSON.stringify(address)}: ${
                                                e.message
                                            }`
                                        );
                                    }
                                } else {
                                    try {
                                        await this.deleteDeviceAsync(val.ADDRESS);
                                        this.log.info(`obsolete device ${val.ADDRESS} deleted`);
                                    } catch (e: any) {
                                        this.log.error(`Could not delete obsolete device ${val.ADDRESS}: ${e.message}`);
                                    }
                                }
                            }
                        } else {
                            // we can remove the item at index because it is already registered
                            // to ioBroker
                            newDevices.splice(index, 1);
                        }
                    }
                }

                this.log.info(`new ${this.config.daemon} devices/channels after filter: ${newDevices.length}`);
                await this.createDevices(newDevices);
            } else {
                await this.createDevices(newDevices);
            }
            // call it otherwise HMIP won't work
            callback(null, '');
        });

        rpcServer.on('listDevices', async (err: any, params: any, callback: RPCCallback) => {
            if (err) {
                this.log.warn(`Error on listDevices: ${err}`);
            }
            this.log.info(`${this.config.type}rpc <- listDevices ${JSON.stringify(params)}`);
            let doc;
            try {
                doc = await this.getObjectViewAsync('hm-rpc', 'listDevices', {
                    startkey: `${this.namespace}.`,
                    endkey: `${this.namespace}.\u9999`
                });
            } catch (e: any) {
                this.log.error(`Error on listDevices (getObjectView): ${e.message}`);
            }

            const response = [];

            // we only fill the response if this isn't a force reinit and
            // if the adapter instance is not bothering with HmIP (which seems to work slightly different in terms of XMLRPC)
            if (!this.config.forceReInit && this.config.daemon !== 'HMIP' && doc && doc.rows) {
                for (const row of doc.rows) {
                    if (row.id === `${this.namespace}.updated`) {
                        continue;
                    }
                    const val: ListDevicesEntry = row.value;

                    if (val.ADDRESS) {
                        response.push({ ADDRESS: val.ADDRESS, VERSION: val.VERSION });
                    }
                }
            }
            this.log.info(`${this.config.type}rpc -> ${response.length} devices`);

            try {
                for (let r = response.length - 1; r >= 0; r--) {
                    if (!response[r].ADDRESS) {
                        this.log.warn(`${this.config.type}rpc -> found empty entry at position ${r}!`);
                        response.splice(r, 1);
                    }
                }

                callback(null, response);
            } catch (e: any) {
                this.log.error(`Cannot respond on listDevices: ${e.message}`);
                this.log.error(JSON.stringify(response));
            }
        });

        rpcServer.on('deleteDevices', (err: any, params: any, callback: RPCCallback) => {
            if (err) {
                this.log.warn(`Error on deleteDevices: ${err.message}`);
            }
            this.log.info(`${this.config.type}rpc <- deleteDevices ${params[1].length}`);
            for (let deviceName of params[1]) {
                if (deviceName.includes(':')) {
                    deviceName = deviceName.replace(':', '.').replace(tools.FORBIDDEN_CHARS, '_');
                    this.log.info(`channel ${deviceName} ${JSON.stringify(deviceName)} deleted`);
                    const parts = deviceName.split('.');
                    this.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
                } else {
                    this.log.info(`device ${deviceName} deleted`);
                    this.deleteDevice(deviceName);
                }
            }
            try {
                callback(null, '');
            } catch (e: any) {
                this.log.error(`Cannot response on deleteDevices: ${e.message}`);
            }
        });

        rpcServer.on('setReadyConfig', (err: any, params: any, callback: RPCCallback) => {
            if (err) {
                this.log.warn(`Error on setReadyConfig: ${err.message}`);
            }
            this.log.info(`${this.config.type}rpc <- setReadyConfig ${JSON.stringify(params)}`);
            try {
                callback(null, '');
            } catch (e: any) {
                this.log.error(`Cannot response on setReadyConfig: ${e.message}`);
            }
        });
    }

    /**
     * Adds the paramset objects of the given paramset to the given channel
     *
     * @param channel - channel object with at least "_id" property
     * @param paramset - paramset object retrived by CCU
     */
    private async addParamsetObjects(
        channel: ioBroker.SettableDeviceObject | ioBroker.SettableChannelObject,
        paramset: Record<string, ParamsetObjectWithSpecial>
    ): Promise<void> {
        for (const [key, paramObj] of Object.entries(paramset)) {
            tools.fixParamset({ paramObj, daemon: this.config.daemon });

            const obj: ioBroker.SettableStateObject = {
                type: 'state',
                common: {
                    name: key,
                    role: '', // will be filled
                    def: paramObj.DEFAULT,
                    type: this.COMMON_TYPE_MAPPING[paramObj.TYPE] || 'mixed',
                    read: !!(paramObj.OPERATIONS & 1),
                    write: !!(paramObj.OPERATIONS & 2)
                },
                native: paramObj
            };

            // Heating groups are send everything as string
            if (typeof obj.common.def === 'string' && obj.common.type === 'number') {
                obj.common.def = parseFloat(obj.common.def);
            }

            if (typeof obj.common.def === 'string' && obj.common.type === 'boolean') {
                obj.common.def = obj.common.def === 'true';
            }

            if (
                obj.common.type === 'number' &&
                typeof paramObj.MIN !== 'boolean' &&
                typeof paramObj.MAX !== 'boolean'
            ) {
                obj.common.min = typeof paramObj.MIN === 'string' ? parseFloat(paramObj.MIN) : paramObj.MIN;
                obj.common.max = typeof paramObj.MAX === 'string' ? parseFloat(paramObj.MAX) : paramObj.MAX;

                if (paramObj.TYPE === 'ENUM' && paramObj.VALUE_LIST) {
                    obj.common.states = {};
                    for (let i = 0; i < paramObj.VALUE_LIST.length; i++) {
                        obj.common.states[i] = paramObj.VALUE_LIST[i];
                    }
                }

                if (paramObj.SPECIAL) {
                    this.addCommonSpecial(paramObj, obj);
                }
            }

            if (paramObj.STATES) {
                obj.common.states = paramObj.STATES;
            }

            // temporary fix for https://github.com/eq-3/occu/issues/105 and LEVEL w. o. %
            if (
                key === 'LEVEL' &&
                typeof paramObj.MIN === 'number' &&
                typeof paramObj.MAX === 'number' &&
                paramObj.UNIT === undefined
            ) {
                paramObj.UNIT = '%';
            }

            if (paramObj.UNIT === '100%') {
                obj.common.unit = '%';
                // when unit is 100% we have min: 0, max: 1, we scale it between 0 and 100
                obj.common.max = 100;
            } else if (paramObj.UNIT !== '' && paramObj.UNIT !== '""') {
                obj.common.unit = paramObj.UNIT;
                if (obj.common.unit === '�C' || obj.common.unit === '&#176;C') {
                    obj.common.unit = '°C';
                } else if (obj.common.unit === '�F' || obj.common.unit === '&#176;F') {
                    obj.common.unit = '°F';
                }
            }

            if (metaRoles.dpCONTROL && metaRoles.dpCONTROL[obj.native.CONTROL]) {
                obj.common.role = metaRoles.dpCONTROL[obj.native.CONTROL];
            } else if (metaRoles.chTYPE_dpNAME && metaRoles.chTYPE_dpNAME[`${channel.native.TYPE}.${key}`]) {
                obj.common.role = metaRoles.chTYPE_dpNAME[`${channel.native.TYPE}.${key}`];
            } else if (metaRoles.dpNAME && metaRoles.dpNAME[key]) {
                obj.common.role = metaRoles.dpNAME[key];
            } else if (paramObj.TYPE === 'ACTION' && obj.common.write) {
                obj.common.role = 'button';
            }

            if (obj.common.role.includes('button') && !obj.common.write) {
                obj.common.write = true;
            }

            // sometimes min/max/def is string on hmip meta in combination with value_list
            // note, that there are cases (Virtual heating devices) which also provide min/max/def with
            // strings, but does not match entries in the value list, thus we have to check indexOf().
            if (paramObj.VALUE_LIST) {
                if (typeof paramObj.MIN === 'string') {
                    if (paramObj.VALUE_LIST.includes(paramObj.MIN)) {
                        obj.common.min = paramObj.VALUE_LIST.indexOf(paramObj.MIN);
                    } else {
                        obj.common.min = parseInt(paramObj.MIN);
                    }
                }
                if (typeof paramObj.MAX === 'string') {
                    if (paramObj.VALUE_LIST.includes(paramObj.MAX)) {
                        obj.common.max = paramObj.VALUE_LIST.indexOf(paramObj.MAX);
                    } else {
                        obj.common.max = parseInt(paramObj.MAX);
                    }
                }
                if (typeof paramObj.DEFAULT === 'string') {
                    if (paramObj.VALUE_LIST.includes(paramObj.DEFAULT)) {
                        obj.common.def = paramObj.VALUE_LIST.indexOf(paramObj.DEFAULT);
                    } else {
                        obj.common.def = parseInt(paramObj.DEFAULT);
                    }
                }
            }

            if (obj.common.role === 'state' && obj.common.write) {
                obj.common.role = 'switch';
            } else if (obj.common.role === 'level.color.hue') {
                obj.common.max = 200;
            } else if (obj.common.role === 'value.rssi') {
                obj.common.unit = 'dBm';
            } else if (obj.common.role === 'value.voltage') {
                obj.common.unit = 'V';
            } else if (obj.common.role === 'value.window' && paramObj.TYPE === 'BOOL') {
                // if its value.window but its a boolean it should be sensor.window
                obj.common.role = 'sensor.window';
            } else if (obj.common.role === 'value.temperature') {
                obj.common.unit = '°C';
            }

            if (paramObj.OPERATIONS & 8) {
                obj.common.role = 'indicator.service';
            }

            if (typeof obj.common.role !== 'string' && typeof obj.common.role !== 'undefined') {
                throw new Error(`typeof obj.common.role ${typeof obj.common.role}`);
            }
            const dpID = `${this.namespace}.${channel._id}.${key}`;

            this.dpTypes[dpID] = {
                UNIT: paramObj.UNIT,
                TYPE: paramObj.TYPE
            };

            if (typeof paramObj.MIN === 'number') {
                this.dpTypes[dpID].MIN = paramObj.MIN;
                this.dpTypes[dpID].MAX = paramObj.MAX;
                // Humidity is from 0 to 99. It is wrong.
                if (this.dpTypes[dpID].MAX === 99) {
                    this.dpTypes[dpID].MAX = 100;
                }
            }

            if (key === 'LEVEL' && paramset.WORKING) {
                obj.common.workingID = 'WORKING';
            }

            try {
                const res = await this.extendObjectAsync(`${channel._id}.${key}`, obj);
                this.log.debug(`object ${res.id} extended`);
            } catch (e: any) {
                this.log.error(`Could not extend object ${channel._id}.${key}: ${e.message}`);
            }
        }
    }

    /**
     * This method just performs an async rpc method call
     *
     * @param method the method name
     * @param params the method specific parameters
     */
    private rpcMethodCallAsyncHelper(method: string, params: any[]): Promise<any> {
        return new Promise((resolve, reject) => {
            rpcClient.methodCall(method, params, (err: any, res: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
        });
    }

    /**
     * Async variant of method call which also performs a retry on first error of "setValue"
     *
     * @param method the method name
     * @param params the method specific parameters
     */
    private async rpcMethodCallAsync(method: string, params: any[]): Promise<any> {
        try {
            const res = await this.rpcMethodCallAsyncHelper(method, params);
            return res;
        } catch (e: any) {
            if (method === 'setValue' && (e.message.endsWith('Failure') || e.message.endsWith('(UNREACH)'))) {
                this.log.info(
                    `Temporary error occurred for "${method}" with "${JSON.stringify(params)}": ${e.message}`
                );
                // on random error due to temporary communication issues try again once after some ms
                await wait(this.RETRY_DELAY_MS);
                return this.rpcMethodCallAsyncHelper(method, params);
            } else {
                throw e;
            }
        }
    }

    /**
     * Control the EPAPER display
     *
     * @param id
     * @param data
     */
    private async controlEPaper(id: string, data: any): Promise<void> {
        const tmp = id.split('.');
        tmp[3] = '3';
        tmp[4] = 'SUBMIT';

        const val = tools.combineEPaperCommand(
            data.lines,
            data.signal || '0xF0',
            data.tone || '0xC0',
            data.repeats,
            data.offset
        );

        try {
            if (rpcClient && connected) {
                await this.rpcMethodCallAsync('setValue', [`${tmp[2]}:${tmp[3]}`, tmp[4], val]);
            } else {
                this.log.warn(`Cannot setValue "${id}", because not connected.`);
            }
        } catch (e: any) {
            this.log.error(
                `${this.config.type}rpc -> setValue ${JSON.stringify([`${tmp[2]}:${tmp[3]}`, tmp[4], val])}`
            );
            this.log.error(`Cannot call setValue: ${e.message}`);
        }
    }

    /**
     * Read signal from EPAPER display
     *
     * @param id
     */
    private async readSignals(id: string): Promise<void> {
        displays[id] = null;
        const data: Record<string, any> = {
            lines: [{}, {}, {}],
            signal: '0xF0',
            tone: '0xC0'
        };

        const promises = [];

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_LINE2`, (err, state) => {
                    data.lines[0].line = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_ICON2`, (err, state) => {
                    data.lines[0].icon = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_LINE3`, (err, state) => {
                    data.lines[1].line = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_ICON3`, (err, state) => {
                    data.lines[1].icon = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_LINE4`, (err, state) => {
                    data.lines[2].line = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_ICON4`, (err, state) => {
                    data.lines[2].icon = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_SIGNAL`, (err, state) => {
                    data.signal = state ? state.val || '0xF0' : '0xF0';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_TONE`, (err, state) => {
                    data.tone = state ? state.val || '0xC0' : '0xC0';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_TONE_INTERVAL`, (err, state) => {
                    data.offset = state ? state.val : 10;
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_TONE_REPETITIONS`, (err, state) => {
                    data.repeats = state ? state.val : 1;
                    resolve();
                });
            })
        );

        await Promise.all(promises);
        this.controlEPaper(id, data);
    }

    /**
     * Read the settings from EPAPER display
     *
     * @param id
     */
    private async readSettings(id: string): Promise<void> {
        displays[id] = null;
        const data: Record<string, any> = {
            lines: [{}, {}, {}],
            signal: '0xF0',
            tone: '0xC0'
        };

        const promises = [];

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_LINE2`, (err, state) => {
                    data.lines[0].line = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_ICON2`, (err, state) => {
                    data.lines[0].icon = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_LINE3`, (err, state) => {
                    data.lines[1].line = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_ICON3`, (err, state) => {
                    data.lines[1].icon = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_LINE4`, (err, state) => {
                    data.lines[2].line = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        promises.push(
            new Promise<void>(resolve => {
                this.getForeignState(`${id}.0.EPAPER_ICON4`, (err, state) => {
                    data.lines[2].icon = state ? state.val || '' : '';
                    resolve();
                });
            })
        );

        await Promise.all(promises);
        this.controlEPaper(id, data);
    }

    /**
     * Get value paramsets and add them
     *
     * @param valueParamsets
     */
    private async getValueParamsets(
        valueParamsets: (ioBroker.SettableDeviceObject | ioBroker.SettableChannelObject)[]
    ): Promise<void> {
        for (const obj of valueParamsets) {
            try {
                const cid = `${obj.native.PARENT_TYPE}.${obj.native.TYPE}.${obj.native.VERSION}`;

                this.log.debug(`getValueParamsets ${cid}`);

                // if meta values are cached for E-paper we extend this cached meta values by e-paper states
                if (obj.native && obj.native.PARENT_TYPE === 'HM-Dis-EP-WM55' && obj.native.TYPE === 'MAINTENANCE') {
                    this.addEPaperToMeta();
                }

                this.log.info(
                    `${this.config.type}rpc -> getParamsetDescription ${JSON.stringify([obj.native.ADDRESS, 'VALUES'])}`
                );

                this.metaValues[cid] = await this.rpcMethodCallAsync('getParamsetDescription', [
                    obj.native.ADDRESS,
                    'VALUES'
                ]);

                if (obj.native && obj.native.PARENT_TYPE === 'HM-Dis-EP-WM55' && obj.native.TYPE === 'MAINTENANCE') {
                    this.addEPaperToMeta();
                }

                // @ts-expect-error we will fix it
                await this.addParamsetObjects(obj, this.metaValues[cid]);
            } catch (e: any) {
                this.log.error(`Error on getParamsetDescription for [${obj.native.ADDRESS}, 'VALUES']": ${e.message}`);
            }
        }

        if (valueParamsets.length) {
            // reset
            // Inform hm-rega about new devices
            try {
                await this.setStateAsync('updated', true, false);
            } catch (e: any) {
                this.log.error(`Could not inform hm-rega about new devices: ${e.message}`);
            }
            // If it has been a force reinit run, set it to false and restart
            if (this.config.forceReInit) {
                this.log.info('Restarting now, because we had a forced reinitialization run');
                try {
                    await this.extendForeignObjectAsync(`system.adapter.${this.namespace}`, {
                        native: { forceReInit: false }
                    });
                } catch (e: any) {
                    this.log.error(`Could not restart and set forceReinit to false: ${e.message}`);
                }
            }
        }
    }

    /**
     * Add EPAPER to meta objects
     */
    private addEPaperToMeta(): void {
        // Check all versions from 9 to 12
        for (let i = 9; i < 13; i++) {
            const id = `HM-Dis-EP-WM55.MAINTENANCE.${i}`;
            if (!this.metaValues[id] || !this.metaValues[id].EPAPER_LINE2) {
                // Add the EPAPER States to the Maintenance channel if they are non-existent
                this.metaValues[id] = this.metaValues[id] || {};

                this.log.debug(`[EPAPER] Add E-Paper to Meta on ${JSON.stringify(this.metaValues[id])}`);

                const obj = this.metaValues[id];

                obj.EPAPER_LINE2 = {
                    TYPE: 'EPAPER_LINE',
                    ID: 'LINE2',
                    OPERATIONS: 2
                };
                obj.EPAPER_ICON2 = {
                    TYPE: 'EPAPER_ICON',
                    ID: 'ICON2',
                    STATES: {
                        '': 'Empty',
                        '0x80': 'OFF',
                        '0x81': 'ON',
                        '0x82': 'Opened',
                        '0x83': 'Closed',
                        '0x84': 'error',
                        '0x85': 'All OK',
                        '0x86': 'Information',
                        '0x87': 'New message',
                        '0x88': 'Service message'
                    },
                    OPERATIONS: 2
                };
                obj.EPAPER_LINE3 = {
                    TYPE: 'EPAPER_LINE',
                    ID: 'LINE3',
                    OPERATIONS: 2
                };
                obj.EPAPER_ICON3 = {
                    TYPE: 'EPAPER_ICON',
                    ID: 'ICON3',
                    STATES: {
                        '': 'Empty',
                        '0x80': 'OFF',
                        '0x81': 'ON',
                        '0x82': 'Opened',
                        '0x83': 'Closed',
                        '0x84': 'error',
                        '0x85': 'All OK',
                        '0x86': 'Information',
                        '0x87': 'New message',
                        '0x88': 'Service message'
                    },
                    OPERATIONS: 2
                };
                obj.EPAPER_LINE4 = {
                    TYPE: 'EPAPER_LINE',
                    ID: 'LINE4',
                    OPERATIONS: 2
                };
                obj.EPAPER_ICON4 = {
                    TYPE: 'EPAPER_ICON',
                    ID: 'ICON4',
                    STATES: {
                        '': 'Empty',
                        '0x80': 'OFF',
                        '0x81': 'ON',
                        '0x82': 'Opened',
                        '0x83': 'Closed',
                        '0x84': 'error',
                        '0x85': 'All OK',
                        '0x86': 'Information',
                        '0x87': 'New message',
                        '0x88': 'Service message'
                    },
                    OPERATIONS: 2
                };
                obj.EPAPER_SIGNAL = {
                    TYPE: 'EPAPER_SIGNAL',
                    ID: 'EPAPER_SIGNAL',
                    STATES: {
                        '0xF0': 'OFF',
                        '0xF1': 'Red blink',
                        '0xF2': 'Green blink',
                        '0xF3': 'Orange blink'
                    },
                    OPERATIONS: 2
                };
                obj.EPAPER_TONE = {
                    TYPE: 'EPAPER_TONE',
                    ID: 'EPAPER_TONE',
                    STATES: {
                        '0xC0': 'Off',
                        '0xC1': 'Long Long',
                        '0xC2': 'Long Short',
                        '0xC3': 'Long Short Short',
                        '0xC4': 'Short',
                        '0xC5': 'Short Short',
                        '0xC6': 'Long'
                    },
                    OPERATIONS: 2
                };
                obj.EPAPER_TONE_INTERVAL = {
                    TYPE: 'EPAPER_TONE_INTERVAL',
                    ID: 'EPAPER_TONE_INTERVAL',
                    MIN: 10,
                    MAX: 160,
                    OPERATIONS: 2,
                    DEFAULT: 10
                };
                obj.EPAPER_TONE_REPETITIONS = {
                    TYPE: 'EPAPER_TONE_REPETITIONS',
                    ID: 'EPAPER_TONE_REPETITIONS',
                    MIN: 0,
                    MAX: 15,
                    OPERATIONS: 2,
                    DEFAULT: 1
                };
            }
        }
    }

    /**
     * Create the devices delivered in the device array
     *
     * @param deviceArr - array of devices
     */
    private async createDevices(deviceArr: any[]): Promise<void> {
        const queueValueParamsets: (ioBroker.SettableDeviceObject | ioBroker.SettableChannelObject)[] = [];
        for (const device of deviceArr) {
            if (typeof device.ADDRESS !== 'string') {
                // check that ADDRESS is given, else we don't know the id
                this.log.error(`Device has no valid property ADDRESS: ${JSON.stringify(device)}`);
                continue;
            }

            let type: 'device' | 'channel';
            let role: string | undefined;
            let icon: string | undefined;

            if (device.PARENT) {
                type = 'channel';
                role =
                    metaRoles.chTYPE && metaRoles.chTYPE[device.TYPE]
                        ? metaRoles.chTYPE && metaRoles.chTYPE[device.TYPE]
                        : undefined;
            } else {
                type = 'device';
                if (!images[device.TYPE]) {
                    this.log.warn(`No image for "${device.TYPE}" found.`);
                }

                icon = images[device.TYPE] ? `/icons/${images[device.TYPE]}` : '';
            }

            const id = device.ADDRESS.replace(':', '.').replace(tools.FORBIDDEN_CHARS, '_');
            const obj: ioBroker.SettableChannelObject | ioBroker.SettableDeviceObject = {
                _id: id,
                type: type,
                common: {
                    name: device.ADDRESS,
                    role: role
                },
                native: device
            };

            if (icon) {
                obj.common.icon = icon;
            }

            const dpID = `${this.namespace}.${obj._id}`;

            this.dpTypes[dpID] = {
                UNIT: device.UNIT,
                TYPE: device.TYPE
            };

            if (typeof device.MIN === 'number') {
                this.dpTypes[dpID].MIN = device.MIN;
                this.dpTypes[dpID].MAX = device.MAX;

                // e. g. Humidity is from 0 to 99. It is wrong. todo: logically ok, but is it? Can a sensor deliver 100 % humidity?
                if (this.dpTypes[dpID].MAX === 99) {
                    this.dpTypes[dpID].MAX = 100;
                }
            }

            if (metaRoles.dvTYPE && obj.native && metaRoles.dvTYPE[device.PARENT_TYPE]) {
                obj.common.role = metaRoles.dvTYPE[device.PARENT_TYPE];
            }

            try {
                const res = await this.setObjectAsync(id, obj);
                this.log.debug(`object ${res.id} created`);
            } catch (e: any) {
                this.log.error(`object ${id} error on creation: ${e.message}`);
            }

            if (obj.type === 'channel') {
                queueValueParamsets.push(obj);
            }
        }

        await this.getValueParamsets(queueValueParamsets);
    }

    /**
     * Get all CuxD devices
     */
    private async getCuxDevices(): Promise<void> {
        if (rpcClient) {
            // request devices from CUxD
            try {
                let newDevices = await this.rpcMethodCallAsync('listDevices', []);

                if (!Array.isArray(newDevices)) {
                    this.log.warn(`CuxD delivered unexpected result on "listDevices": ${newDevices}`);
                    newDevices = [];
                }

                this.log.info(`${this.config.type}rpc -> listDevices ${newDevices.length}`);

                if (this.config.forceReInit === false) {
                    let doc;
                    try {
                        doc = await this.getObjectViewAsync('hm-rpc', 'listDevices', {
                            startkey: `${this.namespace}.`,
                            endkey: `${this.namespace}.\u9999`
                        });
                    } catch (e: any) {
                        this.log.error(`getObjectView hm-rpc: ${e.message}`);
                    }

                    if (doc && doc.rows) {
                        for (const row of doc.rows) {
                            if (row.id === `${this.namespace}.updated`) {
                                continue;
                            }

                            // lets get the device description
                            const val: ListDevicesEntry = row.value;

                            if (typeof val.ADDRESS === 'undefined') {
                                continue;
                            }

                            // lets find the current device in the newDevices array
                            // and if it doesn't exist we can delete it
                            let index = -1;
                            for (let j = 0; j < newDevices.length; j++) {
                                if (newDevices[j].ADDRESS === val.ADDRESS && newDevices[j].VERSION === val.VERSION) {
                                    index = j;
                                    break;
                                }
                            }

                            // if index is -1 than the newDevices doesn't have the
                            // device with address val.ADDRESS anymore, thus we can delete it
                            if (index === -1) {
                                if (val.ADDRESS && !this.config.dontDelete) {
                                    if (val.ADDRESS.includes(':')) {
                                        const address = val.ADDRESS.replace(':', '.').replace(
                                            tools.FORBIDDEN_CHARS,
                                            '_'
                                        );
                                        const parts = address.split('.');
                                        this.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
                                        this.log.info(`obsolete channel ${address} ${JSON.stringify(address)} deleted`);
                                    } else {
                                        this.deleteDevice(val.ADDRESS);
                                        this.log.info(`obsolete device ${val.ADDRESS} deleted`);
                                    }
                                }
                            } else {
                                // we can remove the item at index because it is already registered
                                // to ioBroker
                                newDevices.splice(index, 1);
                            }
                        }
                    }
                    this.log.info(`new CUxD devices/channels after filter: ${newDevices.length}`);
                    await this.createDevices(newDevices);
                } else {
                    await this.createDevices(newDevices);
                }
            } catch (e: any) {
                this.log.error(`Cannot call listDevices: ${e.message}`);
            }
        }
    }

    /**
     * Update the connection indicator and ensure ping interval is running
     */
    private updateConnection(): void {
        this.lastEvent = new Date().getTime();

        if (!connected) {
            this.log.info('Connected');
            connected = true;
            this.setState('info.connection', true, true);
        }

        if (this.connInterval) {
            this.log.debug('clear connecting interval');
            clearInterval(this.connInterval);
            this.connInterval = undefined;
        }
        if (this.connTimeout) {
            this.log.debug('clear connecting timeout');
            clearTimeout(this.connTimeout);
            this.connTimeout = undefined;
        }

        // Virtual Devices API does now also support PING (tested with 3.55.5.20201226 - see #308)
        if (!this.eventInterval) {
            this.log.debug('start ping interval');
            this.eventInterval = setInterval(() => this.keepAlive(), (this.config.checkInitInterval * 1000) / 2);
        }
    }

    /**
     * Derives the common properties of a Paramset SPECIAL attribute
     *
     * @param paramObj Paramset Object with SPECIAL property
     * @param obj ioBroker state object which will be extended
     */
    private addCommonSpecial(paramObj: ParamsetObjectWithSpecial, obj: ioBroker.SettableStateObject): void {
        if (typeof obj.common.states !== 'object' || Array.isArray(obj.common.states)) {
            obj.common.states = {};
        }

        for (const entry of paramObj.SPECIAL) {
            obj.common.states[entry.VALUE] = entry.ID;
            // see issue #459, SPECIAL can be outside of min/max, we have to adapt
            const realVal = paramObj.UNIT === '100%' ? entry.VALUE * 100 : entry.VALUE;

            if (obj.common.min !== undefined && realVal < obj.common.min) {
                obj.common.min = realVal;
            }

            if (obj.common.max !== undefined && realVal > obj.common.max) {
                obj.common.max = realVal;
            }
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new HomematicRpc(options);
} else {
    // otherwise start the instance directly
    (() => new HomematicRpc())();
}
