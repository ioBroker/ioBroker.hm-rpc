/*
 * Copyright (c) 2014-2021 bluefox <dogafox@gmail.com>
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
import * as utils from '@iobroker/adapter-core';
import { images } from './lib/images';
import * as tools from './lib/tools';
import { metaRoles } from './lib/roles';
let connected = false;
const displays: Record<string, any> = {};
let adapter: ioBroker.Adapter;
let rpcMethodCallAsync: any;
let clientId: string;

let rpc: any;
let rpcClient: any;

let rpcServer: any;

const metaValues: Record<string, any> = {};
const dpTypes: Record<string, any> = {};

let lastEvent = 0;
let eventInterval: NodeJS.Timer | null;
let connInterval: NodeJS.Timer | null;
let connTimeout: NodeJS.Timeout | null;
let daemonURL = '';
let daemonProto = '';
let homematicPath: string;
// msgBuffer = [{line: line2, icon: icon2}, {line: line3, icon: icon3}, {line: '', icon: ''}];
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

// Signale
//      0xF0 AUS
//      0xF1 Rotes Blitzen
//      0xF2 Grünes Blitzen
//      0xF3 Orangenes Blitzen

function number2hex(num: number | string): string {
    if (typeof num === 'number') {
        num = num.toString(16).toUpperCase();
        if (num.length < 2) {
            num = `0${num}`;
        }
        num = `0x${num}`;
    }
    return num;
}

function combineEPaperCommand(lines: any, signal: any, ton: any, repeats: any, offset: any) {
    signal = number2hex(signal || '0xF0');
    ton = number2hex(ton || '0xC0');
    const substitutions: Record<string, string> = {
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
            } else {
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
    } else if (repeats < 11) {
        command = `${command}0xD${repeats - 1},0x1D,`;
    } else if (repeats === 11) {
        command = `${command}0xDA,0x1D,`;
    } else if (repeats === 12) {
        command = `${command}0xDB,0x1D,`;
    } else if (repeats === 13) {
        command = `${command}0xDC,0x1D,`;
    } else if (repeats === 14) {
        command = `${command}0xDD,0x1D,`;
    } else {
        command = `${command}0xDE,0x1D,`;
    }

    if (offset <= 100) {
        command = `${command}0xE${offset / 10 - 1},0x16,`;
    } else if (offset <= 110) {
        command = `${command}0xEA,0x16,`;
    } else if (offset <= 120) {
        command = `${command}0xEB,0x16,`;
    } else if (offset <= 130) {
        command = `${command}0xEC,0x16,`;
    } else if (offset <= 140) {
        command = `${command}0xED,0x16,`;
    } else if (offset <= 150) {
        command = `${command}0xEE,0x16,`;
    } else {
        command = `${command}0xEF,0x16,`;
    }

    command = `${command + signal},0x03`;
    return command;
}

async function controlEPaper(id: string, data: any) {
    const tmp = id.split('.');
    tmp[3] = '3';
    tmp[4] = 'SUBMIT';

    const val = combineEPaperCommand(data.lines, data.signal || '0xF0', data.tone || '0xC0', data.repeats, data.offset);

    try {
        if (rpcClient && connected) {
            await rpcMethodCallAsync('setValue', [`${tmp[2]}:${tmp[3]}`, tmp[4], val]);
        } else {
            adapter.log.warn(`Cannot setValue "${id}", because not connected.`);
        }
    } catch (e: any) {
        adapter.log.error(
            `${adapter.config.type}rpc -> setValue ${JSON.stringify([`${tmp[2]}:${tmp[3]}`, tmp[4], val])}`
        );
        adapter.log.error(`Cannot call setValue: ${e.message}`);
    }
}

async function readSignals(id: string) {
    displays[id] = null;
    const data: Record<string, any> = {
        lines: [{}, {}, {}],
        signal: '0xF0',
        tone: '0xC0'
    };

    const promises = [];

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_LINE2`, (err, state) => {
                data.lines[0].line = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_ICON2`, (err, state) => {
                data.lines[0].icon = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_LINE3`, (err, state) => {
                data.lines[1].line = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_ICON3`, (err, state) => {
                data.lines[1].icon = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_LINE4`, (err, state) => {
                data.lines[2].line = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_ICON4`, (err, state) => {
                data.lines[2].icon = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_SIGNAL`, (err, state) => {
                data.signal = state ? state.val || '0xF0' : '0xF0';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_TONE`, (err, state) => {
                data.tone = state ? state.val || '0xC0' : '0xC0';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_TONE_INTERVAL`, (err, state) => {
                data.offset = state ? state.val : 10;
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_TONE_REPETITIONS`, (err, state) => {
                data.repeats = state ? state.val : 1;
                resolve();
            });
        })
    );

    await Promise.all(promises);
    controlEPaper(id, data);
} // endReadSignals

async function readSettings(id: string) {
    displays[id] = null;
    const data: Record<string, any> = {
        lines: [{}, {}, {}],
        signal: '0xF0',
        tone: '0xC0'
    };

    const promises = [];

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_LINE2`, (err, state) => {
                data.lines[0].line = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_ICON2`, (err, state) => {
                data.lines[0].icon = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_LINE3`, (err, state) => {
                data.lines[1].line = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_ICON3`, (err, state) => {
                data.lines[1].icon = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_LINE4`, (err, state) => {
                data.lines[2].line = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    promises.push(
        new Promise<void>(resolve => {
            adapter.getForeignState(`${id}.0.EPAPER_ICON4`, (err, state) => {
                data.lines[2].icon = state ? state.val || '' : '';
                resolve();
            });
        })
    );

    await Promise.all(promises);
    controlEPaper(id, data);
} // endReadSettings

function startAdapter(options: ioBroker.AdapterOptions) {
    options = options || {};

    Object.assign(options, {
        name: 'hm-rpc',
        error: (e: any) => {
            if (e.code === 'EADDRNOTAVAIL') {
                adapter.log.error(
                    `Address ${adapter.config.adapterAddress} not available, maybe your HOST IP has changed due to migration`
                );
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
        stateChange: async (id: string, state: ioBroker.State) => {
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
            } else if (type === 'EPAPER_SIGNAL' || type === 'EPAPER_TONE') {
                const _id = `${tmp[0]}.${tmp[1]}.${tmp[2]}`;
                if (displays[_id] && displays[_id].timer) {
                    clearTimeout(displays[_id].timer);
                }
                displays[_id] = { timer: setTimeout(readSignals, 300, _id), withTone: true };
                return;
            } else if (tmp[4] === 'DISPLAY_DATA_STRING') {
                // new EPAPER HMIP-WRCD has own states but needs to encode special chars by DIN_66003
                /** @ts-expect-error todo */
                val = tools.replaceSpecialChars(state.val || '');
                adapter.log.debug(`Encoded ${state.val} to ${val}`);
                /** @ts-expect-error todo */
            } else if (tmp[4] === 'COMBINED_PARAMETER' && /DDS=.+,/g.test(state.val)) {
                // new EPAPER and DISPLAY_DATA_STRING is given, we need to replace
                let text = state.val;
                /** @ts-expect-error types needed */
                for (const line of text.split(/},(\s+)?{/g)) {
                    if (line === undefined) {
                        continue;
                    }
                    const start = line.search(/DDS=.+/g) + 4;
                    const end = line.indexOf(',', start);
                    const origText = line.slice(start, end);
                    const replacedText = tools.replaceSpecialChars(origText);

                    const lineReplaced = line.replace(`DDS=${origText}`, `DDS=${replacedText}`);
                    /** @ts-expect-error todo */
                    text = text.replace(line, lineReplaced);
                } // endFor
                val = text;
                adapter.log.debug(`Encoded ${state.val} to ${val}`);
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

            adapter.log.debug(`setValue ${JSON.stringify([`${tmp[2]}:${tmp[3]}`, tmp[4], val])} ${type}`);

            try {
                if (rpcClient && connected) {
                    await rpcMethodCallAsync('setValue', [`${tmp[2]}:${tmp[3]}`, tmp[4], val]);
                } else {
                    adapter.log.warn(`Cannot setValue "${id}", because not connected.`);
                }
            } catch (e: any) {
                adapter.log.error(
                    `${adapter.config.type}rpc -> setValue ${JSON.stringify([
                        `${tmp[2]}:${tmp[3]}`,
                        tmp[4],
                        state.val
                    ])} ${type}`
                );
                adapter.log.error(`Cannot call setValue: ${e.message}`);
            }
        },
        // Add messagebox Function for ioBroker.occ
        message: async (obj: ioBroker.Message) => {
            adapter.log.debug(`[MSSG] Received: ${JSON.stringify(obj)}`);

            if (
                obj.command === undefined ||
                obj.command === null ||
                obj.message === undefined ||
                obj.message === null
            ) {
                adapter.log.warn(
                    `Received invalid command via message "${obj.command}" "${JSON.stringify(obj.message)}" from ${
                        obj.from
                    }`
                );
                if (obj.callback) {
                    adapter.sendTo(obj.from, obj.command, { error: 'Invalid command' }, obj.callback);
                }
                return;
            }

            /** @ts-expect-error types needed */
            if (obj.message.params === undefined || obj.message.params === null) {
                try {
                    if (rpcClient && connected) {
                        // if device specific command, send it's ID and paramType
                        const data = await rpcMethodCallAsync(
                            obj.command,
                            /** @ts-expect-error types needed */
                            obj.message.ID !== undefined ? [obj.message.ID, obj.message.paramType] : []
                        );
                        if (obj.callback) {
                            adapter.sendTo(
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
                        /** @ts-expect-error types needed */
                        adapter.log.warn(`Cannot send "${obj.command}" "${obj.message.ID}": because not connected`);
                        if (obj.callback) {
                            adapter.sendTo(obj.from, obj.command, { error: 'not connected' }, obj.callback);
                        }
                    }
                } catch (e: any) {
                    adapter.log.error(`Cannot call ${obj.command}: ${e.message}`);
                    adapter.sendTo(obj.from, obj.command, { error: e }, obj.callback);
                }
            } else {
                try {
                    if (rpcClient && connected) {
                        const data = await rpcMethodCallAsync(obj.command, [
                            /** @ts-expect-error types needed */
                            obj.message.ID,
                            /** @ts-expect-error types needed */
                            obj.message.paramType,
                            /** @ts-expect-error types needed */
                            obj.message.params
                        ]);
                        if (obj.callback) {
                            adapter.sendTo(
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
                        /** @ts-expect-error types needed */
                        adapter.log.warn(`Cannot send "${obj.command}" "${obj.message.ID}": because not connected`);
                        if (obj.callback) {
                            adapter.sendTo(obj.from, obj.command, { error: 'not connected' }, obj.callback);
                        }
                    }
                } catch (e: any) {
                    adapter.log.error(`Cannot call ${obj.command}: ${e.message}`);
                    adapter.sendTo(obj.from, obj.command, { error: e }, obj.callback);
                }
            }
        },
        unload: async (callback: null | (() => void)) => {
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
                    adapter.log.info(
                        `${adapter.config.type}rpc -> ${adapter.config.homematicAddress}:${
                            adapter.config.homematicPort
                        }${homematicPath} init ${JSON.stringify([daemonURL, ''])}`
                    );
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
                            } catch {
                                // ignore
                            }
                        }

                        if (rpcClient && rpcClient.socket) {
                            try {
                                rpcClient.socket.destroy();
                            } catch {
                                // ignore
                            }
                        }

                        if (typeof callback === 'function') {
                            callback();
                        }
                        callback = null;
                    } catch (e: any) {
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
                } else {
                    if (typeof callback === 'function') {
                        callback();
                    }
                    callback = null;
                }
            } catch (e: any) {
                if (adapter && adapter.log) {
                    adapter.log.error(`Unload error: ${e.message}`);
                } else {
                    console.log(`Unload error: ${e.message}`);
                }
                if (typeof callback === 'function') {
                    callback();
                }
                callback = null;
            }
        }
    });

    /** @ts-expect-error types needed */
    adapter = new utils.Adapter(options);

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
    } else {
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
                } catch (e: any) {
                    adapter.log.warn(`Could not delete ${row.id}: ${e.message}`);
                }
            }
        }
    } catch (e: any) {
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
                } else {
                    dpTypes[row.id] = {
                        UNIT: obj.native.UNIT,
                        TYPE: obj.native.TYPE,
                        MIN: obj.native.MIN,
                        MAX: obj.native.MAX
                    };

                    if (typeof dpTypes[row.id].MIN === 'number') {
                        dpTypes[row.id].MIN = parseFloat(dpTypes[row.id].MIN);
                        dpTypes[row.id].MAX = parseFloat(dpTypes[row.id].MAX);

                        /*
                        if (dpTypes[row.id].UNIT === '100%') {
                            dpTypes[row.id].UNIT = '%';
                        }
                         */
                        if (dpTypes[row.id].MAX === 99) {
                            dpTypes[row.id].MAX = 100;
                        } else if (dpTypes[row.id].MAX === 1.005 || dpTypes[row.id].MAX === 1.01) {
                            dpTypes[row.id].MAX = 1;
                        } // endElseIf
                    } // endIf
                }

                // apply new roles, that were defined later
                const key = row.id.split('.').pop();
                if (key && obj && obj.common && !obj.common.role && metaRoles.dpNAME[key]) {
                    obj.common.role = metaRoles.dpNAME[key];
                    await adapter.setForeignObjectAsync(obj._id, obj);
                }
            }
        }
    } catch (e: any) {
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
            adapter.log.debug(
                `${adapter.config.type}rpc -> ${adapter.config.homematicAddress}:${
                    adapter.config.homematicPort
                }${homematicPath} init ${JSON.stringify([daemonURL, clientId])}`
            );
            await rpcMethodCallAsync('init', [daemonURL, clientId]);
            if (adapter.config.daemon === 'CUxD') {
                try {
                    await getCuxDevices();
                    updateConnection();
                } catch (e: any) {
                    adapter.log.error(`getCuxDevices error: ${e.message}`);
                }
            } else {
                updateConnection();
            }
        }
    } catch (e: any) {
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
        } catch (e: any) {
            adapter.log.error(`Ping error [${clientId}]: ${e.message}`);
            if (connected) {
                adapter.log.info('Disconnected');
                connected = false;
                adapter.setState('info.connection', false, true);
                connect(false);
            }
        }
    } else {
        adapter.log.warn('Called PING, but client does not exist');
        if (connected) {
            adapter.log.info('Disconnected');
            connected = false;
            adapter.setState('info.connection', false, true);
            connect(false);
        }
    }
} // endSendPing

const methods: Record<string, any> = {
    event: (err: any, params: any) => {
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
        if (params[0] === 'CUxD' || params[0].indexOf(adapter.name) === -1) {
            params[0] = adapter.namespace;
        }
        const channel = params[1].replace(':', '.').replace(adapter.FORBIDDEN_CHARS, '_');
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
            } else {
                val = params[3];
            }
        } else {
            // val = params[3];
            // for every device we know (listDevices), there will be a dpType, so this way we filter out stuff like PONG event and https://github.com/ioBroker/ioBroker.hm-rpc/issues/298
            adapter.log.debug(`${adapter.config.type}rpc <- event: ${name}:${params[3]} discarded, no matching device`);
            return '';
        }
        adapter.log.debug(
            `${name} ==> UNIT: "${dpTypes[name] ? dpTypes[name].UNIT : 'none'}" (min: ${
                dpTypes[name] ? dpTypes[name].MIN : 'none'
            }, max: ${dpTypes[name] ? dpTypes[name].MAX : 'none'}) From "${params[3]}" => "${val}"`
        );

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
    adapter.config.useHttps = adapter.config.useHttps || false;

    // adapterPort was introduced in v1.0.1. If not set yet then try 2000
    const adapterPort = parseInt(adapter.config.port || adapter.config.homematicPort, 10) || 2000;
    const callbackAddress = adapter.config.callbackAddress || adapter.config.adapterAddress;
    const port = await adapter.getPortAsync(adapterPort);
    daemonURL = `${daemonProto + callbackAddress}:${port}`;

    try {
        // somehow we cannot catch EADDRNOTAVAIL, also not with a cb here
        rpcServer = rpc.createServer({
            host: adapter.config.adapterAddress,
            port: port
        });
    } catch (e: any) {
        adapter.log.error(`Could not create RPC Server: ${e.message}`);
        return void adapter.restart();
    }

    // build up unique client id
    clientId = adapter.namespace;

    try {
        const obj = await adapter.getForeignObjectAsync(`system.adapter.${adapter.namespace}`);
        /** @ts-expect-error types needed - create issue */
        clientId = `${obj?.common?.host}:${clientId}`;
    } catch (e: any) {
        adapter.log.warn(`Could not get hostname, using default id "${clientId}" to register: ${e.message}`);
    }

    adapter.log.info(
        `${adapter.config.type}rpc server is trying to listen on ${adapter.config.adapterAddress}:${port}`
    );
    adapter.log.info(
        `${adapter.config.type}rpc client is trying to connect to ${adapter.config.homematicAddress}:${
            adapter.config.homematicPort
        }${homematicPath} with ${JSON.stringify([daemonURL, clientId])}`
    );

    connect(true);

    rpcServer.on('NotFound', (method: any, params: any) => {
        adapter.log.warn(
            `${adapter.config.type}rpc <- undefined method ${method} with parameters ${
                typeof params === 'object' ? JSON.stringify(params).slice(0, 80) : params
            }`
        );
    });

    rpcServer.on('readdedDevice', (method: any, params: any) => {
        adapter.log.info(`Readded device ${JSON.stringify(params)}`);
    });

    rpcServer.on('firmwareUpdateStatusChanged', (method: any, params: any) => {
        adapter.log.info(`Firmware update status of ${params[1]} changed to ${params[2]}`);
    });

    rpcServer.on('replaceDevice', async (method: any, params: any) => {
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
        } catch (e: any) {
            adapter.log.error(`Error while creating replacement device "${newDeviceName}": ${e.message}`);
        }
    });

    rpcServer.on('error', (e: any) => {
        // not sure if this can really be triggered
        adapter.log.error(`RPC Server error: ${e.message}`);
    });

    rpcServer.on('system.multicall', (method: any, params: any, callback: any) => {
        updateConnection();
        const response = [];
        for (const param of params[0]) {
            if (methods[param.methodName]) {
                adapter.log.debug(`${adapter.config.type} multicall <${param.methodName}>: ${param.params}`);
                response.push(methods[param.methodName](null, param.params));
            } else {
                response.push('');
            }
        }
        callback(null, response);
    });

    rpcServer.on('system.listMethods', (err: any, params: any, callback: any) => {
        if (err) {
            adapter.log.warn(` Error on system.listMethods: ${err}`);
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

    rpcServer.on('event', (err: any, params: any, callback: any) => {
        if (err) {
            adapter.log.warn(`Error on system.listMethods: ${err}`);
        }
        updateConnection();
        try {
            callback(null, methods.event(err, params));
        } catch (e: any) {
            adapter.log.error(`Cannot response on event: ${e.message}`);
        }
    });

    rpcServer.on('newDevices', async (err: any, params: any, callback: any) => {
        if (err) {
            adapter.log.warn(`Error on system.listMethods: ${err}`);
        }

        let newDevices = params[1];

        if (!Array.isArray(newDevices)) {
            adapter.log.warn(`CCU delivered unexpected result (${params[1]}) on "newDevices": ${newDevices}`);
            newDevices = [];
        }

        adapter.log.info(`${adapter.config.type}rpc <- newDevices ${newDevices.length}`);

        // for a HmIP-adapter (and virtual-devices) we have to filter out the devices that
        // are already present if forceReinit is not set
        if (
            adapter.config.forceReInit === false &&
            (adapter.config.daemon === 'HMIP' || adapter.config.daemon === 'virtual-devices')
        ) {
            let doc;
            try {
                doc = await adapter.getObjectViewAsync('hm-rpc', 'listDevices', {
                    startkey: `${adapter.namespace}.`,
                    endkey: `${adapter.namespace}.\u9999`
                });
            } catch (e: any) {
                adapter.log.error(`getObjectViewAsync hm-rpc: ${e.message}`);
            }

            if (doc && doc.rows) {
                for (const row of doc.rows) {
                    if (row.id === `${adapter.namespace}.updated`) {
                        continue;
                    }

                    // lets get the device description
                    const val = row.value;

                    /** @ts-expect-error types needed */
                    if (typeof val.ADDRESS === 'undefined') {
                        continue;
                    }

                    // lets find the current device in the newDevices array
                    // and if it doesn't exist we can delete it
                    let index = -1;
                    for (let j = 0; j < newDevices.length; j++) {
                        /** @ts-expect-error types needed */
                        if (newDevices[j].ADDRESS === val.ADDRESS && newDevices[j].VERSION === val.VERSION) {
                            index = j;
                            break;
                        }
                    }

                    // if index is -1 than the newDevices doesn't have the
                    // device with address val.ADDRESS anymore, thus we can delete it
                    if (index === -1) {
                        /** @ts-expect-error types needed */
                        if (val.ADDRESS && !adapter.config.dontDelete) {
                            /** @ts-expect-error types needed */
                            if (val.ADDRESS.indexOf(':') !== -1) {
                                /** @ts-expect-error types needed */
                                const address = val.ADDRESS.replace(':', '.').replace(adapter.FORBIDDEN_CHARS, '_');
                                const parts = address.split('.');
                                try {
                                    await adapter.deleteChannelAsync(parts[parts.length - 2], parts[parts.length - 1]);
                                    adapter.log.info(`obsolete channel ${address} ${JSON.stringify(address)} deleted`);
                                } catch (e: any) {
                                    adapter.log.error(
                                        `Could not delete obsolete channel ${address} ${JSON.stringify(address)}: ${
                                            e.message
                                        }`
                                    );
                                }
                            } else {
                                try {
                                    /** @ts-expect-error types needed */
                                    await adapter.deleteDeviceAsync(val.ADDRESS);
                                    /** @ts-expect-error types needed */
                                    adapter.log.info(`obsolete device ${val.ADDRESS} deleted`);
                                } catch (e: any) {
                                    /** @ts-expect-error types needed */
                                    adapter.log.error(`Could not delete obsolete device ${val.ADDRESS}: ${e.message}`);
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

            adapter.log.info(`new ${adapter.config.daemon} devices/channels after filter: ${newDevices.length}`);
            await createDevices(newDevices);
        } else {
            await createDevices(newDevices);
        }
        // call it otherwise HMIP won't work
        callback(null, '');
    });

    rpcServer.on('listDevices', async (err: any, params: any, callback: any) => {
        if (err) {
            adapter.log.warn(`Error on system.listMethods: ${err}`);
        }
        adapter.log.info(`${adapter.config.type}rpc <- listDevices ${JSON.stringify(params)}`);
        let doc;
        try {
            doc = await adapter.getObjectViewAsync('hm-rpc', 'listDevices', {
                startkey: `${adapter.namespace}.`,
                endkey: `${adapter.namespace}.\u9999`
            });
        } catch (e: any) {
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

                /** @ts-expect-error types needed */
                if (val.ADDRESS) {
                    /** @ts-expect-error types needed */
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
        } catch (e: any) {
            adapter.log.error(`Cannot respond on listDevices: ${e.message}`);
            adapter.log.error(JSON.stringify(response));
        }
    });

    rpcServer.on('deleteDevices', (err: any, params: any, callback: any) => {
        if (err) {
            adapter.log.warn(`Error on system.listMethods: ${err.message}`);
        }
        adapter.log.info(`${adapter.config.type}rpc <- deleteDevices ${params[1].length}`);
        for (let deviceName of params[1]) {
            if (deviceName.indexOf(':') !== -1) {
                deviceName = deviceName.replace(':', '.').replace(adapter.FORBIDDEN_CHARS, '_');
                adapter.log.info(`channel ${deviceName} ${JSON.stringify(deviceName)} deleted`);
                const parts = deviceName.split('.');
                adapter.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
            } else {
                adapter.log.info(`device ${deviceName} deleted`);
                adapter.deleteDevice(deviceName);
            }
        }
        try {
            callback(null, '');
        } catch (e: any) {
            adapter.log.error(`Cannot response on deleteDevices: ${e.message}`);
        }
    });

    rpcServer.on('setReadyConfig', (err: any, params: any, callback: any) => {
        if (err) {
            adapter.log.warn(`Error on setReadyConfig: ${err.message}`);
        }
        adapter.log.info(`${adapter.config.type}rpc <- setReadyConfig ${JSON.stringify(params)}`);
        try {
            callback(null, '');
        } catch (e: any) {
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
async function addParamsetObjects(channel: any, paramset: any): Promise<void> {
    for (const key of Object.keys(paramset)) {
        const commonType: Record<string, string> = {
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

        const obj: ioBroker.SettableStateObject = {
            type: 'state',
            common: {
                name: key,
                role: '', // will be filled
                def: paramset[key].DEFAULT,
                type: commonType[paramset[key].TYPE] || paramset[key].TYPE || '',
                read: !!(paramset[key].OPERATIONS & 1),
                write: !!(paramset[key].OPERATIONS & 2)
            },
            native: paramset[key]
        };

        // Heating groups are send everything as string
        if (typeof obj.common.def === 'string' && obj.common.type === 'number') {
            obj.common.def = parseFloat(obj.common.def);
        }

        if (typeof obj.common.def === 'string' && obj.common.type === 'boolean') {
            obj.common.def = obj.common.def === 'true';
        }

        if (obj.common.type === 'number') {
            obj.common.min = typeof paramset[key].MIN === 'string' ? parseFloat(paramset[key].MIN) : paramset[key].MIN;
            obj.common.max = typeof paramset[key].MAX === 'string' ? parseFloat(paramset[key].MAX) : paramset[key].MAX;

            if (paramset[key].TYPE === 'ENUM') {
                obj.common.states = {};
                for (let i = 0; i < paramset[key].VALUE_LIST.length; i++) {
                    obj.common.states[i] = paramset[key].VALUE_LIST[i];
                }
            } // endIf

            if (paramset[key].SPECIAL) {
                if (!obj.common.states) {
                    obj.common.states = {};
                }
                for (let i = 0; i < paramset[key].SPECIAL.length; i++) {
                    /** @ts-expect-error types needed */
                    obj.common.states[paramset[key].SPECIAL[i].VALUE] = paramset[key].SPECIAL[i].ID;
                }
            } // endIf
        } // endIf

        if (paramset[key].STATES) {
            obj.common.states = paramset[key].STATES;
        }

        // temporary fix for https://github.com/eq-3/occu/issues/105 and LEVEL w. o. %
        if (
            key === 'LEVEL' &&
            typeof paramset[key].MIN === 'number' &&
            typeof paramset[key].MAX === 'number' &&
            paramset[key].UNIT === undefined
        ) {
            paramset[key].UNIT = '%';
        } // endIf

        if (paramset[key].UNIT === '100%') {
            obj.common.unit = '%';
            // when unit is 100% we have min: 0, max: 1, we scale it between 0 and 100
            obj.common.max = 100;
        } else if (paramset[key].UNIT !== '' && paramset[key].UNIT !== '""') {
            obj.common.unit = paramset[key].UNIT;
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
        } else if (paramset[key].TYPE === 'ACTION' && obj.common.write) {
            obj.common.role = 'button';
        } // endElseIf

        // sometimes min/max/def is string on hmip meta in combination with value_list
        // note, that there are cases (Virtual heating devices) which also provide min/max/def with
        // strings, but does not match entries in the value list, thus we have to check indexOf().
        if (paramset[key].VALUE_LIST) {
            if (typeof paramset[key].MIN === 'string') {
                if (paramset[key].VALUE_LIST.includes(paramset[key].MIN)) {
                    obj.common.min = paramset[key].VALUE_LIST.indexOf(paramset[key].MIN);
                } else {
                    obj.common.min = parseInt(paramset[key].MIN);
                }
            }
            if (typeof paramset[key].MAX === 'string') {
                if (paramset[key].VALUE_LIST.includes(paramset[key].MAX)) {
                    obj.common.max = paramset[key].VALUE_LIST.indexOf(paramset[key].MAX);
                } else {
                    obj.common.max = parseInt(paramset[key].MAX);
                }
            }
            if (typeof paramset[key].DEFAULT === 'string') {
                if (paramset[key].VALUE_LIST.includes(paramset[key].DEFAULT)) {
                    obj.common.def = paramset[key].VALUE_LIST.indexOf(paramset[key].DEFAULT);
                } else {
                    obj.common.def = parseInt(paramset[key].DEFAULT);
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
        } else if (obj.common.role === 'value.window' && paramset[key].TYPE === 'BOOL') {
            // if its value.window but its a boolean it should be sensor.window
            obj.common.role = 'sensor.window';
        } else if (obj.common.role === 'value.temperature') {
            obj.common.unit = '°C';
        }

        if (paramset[key].OPERATIONS & 8) {
            obj.common.role = 'indicator.service';
        }

        if (typeof obj.common.role !== 'string' && typeof obj.common.role !== 'undefined') {
            throw new Error(`typeof obj.common.role ${typeof obj.common.role}`);
        }
        const dpID = `${adapter.namespace}.${channel._id}.${key}`;

        dpTypes[dpID] = {
            UNIT: paramset[key].UNIT,
            TYPE: paramset[key].TYPE,
            MIN: paramset[key].MIN,
            MAX: paramset[key].MAX
        };

        if (typeof dpTypes[dpID].MIN === 'number') {
            dpTypes[dpID].MIN = parseFloat(dpTypes[dpID].MIN);
            dpTypes[dpID].MAX = parseFloat(dpTypes[dpID].MAX);
            // Humidity is from 0 to 99. It is wrong.
            if (dpTypes[dpID].MAX === 99) {
                dpTypes[dpID].MAX = 100;
            }
        }

        if (key === 'LEVEL' && paramset.WORKING) {
            obj.common.workingID = 'WORKING';
        }

        try {
            const res = await adapter.extendObjectAsync(`${channel._id}.${key}`, obj);
            adapter.log.debug(`object ${res.id} extended`);
        } catch (e: any) {
            adapter.log.error(`Could not extend object ${channel._id}.${key}: ${e.message}`);
        }
    } // endFor
} // endAddParamsetObjects

/**
 * Get value paramsets and add them
 *
 * @param valueParamsets
 */
async function getValueParamsets(valueParamsets: any[]): Promise<void> {
    for (const obj of valueParamsets) {
        try {
            const cid = `${obj.native.PARENT_TYPE}.${obj.native.TYPE}.${obj.native.VERSION}`;

            adapter.log.debug(`getValueParamsets ${cid}`);

            // if meta values are cached for E-paper we extend this cached meta values by e-paper states
            if (obj.native && obj.native.PARENT_TYPE === 'HM-Dis-EP-WM55' && obj.native.TYPE === 'MAINTENANCE') {
                addEPaperToMeta();
            }

            adapter.log.info(
                `${adapter.config.type}rpc -> getParamsetDescription ${JSON.stringify([obj.native.ADDRESS, 'VALUES'])}`
            );
            metaValues[cid] = await rpcMethodCallAsync('getParamsetDescription', [obj.native.ADDRESS, 'VALUES']);

            if (obj.native && obj.native.PARENT_TYPE === 'HM-Dis-EP-WM55' && obj.native.TYPE === 'MAINTENANCE') {
                addEPaperToMeta();
            }

            await addParamsetObjects(obj, metaValues[cid]);
        } catch (e: any) {
            adapter.log.error(`Error on getParamsetDescription for [${obj.native.ADDRESS}, 'VALUES']": ${e.message}`);
        }
    }

    if (valueParamsets.length) {
        // reset
        // Inform hm-rega about new devices
        try {
            await adapter.setStateAsync('updated', true, false);
        } catch (e: any) {
            adapter.log.error(`Could not inform hm-rega about new devices: ${e.message}`);
        }
        // If it has been a force reinit run, set it to false and restart
        if (adapter.config.forceReInit) {
            adapter.log.info('Restarting now, because we had a forced reinitialization run');
            try {
                await adapter.extendForeignObjectAsync(`system.adapter.${adapter.namespace}`, {
                    native: { forceReInit: false }
                });
            } catch (e: any) {
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
async function createDevices(deviceArr: any[]): Promise<void> {
    const queueValueParamsets = [];
    for (const device of deviceArr) {
        if (typeof device.ADDRESS !== 'string') {
            // check that ADDRESS is given, else we don't know the id
            adapter.log.error(`Device has no valid property ADDRESS: ${JSON.stringify(device)}`);
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
                adapter.log.warn(`No image for "${device.TYPE}" found.`);
            }

            icon = images[device.TYPE] ? `/icons/${images[device.TYPE]}` : '';
        }

        const obj: ioBroker.SettableObject = {
            _id: device.ADDRESS.replace(':', '.').replace(adapter.FORBIDDEN_CHARS, '_'),
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
            TYPE: device.TYPE,
            MAX: device.MAX,
            MIN: device.MIN,
            role: role
        };

        if (typeof dpTypes[dpID].MIN === 'number') {
            dpTypes[dpID].MIN = parseFloat(dpTypes[dpID].MIN);
            dpTypes[dpID].MAX = parseFloat(dpTypes[dpID].MAX);

            // e. g. Humidity is from 0 to 99. It is wrong. todo: logically ok, but is it? Can a sensor deliver 100 % humidity?
            if (dpTypes[dpID].MAX === 99) {
                dpTypes[dpID].MAX = 100;
            }
        }

        /** @ts-expect-error types needed */
        if (metaRoles.dvTYPE && obj.native && metaRoles.dvTYPE[obj.native.PARENT_TYPE]) {
            /** @ts-expect-error types needed */
            obj.common.role = metaRoles.dvTYPE[obj.native.PARENT_TYPE];
        }

        try {
            /** @ts-expect-error how we want to handle it */
            const res = await adapter.setObjectAsync(obj._id, obj);
            adapter.log.debug(`object ${res.id} created`);
        } catch (e: any) {
            adapter.log.error(`object ${obj._id} error on creation: ${e.message}`);
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
                } catch (e: any) {
                    adapter.log.error(`getObjectView hm-rpc: ${e.message}`);
                }

                if (doc && doc.rows) {
                    for (const row of doc.rows) {
                        if (row.id === `${adapter.namespace}.updated`) {
                            continue;
                        }

                        // lets get the device description
                        const val = row.value;

                        /** @ts-expect-error types needed */
                        if (typeof val.ADDRESS === 'undefined') {
                            continue;
                        }

                        // lets find the current device in the newDevices array
                        // and if it doesn't exist we can delete it
                        let index = -1;
                        for (let j = 0; j < newDevices.length; j++) {
                            /** @ts-expect-error types needed */
                            if (newDevices[j].ADDRESS === val.ADDRESS && newDevices[j].VERSION === val.VERSION) {
                                index = j;
                                break;
                            }
                        }

                        // if index is -1 than the newDevices doesn't have the
                        // device with address val.ADDRESS anymore, thus we can delete it
                        if (index === -1) {
                            /** @ts-expect-error types needed */
                            if (val.ADDRESS && !adapter.config.dontDelete) {
                                /** @ts-expect-error types needed */
                                if (val.ADDRESS.indexOf(':') !== -1) {
                                    /** @ts-expect-error types needed */
                                    const address = val.ADDRESS.replace(':', '.').replace(adapter.FORBIDDEN_CHARS, '_');
                                    const parts = address.split('.');
                                    adapter.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
                                    adapter.log.info(`obsolete channel ${address} ${JSON.stringify(address)} deleted`);
                                } else {
                                    /** @ts-expect-error types needed */
                                    adapter.deleteDevice(val.ADDRESS);
                                    /** @ts-expect-error types needed */
                                    adapter.log.info(`obsolete device ${val.ADDRESS} deleted`);
                                }
                            }
                        } else {
                            // we can remove the item at index because it is already registered
                            // to ioBroker
                            newDevices.splice(index, 1);
                        }
                    }
                }
                adapter.log.info(`new CUxD devices/channels after filter: ${newDevices.length}`);
                await createDevices(newDevices);
            } else {
                await createDevices(newDevices);
            }
        } catch (e: any) {
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

function connect(isFirst: boolean) {
    if (!rpcClient && !adapter.config.useHttps) {
        try {
            rpcClient = rpc.createClient({
                host: adapter.config.homematicAddress,
                port: adapter.config.homematicPort,
                path: homematicPath,
                reconnectTimeout: adapter.config.reconnectInterval * 1000
            });
        } catch (e: any) {
            adapter.log.error(`Could not create non-secure ${adapter.config.type}-rpc client: ${e.message}`);
            return void adapter.restart();
        } // endCatch

        // If we have bin-rpc, only need it here because bin-rpc cannot have https
        if (rpcClient.on) {
            rpcClient.on('error', (err: any) => {
                adapter.log.error(`Socket error: ${err}`);
            });
        } // endIf
    } else if (!rpcClient) {
        adapter.getForeignObject('system.config', (err, obj) => {
            let password;
            let username;

            if (obj && obj.native && obj.native.secret) {
                password = tools.decrypt(obj.native.secret, adapter.config.password || '');
                username = tools.decrypt(obj.native.secret, adapter.config.username || '');
            } else {
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
            } catch (e: any) {
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
        rpcMethodCallAsync = (method: any, params: any) => {
            return new Promise((resolve, reject) => {
                rpcClient.methodCall(method, params, (err: any, res: any) => {
                    if (err) {
                        reject(err);
                    } else {
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
    } else {
        sendPing();
    }
} // endKeepAlive

// If started as allInOne/compact mode => return function to create instance
if (require.main === module) {
    startAdapter({ name: 'hm-rpc' });
} else {
    // compact mode
    module.exports = startAdapter;
} // endElse
