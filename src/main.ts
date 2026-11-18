import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import { images } from './lib/images';
import * as tools from './lib/tools';
import { TransitionFilter } from './lib/transitionFilter';
import { metaRoles } from './lib/roles';

import type {
    ParamsetObjectWithSpecial,
    ParamsetObject,
    DatapointTypeObject,
    MulticallEvent,
    ListDevicesEntry,
} from './lib/_types';

import { dmHmRpc } from './lib/deviceManager';
import type { Line } from './lib/tools';
import {
    freeUsedPort,
    registerUsedPort,
    reportPortConflict,
    WILDCARD_ADDRESSES,
    type UsedTcpPort,
} from './lib/usedResources';

let connected = false;
const displays: Record<string, { timer: ioBroker.Timeout | undefined; withTone: boolean } | null> = {};
/** Channels which wait to send HUE and SATURATION together, see `sendColor` */
const colorChannels: Record<string, ioBroker.Timeout | undefined> = {};

let clientId: string;

let rpc: any;
let rpcClient: any;

let rpcServer: any;

export class HomematicRpc extends Adapter {
    /** On failed rpc call retry in X ms */
    private readonly RETRY_DELAY_MS = 150;
    /** On RPC server error (e.g. address not available) restart the adapter after X ms */
    private readonly SERVER_RESTART_DELAY_MS = 30_000;
    private serverRestartTimer?: ioBroker.Timeout;
    /** Register again at most every X ms, if events with an outdated interface id of this instance arrive */
    private readonly STALE_ID_REINIT_DELAY_MS = 5 * 60_000;
    private lastStaleIdReinit = 0;
    /** Outdated interface ids, which already caused a registration. Never cleared, else the re-init loop starts again */
    private readonly staleClientIds = new Set<string>();
    /** Outdated interface ids, which still arrive after the registration and were reported on info level */
    private readonly reportedStaleClientIds = new Set<string>();
    /** `<host>:<namespace>:`, every interface id of this instance starts with it */
    private clientIdPrefix = '';
    private readonly metaValues: Record<string, ParamsetObject> = {};
    private readonly dpTypes: Record<string, DatapointTypeObject> = {};
    /** holds back interim LEVEL values of moving channels, if `suppressTransitionalLevel` is enabled */
    private transitionFilter: TransitionFilter | null = null;
    private lastEvent = 0;
    private eventInterval?: ioBroker.Interval;
    private connInterval?: ioBroker.Interval;
    private daemonURL = '';
    private daemonProto = '';
    private homematicPath: string | undefined;
    /** The callback port reported to the host while the RPC server holds it */
    private usedCallbackPort: UsedTcpPort | undefined;
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
        EPAPER_TONE_REPETITIONS: 'number',
    } as const;

    private deviceManagement: dmHmRpc | undefined;

    /** admin/icons sits next to build/ in the installed package */
    private readonly iconDir = join(__dirname, '..', 'admin', 'icons');
    /** icon file -> `common.icon` value, so each SVG is read from disk only once */
    private readonly iconCache = new Map<string, string>();

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
            let val: string | number | boolean | undefined | null;
            // CUxD ignores all prefixes!!
            if (params[0] === 'CUxD' || !params[0].includes(this.name)) {
                params[0] = this.namespace;
            }
            const channel = params[1].replace(':', '.').replace(tools.FORBIDDEN_CHARS, '_');
            if (params[0] === clientId) {
                // convert back our clientId to our namespace
                params[0] = this.namespace;
            } else if (this.clientIdPrefix && params[0].startsWith(this.clientIdPrefix)) {
                // id of an outdated registration of this instance, left over after an unclean stop (#1542)
                this.onStaleClientId(params[0]);
                return '';
            }
            const name = `${params[0]}.${channel}.${params[2]}`;

            if (this.dpTypes[name]) {
                if (this.dpTypes[name].UNIT === '100%') {
                    val = Math.round(params[3] * 1_000) / 10;
                } else {
                    val = params[3];
                }
            } else if (params[2] === 'PONG') {
                // answer to our ping, it does not belong to a device (#964)
                this.log.debug(`${this.config.type}rpc <- PONG received`);
                return '';
            } else {
                // for every device we know (listDevices), there will be a dpType, so this way we filter out stuff like https://github.com/ioBroker/ioBroker.hm-rpc/issues/298
                this.log.debug(`${this.config.type}rpc <- event: ${name}:${params[3]} discarded, no matching device`);
                return '';
            }

            val = tools.fixEvent({ val, dpType: this.dpTypes[name] });

            this.log.debug(
                `${name} ==> UNIT: "${this.dpTypes[name] ? this.dpTypes[name].UNIT : 'none'}" (min: ${
                    this.dpTypes[name] ? this.dpTypes[name].MIN : 'none'
                }, max: ${this.dpTypes[name] ? this.dpTypes[name].MAX : 'none'}) From "${params[3]}" => "${val}"`,
            );

            if (this.transitionFilter?.handle(channel, params[2], val)) {
                // held back or dropped: interim LEVEL of a moving channel
                return '';
            }

            this.setStateAsync(`${channel}.${params[2]}`, { val: val, ack: true }).catch(e =>
                this.log.error(`Cannot set state ${name}: ${e.message}`),
            );
            // unfortunately, this is necessary
            return '';
        },
    };

    constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'hm-rpc',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    /**
     * Build the `common.icon` value for a device type: the icon SVG inlined as a
     * data URI, or '' when the type has no icon.
     *
     * The admin renders a `data:image/svg` icon through react-inlinesvg, so the
     * markup lands in the DOM and the SVG's `fill="currentColor"` follows the
     * active theme. A file path would be rendered in an `<img>` instead, where the
     * theme colour cannot reach it — which is why the icon is inlined and not
     * linked. See src/utils/svgify.ts.
     *
     * @param type - the device TYPE reported by the CCU
     */
    private getIcon(type: string): string {
        const file = images[type];
        if (!file) {
            return '';
        }
        let icon = this.iconCache.get(file);
        if (icon === undefined) {
            try {
                const svg = readFileSync(join(this.iconDir, file), 'utf8');
                icon = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
            } catch (e: unknown) {
                this.log.warn(`Could not read icon "${file}": ${(e as Error).message}`);
                icon = '';
            }
            this.iconCache.set(file, icon);
        }
        return icon;
    }

    /**
     * Re-apply the device icon to already-created device objects. A device object
     * is only written when the device is first added, so devices that were created
     * before their type had an icon mapping keep an empty icon even after the map
     * is updated. This idempotent pass sets the icon from the current map on
     * existing devices; it only writes when the icon actually differs.
     */
    private async migrateDeviceIcons(): Promise<void> {
        let updated = 0;
        try {
            const objects = await this.getForeignObjectsAsync(`${this.namespace}.*`, 'device');
            for (const [id, obj] of Object.entries(objects)) {
                const type = (obj?.native as { TYPE?: string } | undefined)?.TYPE;
                if (!type || !images[type]) {
                    continue;
                }
                const icon = this.getIcon(type);
                if (!icon || obj.common?.icon === icon) {
                    continue;
                }
                await this.extendObjectAsync(id, { common: { icon } });
                updated++;
            }
        } catch (e: unknown) {
            this.log.warn(`Could not update existing device icons: ${(e as Error).message}`);
            return;
        }
        if (updated) {
            this.log.info(`Updated the icon of ${updated} existing device(s).`);
        }
    }

    private async onReady(): Promise<void> {
        this.deviceManagement = new dmHmRpc(this);

        if (this.config.suppressTransitionalLevel) {
            this.transitionFilter = new TransitionFilter({
                write: (id, val) =>
                    this.setStateAsync(id, { val, ack: true }).catch(e =>
                        this.log.error(`Cannot set state ${id}: ${e.message}`),
                    ),
                hasFlag: channelId =>
                    !!this.dpTypes[`${this.namespace}.${channelId}.WORKING`] ||
                    !!this.dpTypes[`${this.namespace}.${channelId}.PROCESS`],
                setTimeout: (cb, ms) => this.setTimeout(cb, ms),
                clearTimeout: timer => this.clearTimeout(timer as ioBroker.Timeout),
                log: msg => this.log.debug(msg),
            });
            this.log.info('Interim LEVEL values of moving channels are suppressed');
        }

        this.subscribeStates('*');

        // #1003: CCU-Jack serves its virtual devices on /RPC3 (/RPC2 is taken by the callbacks of the CCU)
        this.homematicPath =
            this.config.daemon === 'virtual-devices' ? '/groups/' : this.config.daemon === 'CCU-Jack' ? '/RPC3' : '/';

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

        await this.setState('info.connection', false, true);

        await this.migrateDeviceIcons();

        // #1349: CUxD supports only BIN-RPC, HomeMatic IP, Virtual Devices and CCU-Jack only XML-RPC
        const requiredType =
            this.config.daemon === 'CUxD'
                ? 'bin'
                : this.config.daemon === 'HMIP' ||
                    this.config.daemon === 'virtual-devices' ||
                    this.config.daemon === 'CCU-Jack'
                  ? 'xml'
                  : undefined;
        if (requiredType && this.config.type !== requiredType) {
            this.log.warn(
                `${this.config.daemon} supports only ${requiredType === 'bin' ? 'BIN-RPC' : 'XML-RPC'}, the configured protocol is ignored`,
            );
            this.config.type = requiredType;
        }

        if (this.config.type === 'bin') {
            rpc = await import('binrpc');
            this.daemonProto = 'xmlrpc_bin://';
        } else {
            // @ts-expect-error no types
            rpc = await import('homematic-xmlrpc');
            this.config.type = 'xml';
            this.daemonProto = 'http://';
        }

        if (rpc.default) {
            rpc = rpc.default;
        }

        // Clean up objects if still hm-rpc.meta exist
        try {
            const doc = await this.getObjectListAsync({
                startkey: 'hm-rpc.meta',
                endkey: 'hm-rpc.meta\u9999',
            });

            if (doc && doc.rows) {
                if (doc.rows.length >= 50) {
                    this.log.info('Cleaning up meta folder... this may take some time');
                }

                for (const row of doc.rows) {
                    try {
                        await this.delForeignObjectAsync(row.id);
                    } catch (e: unknown) {
                        this.log.warn(`Could not delete ${row.id}: ${(e as Error).message}`);
                    }
                }
            }
        } catch (e: unknown) {
            this.log.error(`getObjectListAsync hm-rpc: ${(e as Error).message}`);
        }

        try {
            const res = await this.getObjectViewAsync('system', 'state', {
                startkey: `${this.namespace}.`,
                endkey: `${this.namespace}.\u9999`,
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
                            TYPE: obj.native.TYPE,
                        };

                        if (Array.isArray(obj.native.VALUE_LIST)) {
                            this.dpTypes[row.id].VALUE_LIST = obj.native.VALUE_LIST;
                        }

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
        } catch (e: unknown) {
            this.log.error(`Could not get state view on start: ${(e as Error).message}`);
        }

        // Start Adapter
        await this.initRpcServer();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback call this in any case, it is necessary to clean up the adapter correctly
     */
    private async onUnload(callback: () => void): Promise<void> {
        try {
            this.transitionFilter?.clear();

            if (this.eventInterval) {
                this.clearInterval(this.eventInterval);
                this.eventInterval = undefined;
            }

            if (this.connInterval) {
                this.clearInterval(this.connInterval);
                this.connInterval = undefined;
            }

            if (this.config && rpcClient) {
                // tell CCU that we are no longer the client under this URL
                const deinitParams = this.getDeinitParams();
                this.log.info(
                    `${this.config.type}rpc -> ${this.config.homematicAddress}:${this.config.homematicPort}${
                        this.homematicPath
                    } init ${JSON.stringify(deinitParams)}`,
                );
                try {
                    await this.rpcMethodCallAsync('init', deinitParams);
                } catch (e: unknown) {
                    this.log.error(`Cannot call init: ${JSON.stringify(deinitParams)} ${(e as Error).message}`);
                }

                if (connected) {
                    this.log.info('Disconnected');
                    connected = false;
                    await this.setState('info.connection', false, true);
                }
            }

            await this.closeRpc();
        } catch (e: unknown) {
            if (this.log) {
                this.log.error(`Unload error: ${(e as Error).message}`);
            } else {
                console.log(`Unload error: ${(e as Error).message}`);
            }
        }

        if (typeof callback === 'function') {
            callback();
        }
    }

    /**
     * Deletes a device or channel object with all its children (replaces the deprecated deleteDevice/deleteChannel)
     *
     * @param id - device or channel ID relative to the namespace
     */
    private async deleteObjectTree(id: string): Promise<void> {
        const obj = await this.getObjectAsync(id);
        if (obj?.type === 'device' || obj?.type === 'channel') {
            await this.delObjectAsync(id, { recursive: true });

            // #1419: without this, events of the deleted device would still be written and warn about the
            // missing objects until the adapter is restarted
            const prefix = `${this.namespace}.${id}.`;
            for (const dpId of Object.keys(this.dpTypes)) {
                if (dpId.startsWith(prefix)) {
                    delete this.dpTypes[dpId];
                }
            }
        }
    }

    /**
     * Closes the RPC client and the RPC server
     */
    private async closeRpc(): Promise<void> {
        // bin-rpc: destroys the socket and stops reconnecting, xml-rpc client has nothing to close
        if (typeof rpcClient?.close === 'function') {
            try {
                rpcClient.close();
            } catch {
                // ignore
            }
        }

        if (typeof rpcServer?.close === 'function') {
            try {
                // closes open connections too, so it resolves without waiting for the CCU
                await rpcServer.close();
            } catch {
                // ignore, e.g. server was never listening
            }
        }

        await this.freeCallbackPort();
    }

    /**
     * Take the reported callback port back.
     *
     * Needed whenever the RPC server gives the port up while the adapter keeps running - on a
     * restart of the server, or when it never got it. On shutdown this is not required, the host
     * releases the entries of a stopped instance by itself.
     */
    private async freeCallbackPort(): Promise<void> {
        if (!this.usedCallbackPort) {
            return;
        }
        const { port, bind } = this.usedCallbackPort;
        this.usedCallbackPort = undefined;
        // Filtered by port and address only: the family was derived from the address, and a filter
        // naming a field the entry does not have matches nothing.
        await freeUsedPort(this, { port, bind });
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

        if (id === `${this.namespace}.updated` || /_ALARM$/.test(id) || id.endsWith('.0.FIRMWARE_UPDATE_STATE')) {
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

        const channelId = `${tmp[0]}.${tmp[1]}.${tmp[2]}.${tmp[3]}`;

        // #1108: HMIP devices like HmIP-RGBW answer a single setValue of HUE or SATURATION with
        // MISSING_NON_OPTIONAL_PARAMETER, they want both values in one putParamset
        if (
            (tmp[4] === 'HUE' || tmp[4] === 'SATURATION') &&
            this.dpTypes[`${channelId}.HUE`] &&
            this.dpTypes[`${channelId}.SATURATION`]
        ) {
            if (colorChannels[channelId]) {
                this.clearTimeout(colorChannels[channelId]);
            }
            // collect both values, if they are written shortly after each other
            colorChannels[channelId] = this.setTimeout(() => this.sendColor(channelId), 300);
            return;
        }

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
            if (displays[_id]?.timer) {
                clearTimeout(displays[_id].timer);
                if (displays[_id].withTone) {
                    displays[_id] = { timer: this.setTimeout(() => this.readSignals(_id), 300), withTone: true };
                    return;
                }
            }
            displays[_id] = { timer: this.setTimeout(() => this.readSettings(_id), 300), withTone: false };
            return;
        } else if (type === 'EPAPER_SIGNAL' || type === 'EPAPER_TONE') {
            const _id = `${tmp[0]}.${tmp[1]}.${tmp[2]}`;
            if (displays[_id] && displays[_id].timer) {
                clearTimeout(displays[_id].timer);
            }
            displays[_id] = { timer: this.setTimeout(() => this.readSignals(_id), 300), withTone: true };
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
        } catch (e: unknown) {
            this.log.error(
                `${this.config.type}rpc -> setValue ${JSON.stringify([
                    `${tmp[2]}:${tmp[3]}`,
                    tmp[4],
                    state.val,
                ])} ${type}`,
            );
            this.log.error(`Cannot call setValue: ${(e as Error).message}`);
        }
    }

    /**
     * Handle messages send to this instance
     *
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
                }`,
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
                        obj.message.ID !== undefined ? [obj.message.ID, obj.message.paramType] : [],
                    );
                    if (obj.callback) {
                        this.sendTo(
                            obj.from,
                            obj.command,
                            {
                                result: data,
                                error: null,
                            },
                            obj.callback,
                        );
                    }
                } else {
                    this.log.warn(`Cannot send "${obj.command}" "${obj.message.ID}": because not connected`);
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, { error: 'not connected' }, obj.callback);
                    }
                }
            } catch (e: unknown) {
                this.log.error(`Cannot call ${obj.command}: ${(e as Error).message}`);
                this.sendTo(obj.from, obj.command, { error: e }, obj.callback);
            }
        } else {
            try {
                if (rpcClient && connected) {
                    const data = await this.rpcMethodCallAsync(obj.command, [
                        obj.message.ID,
                        obj.message.paramType,
                        obj.message.params,
                    ]);
                    if (obj.callback) {
                        this.sendTo(
                            obj.from,
                            obj.command,
                            {
                                result: data,
                                error: null,
                            },
                            obj.callback,
                        );
                    }
                } else {
                    this.log.warn(`Cannot send "${obj.command}" "${obj.message.ID}": because not connected`);
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, { error: 'not connected' }, obj.callback);
                    }
                }
            } catch (e: unknown) {
                this.log.error(`Cannot call ${obj.command}: ${(e as Error).message}`);
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
                    reconnectTimeout: this.config.reconnectInterval * 1000,
                    // #1228: the CCU can require authentication for XML-RPC without HTTPS too
                    basic_auth:
                        this.config.type === 'xml' && this.config.username
                            ? { user: this.config.username, pass: this.config.password }
                            : undefined,
                });
            } catch (e: unknown) {
                this.log.error(`Could not create non-secure ${this.config.type}-rpc client: ${(e as Error).message}`);
                return void this.restart();
            }

            // If we have bin-rpc, only need it here because bin-rpc cannot have https
            if (rpcClient.on) {
                rpcClient.on('error', (err: any) => {
                    this.log.error(`Socket error: ${err}`);
                });
            }
        } else if (!rpcClient) {
            try {
                rpcClient = rpc.createSecureClient({
                    host: this.config.homematicAddress,
                    port: this.config.homematicPort,
                    path: this.homematicPath,
                    reconnectTimeout: this.config.reconnectInterval * 1_000,
                    basic_auth: { user: this.config.username, pass: this.config.password },
                    rejectUnauthorized: false,
                });
            } catch (e: unknown) {
                this.log.error(`Could not create secure ${this.config.type}-rpc client: ${(e as Error).message}`);
                return void this.restart();
            }
        }

        this.log.debug('Connect...');
        if (this.eventInterval) {
            this.log.debug('clear ping interval');
            this.clearInterval(this.eventInterval);
            this.eventInterval = undefined;
        }

        if (isFirst) {
            this.sendInit().catch(e => this.log.error(`Cannot sendInit: ${e.message}`));
        }

        // Periodically try to reconnect
        if (!this.connInterval) {
            this.log.debug('start connecting interval');
            this.connInterval = this.setInterval(() => this.sendInit(), this.config.reconnectInterval * 1_000);
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
            } catch (e: unknown) {
                this.log.error(`Ping error [${clientId}]: ${(e as Error).message}`);
                if (connected) {
                    this.log.info('Disconnected');
                    connected = false;
                    this.setStateAsync('info.connection', false, true).catch(e =>
                        this.log.error(`Cannot set state info.connection: ${e.message}`),
                    );
                    this.connect(false);
                }
            }
        } else {
            this.log.warn('Called PING, but client does not exist');
            if (connected) {
                this.log.info('Disconnected');
                connected = false;
                this.setStateAsync('info.connection', false, true).catch(e =>
                    this.log.error(`Cannot set state info.connection: ${e.message}`),
                );
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
            this.clearInterval(this.connInterval);
            this.connInterval = undefined;
        }

        const _now = Date.now();
        // Check last event time. If timeout => send init again
        if (!this.lastEvent || _now - this.lastEvent >= this.config.checkInitInterval * 1_000) {
            this.log.debug('[KEEPALIVE] Connection timed out, initializing new connection');
            this.connect(false);
        } else {
            this.sendPing().catch(e => this.log.error(`Cannot sendPing: ${e.message}`));
        }
    }

    /**
     * Sends init to RPC server
     */
    private async sendInit(): Promise<void> {
        try {
            if (rpcClient && (rpcClient.connected === undefined || rpcClient.connected)) {
                // drop a registration of our callback URL with an outdated interface id, which is left over after
                // an unclean stop, otherwise the CCU keeps sending the events with the old id (#1542)
                const deinitParams = this.getDeinitParams();
                try {
                    await this.rpcMethodCallAsync('init', deinitParams);
                } catch (e: unknown) {
                    this.log.debug(
                        `Deinit ${JSON.stringify(deinitParams)} before init failed: ${(e as Error).message}`,
                    );
                }

                this.log.debug(
                    `${this.config.type}rpc -> ${this.config.homematicAddress}:${this.config.homematicPort}${
                        this.homematicPath
                    } init ${JSON.stringify([this.daemonURL, clientId])}`,
                );
                await this.rpcMethodCallAsync('init', [this.daemonURL, clientId]);
                if (this.config.daemon === 'CUxD') {
                    try {
                        await this.getCuxDevices();
                        this.updateConnection();
                    } catch (e: unknown) {
                        this.log.error(`getCuxDevices error: ${(e as Error).message}`);
                    }
                } else {
                    this.updateConnection();
                }
            }
        } catch (e: unknown) {
            this.log.error(`Init not possible, going to stop: ${(e as Error).message}`);
            const message = (e as Error).message || '';
            if (message.includes('Unknown XML-RPC tag') || message.includes('Invalid XML-RPC message')) {
                // #1057, #1228: the web server of the CCU answered with an error page, e.g. "401 Unauthorized"
                this.log.error(
                    'The CCU did not answer with XML-RPC, but e.g. with an HTML page. Check the port, if the CCU requires authentication (username and password) and if the CCU accepts the HomeMatic address (e.g. use the IP address instead of a host name)',
                );
            }
            this.setTimeout(() => this.stop && this.stop(), 30_000);
        }
    }

    /**
     * Parameters of the init call, which removes the registration of our callback URL. CCU-Jack takes an empty
     * interface ID as a new registration and unregisters only on an init without it (#1003)
     */
    private getDeinitParams(): string[] {
        return this.config.daemon === 'CCU-Jack' ? [this.daemonURL] : [this.daemonURL, ''];
    }

    /**
     * Called on an event with an interface id of this instance, which is not the current one. The CCU still has an
     * outdated registration, e.g. after an unclean stop, so register again once per outdated id (#1542)
     *
     * @param staleId the interface id of the event
     */
    private onStaleClientId(staleId: string): void {
        if (this.staleClientIds.has(staleId)) {
            // registering again did not remove it, so it belongs to a registration we cannot remove
            if (!this.reportedStaleClientIds.has(staleId)) {
                this.reportedStaleClientIds.add(staleId);
                this.log.info(
                    `${this.config.type}rpc <- CCU still sends events to the outdated registration "${staleId}". It probably belongs to another callback URL and cannot be removed from here. A restart of the CCU removes it`,
                );
            } else {
                this.log.debug(`${this.config.type}rpc <- event with outdated interface id "${staleId}" discarded`);
            }
            return;
        }
        this.staleClientIds.add(staleId);
        const now = Date.now();
        if (now - this.lastStaleIdReinit < this.STALE_ID_REINIT_DELAY_MS) {
            // registered again just now, which covers this id too
            this.log.debug(`${this.config.type}rpc <- event with outdated interface id "${staleId}" discarded`);
            return;
        }
        this.lastStaleIdReinit = now;
        this.log.warn(
            `${this.config.type}rpc <- event with outdated interface id "${staleId}" received (current: "${clientId}"), probably left over after an unclean stop. Registering again`,
        );
        this.sendInit().catch(e => this.log.error(`Cannot sendInit: ${e.message}`));
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

        // The port the CCU will call back on. A bind address that stands for every interface is
        // reported without one, because the port is then occupied in both address families.
        this.usedCallbackPort = { port: adapterPort };
        if (this.config.adapterAddress && !WILDCARD_ADDRESSES.includes(this.config.adapterAddress)) {
            this.usedCallbackPort.bind = this.config.adapterAddress;
            this.usedCallbackPort.family = this.config.adapterAddress.includes(':') ? 6 : 4;
        }

        // Who else declared this port? Asked before the server is created, because a listen error
        // arrives as an `error` event that does not name the instance that was there first
        await reportPortConflict(this, this.usedCallbackPort, `the ${this.config.type}rpc callback server`);

        try {
            // listen errors like EADDRNOTAVAIL are not thrown here, they are emitted as 'error' event
            rpcServer = rpc.createServer({
                host: this.config.adapterAddress,
                port: adapterPort,
            });
        } catch (e: unknown) {
            this.usedCallbackPort = undefined;
            this.log.error(`Could not create RPC Server: ${(e as Error).message}`);
            return void this.restart();
        }

        // The RPC libraries hide their server, so there is no `listening` event to wait for: it binds
        // on the next tick, and a failure to do so lands in the `error` handler below, which frees
        // the port again
        void registerUsedPort(this, this.usedCallbackPort);

        // register before the next await, the server starts listening on next tick and emits listen errors as 'error'
        rpcServer.on('error', (e: NodeJS.ErrnoException) => {
            // the server never got the port, or lost it - it is not occupied by this instance
            void this.freeCallbackPort();
            this.log.error(
                `RPC Server error on ${this.config.adapterAddress}:${adapterPort}: ${e.message}. Without the server no events can be received, restarting in ${this.SERVER_RESTART_DELAY_MS / 1_000} seconds`,
            );
            if (e.code === 'EADDRNOTAVAIL') {
                // the address is not (yet) assigned to this host
                this.log.error(
                    `Address ${this.config.adapterAddress} not available, maybe your HOST IP has changed due to migration`,
                );
            }

            // restart delayed, so a permanent error does not end in a restart loop
            if (!this.serverRestartTimer) {
                this.serverRestartTimer = this.setTimeout(() => this.restart(), this.SERVER_RESTART_DELAY_MS);
            }
        });

        // build up unique client id
        clientId = this.namespace;

        try {
            const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
            clientId = `${obj?.common?.host}:${clientId}`;
        } catch (e: unknown) {
            this.log.warn(
                `Could not get hostname, using default id "${clientId}" to register: ${(e as Error).message}`,
            );
        }

        this.clientIdPrefix = `${clientId}:`;
        clientId += `:${randomBytes(16).toString('hex')}`;

        this.log.info(
            `${this.config.type}rpc server is trying to listen on ${this.config.adapterAddress}:${adapterPort}`,
        );
        this.log.info(
            `${this.config.type}rpc client is trying to connect to ${this.config.homematicAddress}:${
                this.config.homematicPort
            }${this.homematicPath} with ${JSON.stringify([this.daemonURL, clientId])}`,
        );

        this.connect(true);

        // Not found has special structure and no callback
        rpcServer.on('NotFound', (method: string | undefined, params: any) => {
            if (!method) {
                // the request could not be parsed as RPC call, e.g. an HTTP request of another client (#1151)
                this.log.debug(`${this.config.type}rpc <- invalid request without method ignored`);
                return;
            }
            this.log.warn(
                `${this.config.type}rpc <- undefined method ${method} with parameters ${
                    typeof params === 'object' ? JSON.stringify(params).slice(0, 80) : params
                }`,
            );
        });

        type RPCCallback = (err: any, res: any) => void;

        rpcServer.on('readdedDevice', (error: any, params: any, callback: RPCCallback) => {
            this.log.info(`Readded device ${JSON.stringify(params)}`);
            callback(null, '');
        });

        rpcServer.on('firmwareUpdateStatusChanged', async (error: any, params: any, callback: RPCCallback) => {
            this.log.info(`Firmware update status of ${params[1]} changed to ${params[2]}`);
            callback(null, '');

            // the status is a number, the device description delivers it as text (#1137)
            const address = String(params[1]).split(':')[0];
            try {
                const description = await this.rpcMethodCallAsync('getDeviceDescription', [address]);
                await this.updateFirmwareStates([description]);
            } catch (e: unknown) {
                this.log.warn(`Cannot read the firmware update status of ${address}: ${(e as Error).message}`);
            }
        });

        rpcServer.on('replaceDevice', async (error: any, params: [string, string, string], callback: RPCCallback) => {
            const oldDeviceName = params[1];
            const newDeviceName = params[2];
            this.log.info(`Device "${oldDeviceName}" has been replaced by "${newDeviceName}"`);

            // remove the old device
            await this.deleteObjectTree(oldDeviceName.replace(tools.FORBIDDEN_CHARS, '_'));
            this.log.info(`Replaced device "${oldDeviceName}" deleted`);

            // add the new device
            this.log.info(`${this.config.type}rpc -> getDeviceDescription ${JSON.stringify([newDeviceName])}`);
            try {
                const res = await this.rpcMethodCallAsync('getDeviceDescription', [newDeviceName]);
                await this.createDevices([res]);
            } catch (e: unknown) {
                this.log.error(`Error while creating replacement device "${newDeviceName}": ${(e as Error).message}`);
            }

            callback(null, '');
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
                'setReadyConfig',
            ]);
        });

        rpcServer.on('event', (err: any, params: any, callback: RPCCallback) => {
            if (err) {
                this.log.warn(`Error on event: ${err}`);
            }
            this.updateConnection();
            try {
                callback(null, this.methods.event(err, params));
            } catch (e: unknown) {
                this.log.error(`Cannot send response to event: ${(e as Error).message}`);
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
                const knownDevices: any[] = [];
                let doc;
                try {
                    doc = await this.getObjectViewAsync('hm-rpc', 'listDevices', {
                        startkey: `${this.namespace}.`,
                        endkey: `${this.namespace}.\u9999`,
                    });
                } catch (e: unknown) {
                    this.log.error(`getObjectViewAsync hm-rpc: ${(e as Error).message}`);
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
                                        await this.deleteObjectTree(
                                            `${parts[parts.length - 2]}.${parts[parts.length - 1]}`,
                                        );
                                        this.log.info(`obsolete channel ${address} ${JSON.stringify(address)} deleted`);
                                    } catch (e: unknown) {
                                        this.log.error(
                                            `Could not delete obsolete channel ${address} ${JSON.stringify(address)}: ${
                                                (e as Error).message
                                            }`,
                                        );
                                    }
                                } else {
                                    try {
                                        await this.deleteObjectTree(val.ADDRESS.replace(tools.FORBIDDEN_CHARS, '_'));
                                        this.log.info(`obsolete device ${val.ADDRESS} deleted`);
                                    } catch (e: unknown) {
                                        this.log.error(
                                            `Could not delete obsolete device ${val.ADDRESS}: ${(e as Error).message}`,
                                        );
                                    }
                                }
                            }
                        } else {
                            // we can remove the item at index because it is already registered
                            // to ioBroker
                            knownDevices.push(newDevices[index]);
                            newDevices.splice(index, 1);
                        }
                    }
                }

                this.log.info(`new ${this.config.daemon} devices/channels after filter: ${newDevices.length}`);
                await this.createDevices(newDevices);
                // the firmware update state of the known devices may have changed meanwhile
                await this.updateFirmwareStates(knownDevices);
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
                    endkey: `${this.namespace}.\u9999`,
                });
            } catch (e: unknown) {
                this.log.error(`Error on listDevices (getObjectView): ${(e as Error).message}`);
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
            } catch (e: unknown) {
                this.log.error(`Cannot respond on listDevices: ${(e as Error).message}`);
                this.log.error(JSON.stringify(response));
            }
        });

        rpcServer.on('deleteDevices', (err: any, params: any, callback: RPCCallback) => {
            if (err) {
                this.log.warn(`Error on deleteDevices: ${err.message}`);
            }
            this.log.info(`${this.config.type}rpc <- deleteDevices ${params[1].length}`);
            // #1243, #895: the HMIP server reports devices as deleted e.g. during a firmware update, although they still exist
            const deviceNames: string[] = this.config.dontDelete ? [] : params[1];
            if (this.config.dontDelete) {
                this.log.info(
                    `Devices not deleted, because "Don't delete devices" is enabled: ${JSON.stringify(params[1])}`,
                );
            }
            for (let deviceName of deviceNames) {
                if (deviceName.includes(':')) {
                    deviceName = deviceName.replace(':', '.').replace(tools.FORBIDDEN_CHARS, '_');
                    this.log.info(`channel ${deviceName} ${JSON.stringify(deviceName)} deleted`);
                    const parts = deviceName.split('.');
                    this.deleteObjectTree(`${parts[parts.length - 2]}.${parts[parts.length - 1]}`).catch(e =>
                        this.log.error(`Could not delete channel ${deviceName}: ${(e as Error).message}`),
                    );
                } else {
                    this.log.info(`device ${deviceName} deleted`);
                    this.deleteObjectTree(deviceName.replace(tools.FORBIDDEN_CHARS, '_')).catch(e =>
                        this.log.error(`Could not delete device ${deviceName}: ${(e as Error).message}`),
                    );
                }
            }
            try {
                callback(null, '');
            } catch (e: unknown) {
                this.log.error(`Cannot response on deleteDevices: ${(e as Error).message}`);
            }
        });

        rpcServer.on('setReadyConfig', (err: any, params: any, callback: RPCCallback) => {
            if (err) {
                this.log.warn(`Error on setReadyConfig: ${err.message}`);
            }
            this.log.info(`${this.config.type}rpc <- setReadyConfig ${JSON.stringify(params)}`);
            try {
                callback(null, '');
            } catch (e: unknown) {
                this.log.error(`Cannot response on setReadyConfig: ${(e as Error).message}`);
            }
        });
    }

    /**
     * Adds the paramset objects of the given paramset to the given channel
     *
     * @param channel - channel object with at least "_id" property
     * @param paramset - a paramset object retrieved by CCU
     */
    private async addParamsetObjects(
        channel: ioBroker.SettableDeviceObject | ioBroker.SettableChannelObject,
        paramset: Record<string, ParamsetObjectWithSpecial>,
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
                    write: !!(paramObj.OPERATIONS & 2),
                },
                native: paramObj,
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

            // #1343: VALVE_STATE is the valve opening in % for BidCos, but the adaption state (ENUM) for HMIP
            if (key === 'VALVE_STATE' && paramObj.TYPE === 'ENUM') {
                obj.common.role = 'value';
            }

            if (!obj.common.write) {
                obj.common.role = tools.readOnlyRole(obj.common.role);
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
                TYPE: paramObj.TYPE,
            };

            if (paramObj.VALUE_LIST) {
                this.dpTypes[dpID].VALUE_LIST = paramObj.VALUE_LIST;
            }

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
            } catch (e: unknown) {
                this.log.error(`Could not extend object ${channel._id}.${key}: ${(e as Error).message}`);
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
                    reject(new Error(err));
                } else {
                    resolve(res);
                }
            });
        });
    }

    /**
     * Async variant of method call which also performs a retry on the first error of "setValue"
     *
     * @param method the method name
     * @param params the method specific parameters
     */
    private async rpcMethodCallAsync(method: string, params: any[]): Promise<any> {
        try {
            const res = await this.rpcMethodCallAsyncHelper(method, params);
            return res;
        } catch (e: unknown) {
            if (
                method === 'setValue' &&
                ((e as Error).message.endsWith('Failure') || (e as Error).message.endsWith('(UNREACH)'))
            ) {
                this.log.info(
                    `Temporary error occurred for "${method}" with "${JSON.stringify(params)}": ${(e as Error).message}`,
                );
                // on random error due to temporary communication issues, try again once after some ms
                await this.delay(this.RETRY_DELAY_MS);
                return this.rpcMethodCallAsyncHelper(method, params);
            }
            throw e;
        }
    }

    /**
     * Sends HUE and SATURATION of a channel in one putParamset, because HMIP devices like HmIP-RGBW answer a
     * single setValue with MISSING_NON_OPTIONAL_PARAMETER (#1108)
     *
     * @param channelId - full ID of the channel, e.g. "hm-rpc.0.0001D8A99B0815.1"
     */
    private async sendColor(channelId: string): Promise<void> {
        delete colorChannels[channelId];

        const parts = channelId.split('.');
        const address = `${parts[2]}:${parts[3]}`;
        const params: Record<string, number | { explicitDouble: number }> = {};

        for (const key of ['HUE', 'SATURATION']) {
            const dpId = `${channelId}.${key}`;
            const dpType = this.dpTypes[dpId];
            let value: number;

            try {
                const state = await this.getForeignStateAsync(dpId);
                value = typeof state?.val === 'number' ? state.val : Number(dpType.MIN) || 0;
            } catch (e: unknown) {
                this.log.error(`Cannot read state ${dpId}: ${(e as Error).message}`);
                value = Number(dpType.MIN) || 0;
            }

            if (dpType.UNIT === '100%') {
                value = Math.round((value / 100) * 1_000) / 1_000;
            }

            params[key] = dpType.TYPE === 'FLOAT' ? { explicitDouble: value } : value;
        }

        this.log.debug(`${this.config.type}rpc -> putParamset ${JSON.stringify([address, 'VALUES', params])}`);

        try {
            if (rpcClient && connected) {
                await this.rpcMethodCallAsync('putParamset', [address, 'VALUES', params]);
            } else {
                this.log.warn(`Cannot set the color of "${channelId}", because not connected.`);
            }
        } catch (e: unknown) {
            this.log.error(`${this.config.type}rpc -> putParamset ${JSON.stringify([address, 'VALUES', params])}`);
            this.log.error(`Cannot call putParamset: ${(e as Error).message}`);
        }
    }

    /**
     * Control the EPAPER display
     */
    private async controlEPaper(
        id: string,
        data: { lines: Line[]; signal: string; tone: string; repeats?: number; offset?: number },
    ): Promise<void> {
        const tmp = id.split('.');
        tmp[3] = '3';
        tmp[4] = 'SUBMIT';

        const val = tools.combineEPaperCommand(
            data.lines,
            data.signal || '0xF0',
            data.tone || '0xC0',
            data.repeats,
            data.offset,
        );

        try {
            if (rpcClient && connected) {
                await this.rpcMethodCallAsync('setValue', [`${tmp[2]}:${tmp[3]}`, tmp[4], val]);
            } else {
                this.log.warn(`Cannot setValue "${id}", because not connected.`);
            }
        } catch (e: unknown) {
            this.log.error(
                `${this.config.type}rpc -> setValue ${JSON.stringify([`${tmp[2]}:${tmp[3]}`, tmp[4], val])}`,
            );
            this.log.error(`Cannot call setValue: ${(e as Error).message}`);
        }
    }

    /**
     * Read signal from EPAPER display
     */
    private async readSignals(id: string): Promise<void> {
        displays[id] = null;
        const data: { lines: Line[]; signal: string; tone: string; repeats?: number; offset?: number } = {
            lines: [
                { line: '', icon: '' },
                { line: '', icon: '' },
                { line: '', icon: '' },
            ],
            signal: '0xF0',
            tone: '0xC0',
        };

        const promises: Promise<void>[] = [];

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_LINE2`)
                .then(state => {
                    data.lines[0].line = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_LINE2: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_ICON2`)
                .then(state => {
                    data.lines[0].icon = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_ICON2: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_LINE3`)
                .then(state => {
                    data.lines[1].line = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_LINE3: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_ICON3`)
                .then(state => {
                    data.lines[1].icon = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_ICON3: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_LINE4`)
                .then(state => {
                    data.lines[2].line = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_LINE4: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_ICON4`)
                .then(state => {
                    data.lines[2].icon = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_ICON4: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_SIGNAL`)
                .then(state => {
                    data.signal = state ? (state.val as string) || '0xF0' : '0xF0';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_SIGNAL: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_TONE`)
                .then(state => {
                    data.tone = state ? (state.val as string) || '0xC0' : '0xC0';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_TONE: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_TONE_INTERVAL`)
                .then(state => {
                    data.offset = state
                        ? state.val === undefined || state.val === null || state.val === ''
                            ? 10
                            : parseInt(state.val as string, 10)
                        : 10;
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_TONE_INTERVAL: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_TONE_REPETITIONS`)
                .then(state => {
                    data.repeats = state
                        ? state.val === undefined || state.val === null || state.val === ''
                            ? 1
                            : parseInt(state.val as string, 10)
                        : 1;
                })
                .catch(e =>
                    this.log.error(`Cannot read state ${id}.0.EPAPER_TONE_REPETITIONS: ${(e as Error).message}`),
                ),
        );

        await Promise.all(promises);
        await this.controlEPaper(id, data);
    }

    /**
     * Read the settings from EPAPER display
     */
    private async readSettings(id: string): Promise<void> {
        displays[id] = null;
        const data: { lines: Line[]; signal: string; tone: string } = {
            lines: [
                { line: '', icon: '' },
                { line: '', icon: '' },
                { line: '', icon: '' },
            ],
            signal: '0xF0',
            tone: '0xC0',
        };

        const promises: Promise<void>[] = [];

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_LINE2`)
                .then(state => {
                    data.lines[0].line = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_LINE2: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_ICON2`)
                .then(state => {
                    data.lines[0].icon = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_ICON2: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_LINE3`)
                .then(state => {
                    data.lines[1].line = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_LINE3: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_ICON3`)
                .then(state => {
                    data.lines[1].icon = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_ICON3: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_LINE4`)
                .then(state => {
                    data.lines[2].line = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_LINE4: ${(e as Error).message}`)),
        );

        promises.push(
            this.getForeignStateAsync(`${id}.0.EPAPER_ICON4`)
                .then(state => {
                    data.lines[2].icon = state ? (state.val as string) || '' : '';
                })
                .catch(e => this.log.error(`Cannot read state ${id}.0.EPAPER_ICON4: ${(e as Error).message}`)),
        );

        await Promise.all(promises);
        await this.controlEPaper(id, data);
    }

    /**
     * Get value paramsets and add them
     */
    private async getValueParamsets(
        valueParamsets: (ioBroker.SettableDeviceObject | ioBroker.SettableChannelObject)[],
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
                    `${this.config.type}rpc -> getParamsetDescription ${JSON.stringify([obj.native.ADDRESS, 'VALUES'])}`,
                );

                this.metaValues[cid] = await this.rpcMethodCallAsync('getParamsetDescription', [
                    obj.native.ADDRESS,
                    'VALUES',
                ]);

                if (obj.native && obj.native.PARENT_TYPE === 'HM-Dis-EP-WM55' && obj.native.TYPE === 'MAINTENANCE') {
                    this.addEPaperToMeta();
                }

                // @ts-expect-error we will fix it
                await this.addParamsetObjects(obj, this.metaValues[cid]);
            } catch (e: unknown) {
                this.log.error(
                    `Error on getParamsetDescription for [${obj.native.ADDRESS}, 'VALUES']": ${(e as Error).message}`,
                );
            }
        }

        if (valueParamsets.length) {
            // reset
            // Inform hm-rega about new devices
            try {
                await this.setStateAsync('updated', true, false);
            } catch (e: unknown) {
                this.log.error(`Could not inform hm-rega about new devices: ${(e as Error).message}`);
            }
            // If it has been a force reinit run, set it to false and restart
            if (this.config.forceReInit) {
                this.log.info('Restarting now, because we had a forced reinitialization run');
                try {
                    await this.extendForeignObjectAsync(`system.adapter.${this.namespace}`, {
                        native: { forceReInit: false },
                    });
                } catch (e: unknown) {
                    this.log.error(`Could not restart and set forceReinit to false: ${(e as Error).message}`);
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
                    OPERATIONS: 2,
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
                        '0x88': 'Service message',
                    },
                    OPERATIONS: 2,
                };
                obj.EPAPER_LINE3 = {
                    TYPE: 'EPAPER_LINE',
                    ID: 'LINE3',
                    OPERATIONS: 2,
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
                        '0x88': 'Service message',
                    },
                    OPERATIONS: 2,
                };
                obj.EPAPER_LINE4 = {
                    TYPE: 'EPAPER_LINE',
                    ID: 'LINE4',
                    OPERATIONS: 2,
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
                        '0x88': 'Service message',
                    },
                    OPERATIONS: 2,
                };
                obj.EPAPER_SIGNAL = {
                    TYPE: 'EPAPER_SIGNAL',
                    ID: 'EPAPER_SIGNAL',
                    STATES: {
                        '0xF0': 'OFF',
                        '0xF1': 'Red blink',
                        '0xF2': 'Green blink',
                        '0xF3': 'Orange blink',
                    },
                    OPERATIONS: 2,
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
                        '0xC6': 'Long',
                    },
                    OPERATIONS: 2,
                };
                obj.EPAPER_TONE_INTERVAL = {
                    TYPE: 'EPAPER_TONE_INTERVAL',
                    ID: 'EPAPER_TONE_INTERVAL',
                    MIN: 10,
                    MAX: 160,
                    OPERATIONS: 2,
                    DEFAULT: 10,
                };
                obj.EPAPER_TONE_REPETITIONS = {
                    TYPE: 'EPAPER_TONE_REPETITIONS',
                    ID: 'EPAPER_TONE_REPETITIONS',
                    MIN: 0,
                    MAX: 15,
                    OPERATIONS: 2,
                    DEFAULT: 1,
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

                icon = this.getIcon(device.TYPE);
            }

            const id = device.ADDRESS.replace(':', '.').replace(tools.FORBIDDEN_CHARS, '_');
            const obj: ioBroker.SettableChannelObject | ioBroker.SettableDeviceObject = {
                _id: id,
                type: type,
                common: {
                    name: device.ADDRESS,
                    role: role,
                },
                native: device,
            };

            if (icon) {
                obj.common.icon = icon;
            }

            const dpID = `${this.namespace}.${obj._id}`;

            this.dpTypes[dpID] = {
                UNIT: device.UNIT,
                TYPE: device.TYPE,
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
            } catch (e: unknown) {
                this.log.error(`object ${id} error on creation: ${(e as Error).message}`);
            }

            if (obj.type === 'channel') {
                queueValueParamsets.push(obj);
            }
        }

        await this.getValueParamsets(queueValueParamsets);
        await this.updateFirmwareStates(deviceArr);
    }

    /**
     * Writes the firmware update state of the devices to `<device>.0.FIRMWARE_UPDATE_STATE` and updates the firmware
     * in the native part of the device object (#1137)
     *
     * @param descriptions device descriptions of the CCU, channels and devices without FIRMWARE_UPDATE_STATE are skipped
     */
    private async updateFirmwareStates(descriptions: any[]): Promise<void> {
        for (const description of descriptions) {
            if (
                description?.PARENT ||
                typeof description?.ADDRESS !== 'string' ||
                typeof description.FIRMWARE_UPDATE_STATE !== 'string'
            ) {
                continue;
            }
            const deviceId = description.ADDRESS.replace(tools.FORBIDDEN_CHARS, '_');
            const stateId = `${deviceId}.0.FIRMWARE_UPDATE_STATE`;
            try {
                const device = await this.getObjectAsync(deviceId);
                // the HMIP server deletes the device e.g. during the update, it gets the state when it is created again
                if (!device || !(await this.getObjectAsync(`${deviceId}.0`))) {
                    continue;
                }
                const changed = tools.changedFirmwareAttributes(description, device.native);
                if (Object.keys(changed).length) {
                    await this.extendObjectAsync(deviceId, { native: changed });
                }
                await this.setObjectNotExistsAsync(stateId, {
                    type: 'state',
                    common: {
                        name: 'FIRMWARE_UPDATE_STATE',
                        role: 'info.status',
                        type: 'string',
                        read: true,
                        write: false,
                        states: tools.FIRMWARE_UPDATE_STATES,
                    },
                    native: {},
                });
                await this.setStateChangedAsync(stateId, description.FIRMWARE_UPDATE_STATE, true);
            } catch (e: unknown) {
                this.log.error(`Cannot update the firmware update state of ${deviceId}: ${(e as Error).message}`);
            }
        }
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
                            endkey: `${this.namespace}.\u9999`,
                        });
                    } catch (e: unknown) {
                        this.log.error(`getObjectView hm-rpc: ${(e as Error).message}`);
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
                                            '_',
                                        );
                                        const parts = address.split('.');
                                        this.deleteObjectTree(
                                            `${parts[parts.length - 2]}.${parts[parts.length - 1]}`,
                                        ).catch(e =>
                                            this.log.error(
                                                `Could not delete obsolete channel ${address}: ${(e as Error).message}`,
                                            ),
                                        );
                                        this.log.info(`obsolete channel ${address} ${JSON.stringify(address)} deleted`);
                                    } else {
                                        this.deleteObjectTree(val.ADDRESS.replace(tools.FORBIDDEN_CHARS, '_')).catch(
                                            e =>
                                                this.log.error(
                                                    `Could not delete obsolete device ${val.ADDRESS}: ${(e as Error).message}`,
                                                ),
                                        );
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
            } catch (e: unknown) {
                this.log.error(`Cannot call listDevices: ${(e as Error).message}`);
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
            this.setStateAsync('info.connection', true, true).catch(e =>
                this.log.error(`Cannot set info.connection to true: ${(e as Error).message}`),
            );
        }

        if (this.connInterval) {
            this.log.debug('clear connecting interval');
            this.clearInterval(this.connInterval);
            this.connInterval = undefined;
        }

        // Virtual Devices API does now also support PING (tested with 3.55.5.20201226 - see #308)
        if (!this.eventInterval) {
            this.log.debug('start ping interval');
            this.eventInterval = this.setInterval(() => this.keepAlive(), (this.config.checkInitInterval * 1000) / 2);
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
    module.exports = (options: Partial<AdapterOptions> | undefined) => new HomematicRpc(options);
} else {
    // otherwise start the instance directly
    (() => new HomematicRpc())();
}
