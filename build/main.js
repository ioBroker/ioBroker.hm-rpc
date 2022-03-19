"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
/*
 * Copyright (c) 2014-2022 bluefox <dogafox@gmail.com>
 *
 * Copyright (c) 2014 hobbyquaker
 *
 * The MIT License (MIT)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
const utils = __importStar(require("@iobroker/adapter-core"));
const images_1 = require("./lib/images");
const tools = __importStar(require("./lib/tools"));
const roles_1 = require("./lib/roles");
const crypto_1 = require("crypto");
let connected = false;
const displays = {};
let adapter;
let rpcMethodCallAsync;
let clientId;
let rpc;
let rpcClient;
let rpcServer;
const metaValues = {};
const dpTypes = {};
let lastEvent = 0;
let eventInterval;
let connInterval;
let connTimeout;
let daemonURL = '';
let daemonProto = '';
let homematicPath;
const FORBIDDEN_CHARS = /[\][*,;'"`<>\\\s?]/g;
// Icons:
//      0x80 AUS
//      0x81 EIN
//      0x82 OFFEN
//      0x83 geschlossen
//      0x84 fehler
//      0x85 alles ok
//      0x86 information
//      0x87 neue nachricht
//      0x88 servicemeldung
// Tonfolgen
//      0xC0 AUS
//      0xC1 LANG LANG
//      0xC2 LANG KURZ
//      0xC3 LANG KURZ KURZ
//      0xC4 KURZ
//      0xC5 KURZ KURZ
//      0xC6 LANG
//      0xC7
//      0xC9
//      0xCA
function number2hex(num) {
    if (typeof num === 'number') {
        num = num.toString(16).toUpperCase();
        if (num.length < 2) {
            num = `0${num}`;
        }
        num = `0x${num}`;
    }
    return num;
}
/**
 * Creates an combined EPAPER command which can be sent to the CCU
 *
 * @param lines
 * @param signal 0xF0 AUS; 0xF1 Rotes Blitzen ;0xF2 Grünes Blitzen; 0xF3 Orangenes Blitzen
 * @param ton
 * @param repeats
 * @param offset
 */
function combineEPaperCommand(lines, signal, ton, repeats, offset) {
    signal = number2hex(signal || '0xF0');
    ton = number2hex(ton || '0xC0');
    const substitutions = {
        A: '0x41',
        B: '0x42',
        C: '0x43',
        D: '0x44',
        E: '0x45',
        F: '0x46',
        G: '0x47',
        H: '0x48',
        I: '0x49',
        J: '0x4A',
        K: '0x4B',
        L: '0x4C',
        M: '0x4D',
        N: '0x4E',
        O: '0x4F',
        P: '0x50',
        Q: '0x51',
        R: '0x52',
        S: '0x53',
        T: '0x54',
        U: '0x55',
        V: '0x56',
        W: '0x57',
        X: '0x58',
        Y: '0x59',
        Z: '0x5A',
        a: '0x61',
        b: '0x62',
        c: '0x63',
        d: '0x64',
        e: '0x65',
        f: '0x66',
        g: '0x67',
        h: '0x68',
        i: '0x69',
        j: '0x6A',
        k: '0x6B',
        l: '0x6C',
        m: '0x6D',
        n: '0x6E',
        o: '0x6F',
        p: '0x70',
        q: '0x71',
        r: '0x72',
        s: '0x73',
        t: '0x74',
        u: '0x75',
        v: '0x76',
        w: '0x77',
        x: '0x78',
        y: '0x79',
        z: '0x7A',
        0: '0x30',
        1: '0x31',
        2: '0x32',
        3: '0x33',
        4: '0x34',
        5: '0x35',
        6: '0x36',
        7: '0x37',
        8: '0x38',
        9: '0x39',
        ' ': '0x20',
        '!': '0x21',
        '"': '0x22',
        '%': '0x25',
        '&': '0x26',
        '=': '0x27',
        '(': '0x28',
        ')': '0x29',
        '*': '0x2A',
        '+': '0x2B',
        ',': '0x2C',
        '-': '0x2D',
        '.': '0x2E',
        '/': '0x2F',
        Ä: '0x5B',
        Ö: '0x23',
        Ü: '0x24',
        ä: '0x7B',
        ö: '0x7C',
        ü: '0x7D',
        ß: '0x5F',
        ':': '0x3A',
        ';': '0x3B',
        '@': '0x40',
        '>': '0x3E'
    };
    let command = '0x02,0x0A';
    for (const li of lines) {
        if (li.line) {
            const line = li.line.toString();
            command = `${command},0x12`;
            let i;
            if (line.substring(0, 2) === '0x' && line.length === 4) {
                command = `${command},${line}`;
                i = 12;
            }
            else {
                i = 0;
            }
            while (i < line.length && i < 12) {
                command += `,${substitutions[line[i]]}` || '0x2A';
                i++;
            }
        }
        if (li.icon) {
            command += `,0x13,${number2hex(li.icon)}`;
        }
        command = `${command},0x0A`;
    }
    command = `${command},0x14,${ton},0x1C,`;
    if (repeats < 1) {
        command = `${command}0xDF,0x1D,`;
    }
    else if (repeats < 11) {
        command = `${command}0xD${repeats - 1},0x1D,`;
    }
    else if (repeats === 11) {
        command = `${command}0xDA,0x1D,`;
    }
    else if (repeats === 12) {
        command = `${command}0xDB,0x1D,`;
    }
    else if (repeats === 13) {
        command = `${command}0xDC,0x1D,`;
    }
    else if (repeats === 14) {
        command = `${command}0xDD,0x1D,`;
    }
    else {
        command = `${command}0xDE,0x1D,`;
    }
    if (offset <= 100) {
        command = `${command}0xE${offset / 10 - 1},0x16,`;
    }
    else if (offset <= 110) {
        command = `${command}0xEA,0x16,`;
    }
    else if (offset <= 120) {
        command = `${command}0xEB,0x16,`;
    }
    else if (offset <= 130) {
        command = `${command}0xEC,0x16,`;
    }
    else if (offset <= 140) {
        command = `${command}0xED,0x16,`;
    }
    else if (offset <= 150) {
        command = `${command}0xEE,0x16,`;
    }
    else {
        command = `${command}0xEF,0x16,`;
    }
    command = `${command + signal},0x03`;
    return command;
}
async function controlEPaper(id, data) {
    const tmp = id.split('.');
    tmp[3] = '3';
    tmp[4] = 'SUBMIT';
    const val = combineEPaperCommand(data.lines, data.signal || '0xF0', data.tone || '0xC0', data.repeats, data.offset);
    try {
        if (rpcClient && connected) {
            await rpcMethodCallAsync('setValue', [`${tmp[2]}:${tmp[3]}`, tmp[4], val]);
        }
        else {
            adapter.log.warn(`Cannot setValue "${id}", because not connected.`);
        }
    }
    catch (e) {
        adapter.log.error(`${adapter.config.type}rpc -> setValue ${JSON.stringify([`${tmp[2]}:${tmp[3]}`, tmp[4], val])}`);
        adapter.log.error(`Cannot call setValue: ${e.message}`);
    }
}
async function readSignals(id) {
    displays[id] = null;
    const data = {
        lines: [{}, {}, {}],
        signal: '0xF0',
        tone: '0xC0'
    };
    const promises = [];
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_LINE2`, (err, state) => {
            data.lines[0].line = state ? state.val || '' : '';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_ICON2`, (err, state) => {
            data.lines[0].icon = state ? state.val || '' : '';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_LINE3`, (err, state) => {
            data.lines[1].line = state ? state.val || '' : '';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_ICON3`, (err, state) => {
            data.lines[1].icon = state ? state.val || '' : '';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_LINE4`, (err, state) => {
            data.lines[2].line = state ? state.val || '' : '';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_ICON4`, (err, state) => {
            data.lines[2].icon = state ? state.val || '' : '';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_SIGNAL`, (err, state) => {
            data.signal = state ? state.val || '0xF0' : '0xF0';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_TONE`, (err, state) => {
            data.tone = state ? state.val || '0xC0' : '0xC0';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_TONE_INTERVAL`, (err, state) => {
            data.offset = state ? state.val : 10;
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_TONE_REPETITIONS`, (err, state) => {
            data.repeats = state ? state.val : 1;
            resolve();
        });
    }));
    await Promise.all(promises);
    controlEPaper(id, data);
} // endReadSignals
async function readSettings(id) {
    displays[id] = null;
    const data = {
        lines: [{}, {}, {}],
        signal: '0xF0',
        tone: '0xC0'
    };
    const promises = [];
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_LINE2`, (err, state) => {
            data.lines[0].line = state ? state.val || '' : '';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_ICON2`, (err, state) => {
            data.lines[0].icon = state ? state.val || '' : '';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_LINE3`, (err, state) => {
            data.lines[1].line = state ? state.val || '' : '';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_ICON3`, (err, state) => {
            data.lines[1].icon = state ? state.val || '' : '';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_LINE4`, (err, state) => {
            data.lines[2].line = state ? state.val || '' : '';
            resolve();
        });
    }));
    promises.push(new Promise(resolve => {
        adapter.getForeignState(`${id}.0.EPAPER_ICON4`, (err, state) => {
            data.lines[2].icon = state ? state.val || '' : '';
            resolve();
        });
    }));
    await Promise.all(promises);
    controlEPaper(id, data);
} // endReadSettings
function startAdapter(options = {}) {
    adapter = new utils.Adapter({
        ...options,
        name: 'hm-rpc',
        error: (e) => {
            if (e.code === 'EADDRNOTAVAIL') {
                adapter.log.error(`Address ${adapter.config.adapterAddress} not available, maybe your HOST IP has changed due to migration`);
                // doesn't work in that case, so let it correctly be handled by controller at least we can log
                // return true;
            }
            // don't now how to handle so let it burn ;-)
            return false;
        },
        ready: () => {
            adapter.subscribeStates('*');
            main();
        },
        stateChange: async (id, state) => {
            if (!state || state.ack === true) {
                return;
            }
            const tmp = id.split('.');
            let val;
            if (id === `${adapter.namespace}.updated` || /_ALARM$/.test(id)) {
                return;
            }
            adapter.log.debug(`${adapter.config.type}rpc -> setValue ${tmp[3]} ${tmp[4]}: ${state.val}`);
            if (!dpTypes[id]) {
                adapter.log.error(`${adapter.config.type}rpc -> setValue: no dpType for ${id}!`);
                // log this for debug purposes
                adapter.log.error(JSON.stringify(dpTypes));
                return;
            }
            /* It should not be necessary to scale on % values - see https://github.com/ioBroker/ioBroker.hm-rpc/issues/263
            if (dpTypes[id].UNIT === '%' && dpTypes[id].MIN !== undefined) {
                state.val = (state.val / 100) * (dpTypes[id].MAX - dpTypes[id].MIN) + dpTypes[id].MIN;
                state.val = Math.round(state.val * 1000) / 1000;
            } else */
            if (dpTypes[id].UNIT === '100%' && typeof state.val === 'number') {
                state.val = Math.round((state.val / 100) * 1000) / 1000;
            }
            const type = dpTypes[id].TYPE;
            if (type === 'EPAPER_TONE_REPETITIONS') {
                // repeats have to be between 0 and 15 -> 0 is unlimited
                if (typeof state.val !== 'number') {
                    state.val = 1;
                }
                val = Math.min(Math.max(state.val, 0), 15);
                adapter.setForeignState(id, val, true);
                return;
            } // endIf
            if (type === 'EPAPER_TONE_INTERVAL') {
                // offset has to be between 0 and 160
                if (typeof state.val !== 'number') {
                    state.val = 0;
                }
                val = Math.min(Math.max(Math.round(state.val / 10) * 10, 10), 160);
                adapter.setForeignState(id, val, true);
                return;
            } // endIf
            if (type === 'EPAPER_LINE' || type === 'EPAPER_ICON') {
                const _id = `${tmp[0]}.${tmp[1]}.${tmp[2]}`;
                if (displays[_id] && displays[_id].timer) {
                    clearTimeout(displays[_id].timer);
                    if (displays[_id].withTone) {
                        displays[_id] = { timer: setTimeout(readSignals, 300, _id), withTone: true };
                        return;
                    }
                }
                displays[_id] = { timer: setTimeout(readSettings, 300, _id), withTone: false };
                return;
            }
            else if (type === 'EPAPER_SIGNAL' || type === 'EPAPER_TONE') {
                const _id = `${tmp[0]}.${tmp[1]}.${tmp[2]}`;
                if (displays[_id] && displays[_id].timer) {
                    clearTimeout(displays[_id].timer);
                }
                displays[_id] = { timer: setTimeout(readSignals, 300, _id), withTone: true };
                return;
            }
            else if (tmp[4] === 'DISPLAY_DATA_STRING') {
                // new EPAPER HMIP-WRCD has own states but needs to encode special chars by DIN_66003
                val = tools.replaceSpecialChars(state.val ? state.val.toString() : '');
                adapter.log.debug(`Encoded ${state.val} to ${val}`);
            }
            else if (tmp[4] === 'COMBINED_PARAMETER' && state.val && /DDS=.+,/g.test(state.val.toString())) {
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
                } // endFor
                val = text;
                adapter.log.debug(`Encoded ${state.val} to ${val}`);
            }
            else {
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
            adapter.log.debug(`setValue ${JSON.stringify([`${tmp[2]}:${tmp[3]}`, tmp[4], val])} ${type}`);
            try {
                if (rpcClient && connected) {
                    await rpcMethodCallAsync('setValue', [`${tmp[2]}:${tmp[3]}`, tmp[4], val]);
                }
                else {
                    adapter.log.warn(`Cannot setValue "${id}", because not connected.`);
                }
            }
            catch (e) {
                adapter.log.error(`${adapter.config.type}rpc -> setValue ${JSON.stringify([
                    `${tmp[2]}:${tmp[3]}`,
                    tmp[4],
                    state.val
                ])} ${type}`);
                adapter.log.error(`Cannot call setValue: ${e.message}`);
            }
        },
        message: async (obj) => {
            adapter.log.debug(`[MSSG] Received: ${JSON.stringify(obj)}`);
            if (obj.command === undefined ||
                obj.command === null ||
                typeof obj.message !== 'object' ||
                obj.message === null) {
                adapter.log.warn(`Received invalid command via message "${obj.command}" "${JSON.stringify(obj.message)}" from ${obj.from}`);
                if (obj.callback) {
                    adapter.sendTo(obj.from, obj.command, { error: 'Invalid command' }, obj.callback);
                }
                return;
            }
            if (obj.message.params === undefined || obj.message.params === null) {
                try {
                    if (rpcClient && connected) {
                        // if device specific command, send it's ID and paramType
                        const data = await rpcMethodCallAsync(obj.command, obj.message.ID !== undefined ? [obj.message.ID, obj.message.paramType] : []);
                        if (obj.callback) {
                            adapter.sendTo(obj.from, obj.command, {
                                result: data,
                                error: null
                            }, obj.callback);
                        }
                    }
                    else {
                        adapter.log.warn(`Cannot send "${obj.command}" "${obj.message.ID}": because not connected`);
                        if (obj.callback) {
                            adapter.sendTo(obj.from, obj.command, { error: 'not connected' }, obj.callback);
                        }
                    }
                }
                catch (e) {
                    adapter.log.error(`Cannot call ${obj.command}: ${e.message}`);
                    adapter.sendTo(obj.from, obj.command, { error: e }, obj.callback);
                }
            }
            else {
                try {
                    if (rpcClient && connected) {
                        const data = await rpcMethodCallAsync(obj.command, [
                            obj.message.ID,
                            obj.message.paramType,
                            obj.message.params
                        ]);
                        if (obj.callback) {
                            adapter.sendTo(obj.from, obj.command, {
                                result: data,
                                error: null
                            }, obj.callback);
                        }
                    }
                    else {
                        adapter.log.warn(`Cannot send "${obj.command}" "${obj.message.ID}": because not connected`);
                        if (obj.callback) {
                            adapter.sendTo(obj.from, obj.command, { error: 'not connected' }, obj.callback);
                        }
                    }
                }
                catch (e) {
                    adapter.log.error(`Cannot call ${obj.command}: ${e.message}`);
                    adapter.sendTo(obj.from, obj.command, { error: e }, obj.callback);
                }
            }
        },
        unload: async (callback) => {
            try {
                if (eventInterval) {
                    clearInterval(eventInterval);
                    eventInterval = null;
                }
                if (connInterval) {
                    clearInterval(connInterval);
                    connInterval = null;
                }
                if (connTimeout) {
                    clearTimeout(connTimeout);
                    connTimeout = null;
                }
                if (adapter.config && rpcClient) {
                    adapter.log.info(`${adapter.config.type}rpc -> ${adapter.config.homematicAddress}:${adapter.config.homematicPort}${homematicPath} init ${JSON.stringify([daemonURL, ''])}`);
                    try {
                        // tell CCU that we are no longer the client under this URL - legacy idk if necessary
                        await rpcMethodCallAsync('init', [daemonURL, '']);
                        if (connected) {
                            adapter.log.info('Disconnected');
                            connected = false;
                            adapter.setState('info.connection', false, true);
                        }
                        if (rpcServer && rpcServer.server) {
                            try {
                                rpcServer.server.close(() => {
                                    console.log('server closed.');
                                    rpcServer.server.unref();
                                });
                            }
                            catch (_a) {
                                // ignore
                            }
                        }
                        if (rpcClient && rpcClient.socket) {
                            try {
                                rpcClient.socket.destroy();
                            }
                            catch (_b) {
                                // ignore
                            }
                        }
                        if (typeof callback === 'function') {
                            callback();
                        }
                        callback = null;
                    }
                    catch (e) {
                        if (connected) {
                            adapter.log.info('Disconnected');
                            connected = false;
                            adapter.setState('info.connection', false, true);
                        }
                        adapter.log.error(`Cannot call init: [${daemonURL}, ""] ${e.message}`);
                        if (typeof callback === 'function') {
                            callback();
                        }
                        callback = null;
                    }
                }
                else {
                    if (typeof callback === 'function') {
                        callback();
                    }
                    callback = null;
                }
            }
            catch (e) {
                if (adapter && adapter.log) {
                    adapter.log.error(`Unload error: ${e.message}`);
                }
                else {
                    console.log(`Unload error: ${e.message}`);
                }
                if (typeof callback === 'function') {
                    callback();
                }
                callback = null;
            }
        }
    });
    return adapter;
}
/**
 * Main method inits rpc server and gets paramsets
 *
 * @return {Promise<void>}
 */
async function main() {
    homematicPath = adapter.config.daemon === 'virtual-devices' ? '/groups/' : '/';
    adapter.config.reconnectInterval = adapter.config.reconnectInterval || 30;
    if (adapter.config.reconnectInterval < 10) {
        adapter.log.error('Reconnect interval is less than 10 seconds. Set reconnect interval to 10 seconds.');
        adapter.config.reconnectInterval = 10;
    }
    adapter.config.checkInitInterval = adapter.config.checkInitInterval || 10;
    if (adapter.config.checkInitInterval < 10) {
        adapter.log.error('Check init interval is less than 10 seconds. Set init interval to 10 seconds.');
        adapter.config.checkInitInterval = 10;
    }
    adapter.setState('info.connection', false, true);
    if (adapter.config.type === 'bin') {
        rpc = require('binrpc');
        daemonProto = 'xmlrpc_bin://';
    }
    else {
        rpc = require('homematic-xmlrpc');
        adapter.config.type = 'xml';
        daemonProto = 'http://';
    }
    // Clean up objects if still hm-rpc.meta exist
    try {
        const doc = await adapter.getObjectListAsync({
            startkey: 'hm-rpc.meta',
            endkey: 'hm-rpc.meta\u9999'
        });
        if (doc && doc.rows) {
            if (doc.rows.length >= 50) {
                adapter.log.info('Cleaning up meta folder... this may take some time');
            }
            for (const row of doc.rows) {
                try {
                    await adapter.delForeignObjectAsync(row.id);
                }
                catch (e) {
                    adapter.log.warn(`Could not delete ${row.id}: ${e.message}`);
                }
            }
        }
    }
    catch (e) {
        adapter.log.error(`getObjectListAsync hm-rpc: ${e.message}`);
    }
    try {
        const res = await adapter.getObjectViewAsync('system', 'state', {
            startkey: `${adapter.namespace}.`,
            endkey: `${adapter.namespace}.\u9999`
        });
        if (res.rows) {
            for (const row of res.rows) {
                if (row.id === `${adapter.namespace}.updated`) {
                    continue;
                }
                const obj = row.value;
                if (!obj || !obj.native) {
                    adapter.log.warn(`State ${row.id} does not have native.`);
                    dpTypes[row.id] = { UNIT: '', TYPE: '' };
                }
                else {
                    dpTypes[row.id] = {
                        UNIT: obj.native.UNIT,
                        TYPE: obj.native.TYPE
                    };
                    if (typeof obj.native.MIN === 'number') {
                        dpTypes[row.id].MIN = obj.native.MIN;
                        dpTypes[row.id].MAX = obj.native.MAX;
                        if (dpTypes[row.id].MAX === 99) {
                            dpTypes[row.id].MAX = 100;
                        }
                        else if (dpTypes[row.id].MAX === 1.005 || dpTypes[row.id].MAX === 1.01) {
                            dpTypes[row.id].MAX = 1;
                        } // endElseIf
                    } // endIf
                }
                // apply new roles, that were defined later
                const key = row.id.split('.').pop();
                if (key && obj && obj.common && !obj.common.role && roles_1.metaRoles.dpNAME[key]) {
                    obj.common.role = roles_1.metaRoles.dpNAME[key];
                    await adapter.setForeignObjectAsync(obj._id, obj);
                }
            }
        }
    }
    catch (e) {
        adapter.log.error(`Could not get state view on start: ${e.message}`);
    }
    // Start Adapter
    initRpcServer();
} // endMain
/**
 * Sends init to RPC server
 *
 * @return {Promise<void>}
 */
async function sendInit() {
    try {
        if (rpcClient && (rpcClient.connected === undefined || rpcClient.connected)) {
            adapter.log.debug(`${adapter.config.type}rpc -> ${adapter.config.homematicAddress}:${adapter.config.homematicPort}${homematicPath} init ${JSON.stringify([daemonURL, clientId])}`);
            await rpcMethodCallAsync('init', [daemonURL, clientId]);
            if (adapter.config.daemon === 'CUxD') {
                try {
                    await getCuxDevices();
                    updateConnection();
                }
                catch (e) {
                    adapter.log.error(`getCuxDevices error: ${e.message}`);
                }
            }
            else {
                updateConnection();
            }
        }
    }
    catch (e) {
        adapter.log.error(`Init not possible, going to stop: ${e.message}`);
        setTimeout(() => adapter.stop && adapter.stop(), 30000);
    }
} // endSendInit
/**
 * Send ping to API, if error response, set status disconnected and try reconnect
 *
 * @return {Promise<void>}
 */
async function sendPing() {
    if (rpcClient) {
        adapter.log.debug('Send PING...');
        try {
            await rpcMethodCallAsync('ping', [clientId]);
            adapter.log.debug('PING ok');
        }
        catch (e) {
            adapter.log.error(`Ping error [${clientId}]: ${e.message}`);
            if (connected) {
                adapter.log.info('Disconnected');
                connected = false;
                adapter.setState('info.connection', false, true);
                connect(false);
            }
        }
    }
    else {
        adapter.log.warn('Called PING, but client does not exist');
        if (connected) {
            adapter.log.info('Disconnected');
            connected = false;
            adapter.setState('info.connection', false, true);
            connect(false);
        }
    }
} // endSendPing
const methods = {
    event: (err, params) => {
        if (err) {
            adapter.log.error(`${adapter.config.type}rpc <- received error event: ${err}`);
            return '';
        }
        if (!Array.isArray(params)) {
            adapter.log.error(`${adapter.config.type}rpc <- Invalid params "${params}" received`);
            return '';
        }
        adapter.log.debug(`${adapter.config.type}rpc <- event ${JSON.stringify(params)}`);
        let val;
        // CUxD ignores all prefixes!!
        if (params[0] === 'CUxD' || !params[0].includes(adapter.name)) {
            params[0] = adapter.namespace;
        }
        const channel = params[1].replace(':', '.').replace(FORBIDDEN_CHARS, '_');
        if (params[0] === clientId) {
            // convert back our clientId to our namespace
            params[0] = adapter.namespace;
        }
        const name = `${params[0]}.${channel}.${params[2]}`;
        if (dpTypes[name]) {
            // it shouldn't be necessary to scale on % values, see https://github.com/ioBroker/ioBroker.hm-rpc/issues/263
            // backward compatibility -> max===1 unit===%
            if (dpTypes[name].UNIT === '100%') {
                // || (dpTypes[name].UNIT === '%' && dpTypes[name].MAX === 1)) {
                val = Math.round(params[3] * 1000) / 10;
            }
            else {
                val = params[3];
            }
        }
        else {
            // val = params[3];
            // for every device we know (listDevices), there will be a dpType, so this way we filter out stuff like PONG event and https://github.com/ioBroker/ioBroker.hm-rpc/issues/298
            adapter.log.debug(`${adapter.config.type}rpc <- event: ${name}:${params[3]} discarded, no matching device`);
            return '';
        }
        adapter.log.debug(`${name} ==> UNIT: "${dpTypes[name] ? dpTypes[name].UNIT : 'none'}" (min: ${dpTypes[name] ? dpTypes[name].MIN : 'none'}, max: ${dpTypes[name] ? dpTypes[name].MAX : 'none'}) From "${params[3]}" => "${val}"`);
        adapter.setState(`${channel}.${params[2]}`, { val: val, ack: true });
        // unfortunately this is necessary
        return '';
    }
};
/**
 * Inits the RPC server
 *
 * @return {Promise<void>}
 */
async function initRpcServer() {
    var _a;
    adapter.config.useHttps = adapter.config.useHttps || false;
    // adapterPort was introduced in v1.0.1. If not set yet then try 2000
    const desiredAapterPort = parseInt(adapter.config.port) || parseInt(adapter.config.homematicPort) || 2000;
    const callbackAddress = adapter.config.callbackAddress || adapter.config.adapterAddress;
    const adapterPort = await adapter.getPortAsync(desiredAapterPort);
    daemonURL = `${daemonProto + callbackAddress}:${adapterPort}`;
    try {
        // somehow we cannot catch EADDRNOTAVAIL, also not with a cb here
        rpcServer = rpc.createServer({
            host: adapter.config.adapterAddress,
            port: adapterPort
        });
    }
    catch (e) {
        adapter.log.error(`Could not create RPC Server: ${e.message}`);
        return void adapter.restart();
    }
    // build up unique client id
    clientId = adapter.namespace;
    try {
        const obj = await adapter.getForeignObjectAsync(`system.adapter.${adapter.namespace}`);
        clientId = `${(_a = obj === null || obj === void 0 ? void 0 : obj.common) === null || _a === void 0 ? void 0 : _a.host}:${clientId}`;
    }
    catch (e) {
        adapter.log.warn(`Could not get hostname, using default id "${clientId}" to register: ${e.message}`);
    }
    clientId += `:${(0, crypto_1.randomBytes)(16).toString('hex')}`;
    adapter.log.info(`${adapter.config.type}rpc server is trying to listen on ${adapter.config.adapterAddress}:${adapterPort}`);
    adapter.log.info(`${adapter.config.type}rpc client is trying to connect to ${adapter.config.homematicAddress}:${adapter.config.homematicPort}${homematicPath} with ${JSON.stringify([daemonURL, clientId])}`);
    connect(true);
    // Not found has special structure and no callback
    rpcServer.on('NotFound', (method, params) => {
        adapter.log.warn(`${adapter.config.type}rpc <- undefined method ${method} with parameters ${typeof params === 'object' ? JSON.stringify(params).slice(0, 80) : params}`);
    });
    rpcServer.on('readdedDevice', (error, params, callback) => {
        adapter.log.info(`Readded device ${JSON.stringify(params)}`);
        callback(null, '');
    });
    rpcServer.on('firmwareUpdateStatusChanged', (error, params, callback) => {
        adapter.log.info(`Firmware update status of ${params[1]} changed to ${params[2]}`);
        callback(null, '');
    });
    rpcServer.on('replaceDevice', async (error, params, callback) => {
        const oldDeviceName = params[1];
        const newDeviceName = params[2];
        adapter.log.info(`Device "${oldDeviceName}" has been replaced by "${newDeviceName}"`);
        // remove the old device
        await adapter.deleteDeviceAsync(oldDeviceName);
        adapter.log.info(`Replaced device "${oldDeviceName}" deleted`);
        // add the new device
        adapter.log.info(`${adapter.config.type}rpc -> getDeviceDescription ${JSON.stringify([newDeviceName])}`);
        try {
            const res = await rpcMethodCallAsync('getDeviceDescription', [newDeviceName]);
            await createDevices([res]);
        }
        catch (e) {
            adapter.log.error(`Error while creating replacement device "${newDeviceName}": ${e.message}`);
        }
        callback(null, '');
    });
    rpcServer.on('error', (e) => {
        // not sure if this can really be triggered
        adapter.log.error(`RPC Server error: ${e.message}`);
    });
    rpcServer.on('system.multicall', (err, params, callback) => {
        updateConnection();
        const response = [];
        const events = params[0];
        for (const param of events) {
            if (param.methodName === 'event') {
                adapter.log.debug(`${adapter.config.type} multicall <${param.methodName}>: ${param.params}`);
                response.push(methods[param.methodName](null, param.params));
            }
            else {
                adapter.log.debug(`Unknown multicall event: ${param.methodName}: ${param.params}`);
                response.push('');
            }
        }
        callback(null, response);
    });
    rpcServer.on('system.listMethods', (err, params, callback) => {
        if (err) {
            adapter.log.warn(`Error on system.listMethods: ${err}`);
        }
        adapter.log.info(`${adapter.config.type}rpc <- system.listMethods ${JSON.stringify(params)}`);
        callback(null, [
            'event',
            'deleteDevices',
            'listDevices',
            'newDevices',
            'system.listMethods',
            'system.multicall',
            'setReadyConfig'
        ]);
    });
    rpcServer.on('event', (err, params, callback) => {
        if (err) {
            adapter.log.warn(`Error on event: ${err}`);
        }
        updateConnection();
        try {
            callback(null, methods.event(err, params));
        }
        catch (e) {
            adapter.log.error(`Cannot send response to event: ${e.message}`);
        }
    });
    rpcServer.on('newDevices', async (err, params, callback) => {
        if (err) {
            adapter.log.warn(`Error on newDevices: ${err}`);
        }
        let newDevices = params[1];
        if (!Array.isArray(newDevices)) {
            adapter.log.warn(`CCU delivered unexpected result (${params[1]}) on "newDevices": ${newDevices}`);
            newDevices = [];
        }
        adapter.log.info(`${adapter.config.type}rpc <- newDevices ${newDevices.length}`);
        // for a HmIP-adapter (and virtual-devices) we have to filter out the devices that
        // are already present if forceReinit is not set
        if (adapter.config.forceReInit === false &&
            (adapter.config.daemon === 'HMIP' || adapter.config.daemon === 'virtual-devices')) {
            let doc;
            try {
                doc = await adapter.getObjectViewAsync('hm-rpc', 'listDevices', {
                    startkey: `${adapter.namespace}.`,
                    endkey: `${adapter.namespace}.\u9999`
                });
            }
            catch (e) {
                adapter.log.error(`getObjectViewAsync hm-rpc: ${e.message}`);
            }
            if (doc && doc.rows) {
                for (const row of doc.rows) {
                    if (row.id === `${adapter.namespace}.updated`) {
                        continue;
                    }
                    // lets get the device description
                    const val = row.value;
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
                        if (val.ADDRESS && !adapter.config.dontDelete) {
                            if (val.ADDRESS.includes(':')) {
                                const address = val.ADDRESS.replace(':', '.').replace(FORBIDDEN_CHARS, '_');
                                const parts = address.split('.');
                                try {
                                    await adapter.deleteChannelAsync(parts[parts.length - 2], parts[parts.length - 1]);
                                    adapter.log.info(`obsolete channel ${address} ${JSON.stringify(address)} deleted`);
                                }
                                catch (e) {
                                    adapter.log.error(`Could not delete obsolete channel ${address} ${JSON.stringify(address)}: ${e.message}`);
                                }
                            }
                            else {
                                try {
                                    await adapter.deleteDeviceAsync(val.ADDRESS);
                                    adapter.log.info(`obsolete device ${val.ADDRESS} deleted`);
                                }
                                catch (e) {
                                    adapter.log.error(`Could not delete obsolete device ${val.ADDRESS}: ${e.message}`);
                                }
                            }
                        }
                    }
                    else {
                        // we can remove the item at index because it is already registered
                        // to ioBroker
                        newDevices.splice(index, 1);
                    }
                }
            }
            adapter.log.info(`new ${adapter.config.daemon} devices/channels after filter: ${newDevices.length}`);
            await createDevices(newDevices);
        }
        else {
            await createDevices(newDevices);
        }
        // call it otherwise HMIP won't work
        callback(null, '');
    });
    rpcServer.on('listDevices', async (err, params, callback) => {
        if (err) {
            adapter.log.warn(`Error on listDevices: ${err}`);
        }
        adapter.log.info(`${adapter.config.type}rpc <- listDevices ${JSON.stringify(params)}`);
        let doc;
        try {
            doc = await adapter.getObjectViewAsync('hm-rpc', 'listDevices', {
                startkey: `${adapter.namespace}.`,
                endkey: `${adapter.namespace}.\u9999`
            });
        }
        catch (e) {
            adapter.log.error(`Error on listDevices (getObjectView): ${e.message}`);
        }
        const response = [];
        // we only fill the response if this isn't a force reinit and
        // if the adapter instance is not bothering with HmIP (which seems to work slightly different in terms of XMLRPC)
        if (!adapter.config.forceReInit && adapter.config.daemon !== 'HMIP' && doc && doc.rows) {
            for (const row of doc.rows) {
                if (row.id === `${adapter.namespace}.updated`) {
                    continue;
                }
                const val = row.value;
                if (val.ADDRESS) {
                    response.push({ ADDRESS: val.ADDRESS, VERSION: val.VERSION });
                }
            }
        }
        adapter.log.info(`${adapter.config.type}rpc -> ${response.length} devices`);
        try {
            for (let r = response.length - 1; r >= 0; r--) {
                if (!response[r].ADDRESS) {
                    adapter.log.warn(`${adapter.config.type}rpc -> found empty entry at position ${r}!`);
                    response.splice(r, 1);
                }
            }
            callback(null, response);
        }
        catch (e) {
            adapter.log.error(`Cannot respond on listDevices: ${e.message}`);
            adapter.log.error(JSON.stringify(response));
        }
    });
    rpcServer.on('deleteDevices', (err, params, callback) => {
        if (err) {
            adapter.log.warn(`Error on deleteDevices: ${err.message}`);
        }
        adapter.log.info(`${adapter.config.type}rpc <- deleteDevices ${params[1].length}`);
        for (let deviceName of params[1]) {
            if (deviceName.includes(':')) {
                deviceName = deviceName.replace(':', '.').replace(FORBIDDEN_CHARS, '_');
                adapter.log.info(`channel ${deviceName} ${JSON.stringify(deviceName)} deleted`);
                const parts = deviceName.split('.');
                adapter.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
            }
            else {
                adapter.log.info(`device ${deviceName} deleted`);
                adapter.deleteDevice(deviceName);
            }
        }
        try {
            callback(null, '');
        }
        catch (e) {
            adapter.log.error(`Cannot response on deleteDevices: ${e.message}`);
        }
    });
    rpcServer.on('setReadyConfig', (err, params, callback) => {
        if (err) {
            adapter.log.warn(`Error on setReadyConfig: ${err.message}`);
        }
        adapter.log.info(`${adapter.config.type}rpc <- setReadyConfig ${JSON.stringify(params)}`);
        try {
            callback(null, '');
        }
        catch (e) {
            adapter.log.error(`Cannot response on setReadyConfig: ${e.message}`);
        }
    });
} // endInitRPCServer
/**
 * Adds the paramset objects of the given paramset to the given channel
 *
 * @param channel - channel object with at least "_id" property
 * @param paramset - paramset object retrived by CCU
 */
async function addParamsetObjects(channel, paramset) {
    for (const [key, paramObj] of Object.entries(paramset)) {
        const commonType = {
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
        };
        const obj = {
            type: 'state',
            common: {
                name: key,
                role: '',
                def: paramObj.DEFAULT,
                type: commonType[paramObj.TYPE] || 'mixed',
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
        if (obj.common.type === 'number' && typeof paramObj.MIN !== 'boolean' && typeof paramObj.MAX !== 'boolean') {
            obj.common.min = typeof paramObj.MIN === 'string' ? parseFloat(paramObj.MIN) : paramObj.MIN;
            obj.common.max = typeof paramObj.MAX === 'string' ? parseFloat(paramObj.MAX) : paramObj.MAX;
            if (paramObj.TYPE === 'ENUM' && paramObj.VALUE_LIST) {
                obj.common.states = {};
                for (let i = 0; i < paramObj.VALUE_LIST.length; i++) {
                    obj.common.states[i] = paramObj.VALUE_LIST[i];
                }
            } // endIf
            if (paramObj.SPECIAL) {
                addCommonSpecial(paramObj, obj);
            } // endIf
        } // endIf
        if (paramObj.STATES) {
            obj.common.states = paramObj.STATES;
        }
        // temporary fix for https://github.com/eq-3/occu/issues/105 and LEVEL w. o. %
        if (key === 'LEVEL' &&
            typeof paramObj.MIN === 'number' &&
            typeof paramObj.MAX === 'number' &&
            paramObj.UNIT === undefined) {
            paramObj.UNIT = '%';
        } // endIf
        if (paramObj.UNIT === '100%') {
            obj.common.unit = '%';
            // when unit is 100% we have min: 0, max: 1, we scale it between 0 and 100
            obj.common.max = 100;
        }
        else if (paramObj.UNIT !== '' && paramObj.UNIT !== '""') {
            obj.common.unit = paramObj.UNIT;
            if (obj.common.unit === '�C' || obj.common.unit === '&#176;C') {
                obj.common.unit = '°C';
            }
            else if (obj.common.unit === '�F' || obj.common.unit === '&#176;F') {
                obj.common.unit = '°F';
            }
        }
        if (roles_1.metaRoles.dpCONTROL && roles_1.metaRoles.dpCONTROL[obj.native.CONTROL]) {
            obj.common.role = roles_1.metaRoles.dpCONTROL[obj.native.CONTROL];
        }
        else if (roles_1.metaRoles.chTYPE_dpNAME && roles_1.metaRoles.chTYPE_dpNAME[`${channel.native.TYPE}.${key}`]) {
            obj.common.role = roles_1.metaRoles.chTYPE_dpNAME[`${channel.native.TYPE}.${key}`];
        }
        else if (roles_1.metaRoles.dpNAME && roles_1.metaRoles.dpNAME[key]) {
            obj.common.role = roles_1.metaRoles.dpNAME[key];
        }
        else if (paramObj.TYPE === 'ACTION' && obj.common.write) {
            obj.common.role = 'button';
        } // endElseIf
        // sometimes min/max/def is string on hmip meta in combination with value_list
        // note, that there are cases (Virtual heating devices) which also provide min/max/def with
        // strings, but does not match entries in the value list, thus we have to check indexOf().
        if (paramObj.VALUE_LIST) {
            if (typeof paramObj.MIN === 'string') {
                if (paramObj.VALUE_LIST.includes(paramObj.MIN)) {
                    obj.common.min = paramObj.VALUE_LIST.indexOf(paramObj.MIN);
                }
                else {
                    obj.common.min = parseInt(paramObj.MIN);
                }
            }
            if (typeof paramObj.MAX === 'string') {
                if (paramObj.VALUE_LIST.includes(paramObj.MAX)) {
                    obj.common.max = paramObj.VALUE_LIST.indexOf(paramObj.MAX);
                }
                else {
                    obj.common.max = parseInt(paramObj.MAX);
                }
            }
            if (typeof paramObj.DEFAULT === 'string') {
                if (paramObj.VALUE_LIST.includes(paramObj.DEFAULT)) {
                    obj.common.def = paramObj.VALUE_LIST.indexOf(paramObj.DEFAULT);
                }
                else {
                    obj.common.def = parseInt(paramObj.DEFAULT);
                }
            }
        }
        if (obj.common.role === 'state' && obj.common.write) {
            obj.common.role = 'switch';
        }
        else if (obj.common.role === 'level.color.hue') {
            obj.common.max = 200;
        }
        else if (obj.common.role === 'value.rssi') {
            obj.common.unit = 'dBm';
        }
        else if (obj.common.role === 'value.voltage') {
            obj.common.unit = 'V';
        }
        else if (obj.common.role === 'value.window' && paramObj.TYPE === 'BOOL') {
            // if its value.window but its a boolean it should be sensor.window
            obj.common.role = 'sensor.window';
        }
        else if (obj.common.role === 'value.temperature') {
            obj.common.unit = '°C';
        }
        if (paramObj.OPERATIONS & 8) {
            obj.common.role = 'indicator.service';
        }
        if (typeof obj.common.role !== 'string' && typeof obj.common.role !== 'undefined') {
            throw new Error(`typeof obj.common.role ${typeof obj.common.role}`);
        }
        const dpID = `${adapter.namespace}.${channel._id}.${key}`;
        dpTypes[dpID] = {
            UNIT: paramObj.UNIT,
            TYPE: paramObj.TYPE
        };
        if (typeof paramObj.MIN === 'number') {
            dpTypes[dpID].MIN = paramObj.MIN;
            dpTypes[dpID].MAX = paramObj.MAX;
            // Humidity is from 0 to 99. It is wrong.
            if (dpTypes[dpID].MAX === 99) {
                dpTypes[dpID].MAX = 100;
            }
        }
        if (key === 'LEVEL' && paramset.WORKING) {
            obj.common.workingID = 'WORKING';
        }
        // it seems like if devices connect to a HMIP-HAP, RSSI_DEVICE shows 128, eq3 should fix this, but lets workaround #346
        if (key === 'RSSI_DEVICE') {
            obj.common.max = 128;
        }
        try {
            const res = await adapter.extendObjectAsync(`${channel._id}.${key}`, obj);
            adapter.log.debug(`object ${res.id} extended`);
        }
        catch (e) {
            adapter.log.error(`Could not extend object ${channel._id}.${key}: ${e.message}`);
        }
    } // endFor
} // endAddParamsetObjects
/**
 * Get value paramsets and add them
 *
 * @param valueParamsets
 */
async function getValueParamsets(valueParamsets) {
    for (const obj of valueParamsets) {
        try {
            const cid = `${obj.native.PARENT_TYPE}.${obj.native.TYPE}.${obj.native.VERSION}`;
            adapter.log.debug(`getValueParamsets ${cid}`);
            // if meta values are cached for E-paper we extend this cached meta values by e-paper states
            if (obj.native && obj.native.PARENT_TYPE === 'HM-Dis-EP-WM55' && obj.native.TYPE === 'MAINTENANCE') {
                addEPaperToMeta();
            }
            adapter.log.info(`${adapter.config.type}rpc -> getParamsetDescription ${JSON.stringify([obj.native.ADDRESS, 'VALUES'])}`);
            metaValues[cid] = await rpcMethodCallAsync('getParamsetDescription', [obj.native.ADDRESS, 'VALUES']);
            if (obj.native && obj.native.PARENT_TYPE === 'HM-Dis-EP-WM55' && obj.native.TYPE === 'MAINTENANCE') {
                addEPaperToMeta();
            }
            await addParamsetObjects(obj, metaValues[cid]);
        }
        catch (e) {
            adapter.log.error(`Error on getParamsetDescription for [${obj.native.ADDRESS}, 'VALUES']": ${e.message}`);
        }
    }
    if (valueParamsets.length) {
        // reset
        // Inform hm-rega about new devices
        try {
            await adapter.setStateAsync('updated', true, false);
        }
        catch (e) {
            adapter.log.error(`Could not inform hm-rega about new devices: ${e.message}`);
        }
        // If it has been a force reinit run, set it to false and restart
        if (adapter.config.forceReInit) {
            adapter.log.info('Restarting now, because we had a forced reinitialization run');
            try {
                await adapter.extendForeignObjectAsync(`system.adapter.${adapter.namespace}`, {
                    native: { forceReInit: false }
                });
            }
            catch (e) {
                adapter.log.error(`Could not restart and set forceReinit to false: ${e.message}`);
            }
        }
    }
} // endGetValueParamsets
function addEPaperToMeta() {
    // Check all versions from 9 to 12
    for (let i = 9; i < 13; i++) {
        const id = `HM-Dis-EP-WM55.MAINTENANCE.${i}`;
        if (!metaValues[id] || !metaValues[id].EPAPER_LINE2) {
            // Add the EPAPER States to the Maintenance channel if they are non-existent
            metaValues[id] = metaValues[id] || {};
            adapter.log.debug(`[EPAPER] Add E-Paper to Meta on ${JSON.stringify(metaValues[id])}`);
            const obj = metaValues[id];
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
async function createDevices(deviceArr) {
    const queueValueParamsets = [];
    for (const device of deviceArr) {
        if (typeof device.ADDRESS !== 'string') {
            // check that ADDRESS is given, else we don't know the id
            adapter.log.error(`Device has no valid property ADDRESS: ${JSON.stringify(device)}`);
            continue;
        }
        let type;
        let role;
        let icon;
        if (device.PARENT) {
            type = 'channel';
            role =
                roles_1.metaRoles.chTYPE && roles_1.metaRoles.chTYPE[device.TYPE]
                    ? roles_1.metaRoles.chTYPE && roles_1.metaRoles.chTYPE[device.TYPE]
                    : undefined;
        }
        else {
            type = 'device';
            if (!images_1.images[device.TYPE]) {
                adapter.log.warn(`No image for "${device.TYPE}" found.`);
            }
            icon = images_1.images[device.TYPE] ? `/icons/${images_1.images[device.TYPE]}` : '';
        }
        const id = device.ADDRESS.replace(':', '.').replace(FORBIDDEN_CHARS, '_');
        const obj = {
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
        const dpID = `${adapter.namespace}.${obj._id}`;
        dpTypes[dpID] = {
            UNIT: device.UNIT,
            TYPE: device.TYPE
        };
        if (typeof device.MIN === 'number') {
            dpTypes[dpID].MIN = device.MIN;
            dpTypes[dpID].MAX = device.MAX;
            // e. g. Humidity is from 0 to 99. It is wrong. todo: logically ok, but is it? Can a sensor deliver 100 % humidity?
            if (dpTypes[dpID].MAX === 99) {
                dpTypes[dpID].MAX = 100;
            }
        }
        if (roles_1.metaRoles.dvTYPE && obj.native && roles_1.metaRoles.dvTYPE[device.PARENT_TYPE]) {
            obj.common.role = roles_1.metaRoles.dvTYPE[device.PARENT_TYPE];
        }
        try {
            const res = await adapter.setObjectAsync(id, obj);
            adapter.log.debug(`object ${res.id} created`);
        }
        catch (e) {
            adapter.log.error(`object ${id} error on creation: ${e.message}`);
        }
        if (obj.type === 'channel') {
            queueValueParamsets.push(obj);
        }
    } // endFor
    await getValueParamsets(queueValueParamsets);
}
/**
 * Get all CuxD devices
 *
 * @return {Promise<void>}
 */
async function getCuxDevices() {
    if (rpcClient) {
        // request devices from CUxD
        try {
            let newDevices = await rpcMethodCallAsync('listDevices', []);
            if (!Array.isArray(newDevices)) {
                adapter.log.warn(`CuxD delivered unexpected result on "listDevices": ${newDevices}`);
                newDevices = [];
            }
            adapter.log.info(`${adapter.config.type}rpc -> listDevices ${newDevices.length}`);
            if (adapter.config.forceReInit === false) {
                let doc;
                try {
                    doc = await adapter.getObjectViewAsync('hm-rpc', 'listDevices', {
                        startkey: `${adapter.namespace}.`,
                        endkey: `${adapter.namespace}.\u9999`
                    });
                }
                catch (e) {
                    adapter.log.error(`getObjectView hm-rpc: ${e.message}`);
                }
                if (doc && doc.rows) {
                    for (const row of doc.rows) {
                        if (row.id === `${adapter.namespace}.updated`) {
                            continue;
                        }
                        // lets get the device description
                        const val = row.value;
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
                            if (val.ADDRESS && !adapter.config.dontDelete) {
                                if (val.ADDRESS.includes(':')) {
                                    const address = val.ADDRESS.replace(':', '.').replace(FORBIDDEN_CHARS, '_');
                                    const parts = address.split('.');
                                    adapter.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
                                    adapter.log.info(`obsolete channel ${address} ${JSON.stringify(address)} deleted`);
                                }
                                else {
                                    adapter.deleteDevice(val.ADDRESS);
                                    adapter.log.info(`obsolete device ${val.ADDRESS} deleted`);
                                }
                            }
                        }
                        else {
                            // we can remove the item at index because it is already registered
                            // to ioBroker
                            newDevices.splice(index, 1);
                        }
                    }
                }
                adapter.log.info(`new CUxD devices/channels after filter: ${newDevices.length}`);
                await createDevices(newDevices);
            }
            else {
                await createDevices(newDevices);
            }
        }
        catch (e) {
            adapter.log.error(`Cannot call listDevices: ${e.message}`);
        }
    }
}
function updateConnection() {
    lastEvent = new Date().getTime();
    if (!connected) {
        adapter.log.info('Connected');
        connected = true;
        adapter.setState('info.connection', true, true);
    }
    if (connInterval) {
        adapter.log.debug('clear connecting interval');
        clearInterval(connInterval);
        connInterval = null;
    }
    if (connTimeout) {
        adapter.log.debug('clear connecting timeout');
        clearTimeout(connTimeout);
        connTimeout = null;
    }
    // Virtual Devices API does now also support PING (tested with 3.55.5.20201226 - see #308)
    if (!eventInterval) {
        adapter.log.debug('start ping interval');
        eventInterval = setInterval(keepAlive, (adapter.config.checkInitInterval * 1000) / 2);
    }
}
function connect(isFirst) {
    if (!rpcClient && !adapter.config.useHttps) {
        try {
            rpcClient = rpc.createClient({
                host: adapter.config.homematicAddress,
                port: adapter.config.homematicPort,
                path: homematicPath,
                reconnectTimeout: adapter.config.reconnectInterval * 1000
            });
        }
        catch (e) {
            adapter.log.error(`Could not create non-secure ${adapter.config.type}-rpc client: ${e.message}`);
            return void adapter.restart();
        } // endCatch
        // If we have bin-rpc, only need it here because bin-rpc cannot have https
        if (rpcClient.on) {
            rpcClient.on('error', (err) => {
                adapter.log.error(`Socket error: ${err}`);
            });
        } // endIf
    }
    else if (!rpcClient) {
        adapter.getForeignObject('system.config', (err, obj) => {
            let password;
            let username;
            if (obj && obj.native && obj.native.secret) {
                password = tools.decrypt(obj.native.secret, adapter.config.password || '');
                username = tools.decrypt(obj.native.secret, adapter.config.username || '');
            }
            else {
                password = tools.decrypt('Zgfr56gFe87jJOM', adapter.config.password || '');
                username = tools.decrypt('Zgfr56gFe87jJOM', adapter.config.username || '');
            } // endElse
            try {
                rpcClient = rpc.createSecureClient({
                    host: adapter.config.homematicAddress,
                    port: adapter.config.homematicPort,
                    path: homematicPath,
                    reconnectTimeout: adapter.config.reconnectInterval * 1000,
                    basic_auth: { user: username, pass: password },
                    rejectUnauthorized: false
                });
            }
            catch (e) {
                adapter.log.error(`Could not create secure ${adapter.config.type}-rpc client: ${e.message}`);
                return void adapter.restart();
            } // endCatch
        });
    } // endElseIf
    connTimeout = null;
    adapter.log.debug('Connect...');
    if (eventInterval) {
        adapter.log.debug('clear ping interval');
        clearInterval(eventInterval);
        eventInterval = null;
    }
    if (isFirst) {
        // create async methods at first init
        rpcMethodCallAsync = (method, params) => {
            return new Promise((resolve, reject) => {
                rpcClient.methodCall(method, params, (err, res) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(res);
                    }
                });
            });
        };
        sendInit();
    }
    // Periodically try to reconnect
    if (!connInterval) {
        adapter.log.debug('start connecting interval');
        connInterval = setInterval(() => sendInit(), adapter.config.reconnectInterval * 1000);
    }
}
function keepAlive() {
    adapter.log.debug('[KEEPALIVE] Check if connection is alive');
    if (connInterval) {
        clearInterval(connInterval);
        connInterval = null;
    }
    const _now = Date.now();
    // Check last event time. If timeout => send init again
    if (!lastEvent || _now - lastEvent >= adapter.config.checkInitInterval * 1000) {
        adapter.log.debug('[KEEPALIVE] Connection timed out, initializing new connection');
        connect(false);
    }
    else {
        sendPing();
    }
} // endKeepAlive
/**
 * Derives the common properties of a Paramset SPECIAL attribute
 *
 * @param paramObj Paramset Object with SPECIAL property
 * @param obj ioBroker state object which will be extended
 */
function addCommonSpecial(paramObj, obj) {
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
// If started as allInOne/compact mode => return function to create instance
if (require.main === module) {
    startAdapter({ name: 'hm-rpc' });
}
else {
    // compact mode
    module.exports = startAdapter;
} // endElse
//# sourceMappingURL=main.js.map