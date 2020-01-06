/*
 * Copyright (c) 2014-2019 bluefox <dogafox@gmail.com>
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
/* jshint -W097 */
/* jshint strict: false */
/*jslint node: true */
'use strict';

const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const adapterName = require('./package.json').name.split('.').pop();
const images = require('./lib/images');
const crypto = require('./lib/crypto'); // Provides encrypt and decrypt
const meta = require('./lib/meta');
let connected = false;
const displays = {};
let adapter;

const FORBIDDEN_CHARS = /[\][*,;'"`<>\\\s?]/g;
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

function number2hex(num) {
    if (typeof num === 'number') {
        num = num.toString(16).toUpperCase();
        if (num.length < 2) num = `0${num}`;
        num = `0x${num}`;
    }
    return num;
}

function combineEPaperCommand(lines, signal, ton, repeats, offset) {
    signal = number2hex(signal || '0xF0');
    ton = number2hex(ton || '0xC0');
    const substitutions = {
        'A': '0x41',
        'B': '0x42',
        'C': '0x43',
        'D': '0x44',
        'E': '0x45',
        'F': '0x46',
        'G': '0x47',
        'H': '0x48',
        'I': '0x49',
        'J': '0x4A',
        'K': '0x4B',
        'L': '0x4C',
        'M': '0x4D',
        'N': '0x4E',
        'O': '0x4F',
        'P': '0x50',
        'Q': '0x51',
        'R': '0x52',
        'S': '0x53',
        'T': '0x54',
        'U': '0x55',
        'V': '0x56',
        'W': '0x57',
        'X': '0x58',
        'Y': '0x59',
        'Z': '0x5A',
        'a': '0x61',
        'b': '0x62',
        'c': '0x63',
        'd': '0x64',
        'e': '0x65',
        'f': '0x66',
        'g': '0x67',
        'h': '0x68',
        'i': '0x69',
        'j': '0x6A',
        'k': '0x6B',
        'l': '0x6C',
        'm': '0x6D',
        'n': '0x6E',
        'o': '0x6F',
        'p': '0x70',
        'q': '0x71',
        'r': '0x72',
        's': '0x73',
        't': '0x74',
        'u': '0x75',
        'v': '0x76',
        'w': '0x77',
        'x': '0x78',
        'y': '0x79',
        'z': '0x7A',
        '0': '0x30',
        '1': '0x31',
        '2': '0x32',
        '3': '0x33',
        '4': '0x34',
        '5': '0x35',
        '6': '0x36',
        '7': '0x37',
        '8': '0x38',
        '9': '0x39',
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
        'Ä': '0x5B',
        'Ö': '0x23',
        'Ü': '0x24',
        'ä': '0x7B',
        'ö': '0x7C',
        'ü': '0x7D',
        'ß': '0x5F',
        ':': '0x3A',
        ';': '0x3B',
        '@': '0x40',
        '>': '0x3E'
    };

    let command = '0x02,0x0A';
    for (const li of lines) {
        const line = li.line;
        const icon = li.icon;
        if (line || icon) {
            command = `${command},0x12`;
            let i;
            if ((line.substring(0, 2) === '0x') && (line.length === 4)) {
                command = `${command},${line}`;
                i = 12;
            } else {
                i = 0;
            }
            while ((i < line.length) && (i < 12)) {
                command += `,${substitutions[line[i]]}` || '0x2A';
                i++;
            }
            if (icon) {
                command += `,0x13,${number2hex(icon)}`;
            }
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

function controlEPaper(id, data) {
    const tmp = id.split('.');
    tmp[3] = '3';
    tmp[4] = 'SUBMIT';

    const val = combineEPaperCommand(data.lines, data.signal || '0xF0', data.tone || '0xC0', data.repeats, data.offset);

    try {
        if (rpcClient && connected) {
            rpcClient.methodCall('setValue', [`${tmp[2]}:${tmp[3]}`, tmp[4], val], err => {
                if (err) {
                    adapter.log.error(`${adapter.config.type}rpc -> setValue ${JSON.stringify([tmp[3], tmp[4], val])}`);
                    adapter.log.error(err);
                }
            });
        } else {
            adapter.log.warn(`Cannot setValue "${id}", because not connected.`);
        }
    } catch (err) {
        adapter.log.error(`Cannot call setValue: ${err}`);
    }
}

function readSignals(id) {
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

    Promise.all(promises).then(() => controlEPaper(id, data));

} // endReadSignals

function readSettings(id) {
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

    Promise.all(promises).then(() => controlEPaper(id, data));

} // endReadSettings

// the adapter object

function startAdapter(options) {
    options = options || {};

    Object.assign(options, {

        name: adapterName,

        ready: () => {
            adapter.subscribeStates('*');
            createMeta().then(main);
        },
        stateChange: (id, state) => {
            if (state && state.ack !== true) {
                const tmp = id.split('.');
                let val;

                if (id === `${adapter.namespace}.updated` || /_ALARM$/.test(id)) return;

                adapter.log.debug(`${adapter.config.type}rpc -> setValue ${tmp[3]} ${tmp[4]}: ${state.val}`);

                if (!dpTypes[id]) {
                    adapter.log.error(`${adapter.config.type}rpc -> setValue: no dpType for ${id}!`);
                    return;
                }

                if (dpTypes[id].UNIT === '%' && dpTypes[id].MIN !== undefined) {
                    state.val = (state.val / 100) * (dpTypes[id].MAX - dpTypes[id].MIN) + dpTypes[id].MIN;
                    state.val = Math.round(state.val * 1000) / 1000;
                } else if (dpTypes[id].UNIT === '100%') {
                    state.val = state.val / 100;
                }

                const type = dpTypes[id].TYPE;

                if (type === 'EPAPER_TONE_REPETITIONS') {
                    // repeats have to be between 0 and 15 -> 0 is unlimited
                    if (typeof state.val !== 'number') state.val = 1;
                    val = Math.min(Math.max(state.val, 0), 15);
                    adapter.setForeignState(id, val, true);
                    return;
                } // endIf

                if (type === 'EPAPER_TONE_INTERVAL') {
                    // offset has to be between 0 and 160
                    if (typeof state.val !== 'number') state.val = 0;
                    val = Math.min(Math.max(Math.round(state.val / 10) * 10, 10), 160);
                    adapter.setForeignState(id, val, true);
                    return;
                } // endIf

                if (type === 'EPAPER_LINE' || type === 'EPAPER_ICON') {
                    const _id = `${tmp[0]}.${tmp[1]}.${tmp[2]}`;
                    if (displays[_id] && displays[_id].timer) {
                        clearTimeout(displays[_id].timer);
                        if (displays[_id].withTone) {
                            displays[_id] = {timer: setTimeout(readSignals, 300, _id), withTone: true};
                            return;
                        }
                    }
                    displays[_id] = {timer: setTimeout(readSettings, 300, _id), withTone: false};
                    return;
                } else if (type === 'EPAPER_SIGNAL' || type === 'EPAPER_TONE') {
                    const _id = `${tmp[0]}.${tmp[1]}.${tmp[2]}`;
                    if (displays[_id] && displays[_id].timer) {
                        clearTimeout(displays[_id].timer);
                    }
                    displays[_id] = {timer: setTimeout(readSignals, 300, _id), withTone: true};
                    return;
                } else {
                    switch (type) {
                        case 'BOOL':
                            val = (state.val === 'false' || state.val === '0') ? false : !!state.val;
                            break;
                        case 'FLOAT':
                            val = {explicitDouble: state.val};
                            break;
                        default:
                            val = state.val;
                    }
                }

                adapter.log.debug(`setValue ${JSON.stringify([`${tmp[2]}:${tmp[3]}`, tmp[4], val])} ${type}`);

                try {
                    if (rpcClient && connected) {
                        rpcClient.methodCall('setValue', [`${tmp[2]}:${tmp[3]}`, tmp[4], val], (err/*, data*/) => {
                            if (err) {
                                adapter.log.error(`${adapter.config.type}rpc -> setValue ${JSON.stringify([tmp[3], tmp[4], state.val])} ${type}`);
                                adapter.log.error(err);
                            }
                        });
                    } else {
                        adapter.log.warn(`Cannot setValue "${id}", because not connected.`);
                    }
                } catch (err) {
                    adapter.log.error(`Cannot call setValue: :${err}`);
                }
            }
        },
        // Add messagebox Function for ioBroker.occ
        message: obj => {
            adapter.log.debug(`[MSSG] Received: ${JSON.stringify(obj)}`);
            if (obj.command === 'stopInstance') {
                if (rpcServer && rpcServer.server) {
                    try {
                        rpcServer.server.close(() => {
                            console.log('server closed.');
                            rpcServer.server.unref();
                        });
                    } catch (e) {
                        //
                    }
                }
                if (rpcClient && rpcClient.socket) {
                    try {
                        rpcClient.socket.destroy();
                    } catch (e) {
                        //
                    }
                }
                // force close
                setTimeout(() => adapter.terminate ? adapter.terminate() : process.exit(), 3000);
            } else if (obj.message.params === undefined || obj.message.params === null) {
                try {
                    if (rpcClient && connected) {
                        rpcClient.methodCall(obj.command, [obj.message.ID, obj.message.paramType], (err, data) => {
                            if (obj.callback) adapter.sendTo(obj.from, obj.command, {
                                result: data,
                                error: err
                            }, obj.callback);
                        });
                    } else {
                        adapter.log.warn(`Cannot send "${obj.command}" "${obj.message.ID}": because not connected`);
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'not connected'}, obj.callback);
                    }
                } catch (err) {
                    adapter.log.error(`Cannot call ${obj.command}: ${err}`);
                    adapter.sendTo(obj.from, obj.command, {error: err}, obj.callback);
                }
            } else {
                try {
                    if (rpcClient && connected) {
                        rpcClient.methodCall(obj.command, [obj.message.ID, obj.message.paramType, obj.message.params], (err, data) => {
                            if (obj.callback) adapter.sendTo(obj.from, obj.command, {
                                result: data,
                                error: err
                            }, obj.callback);
                        });
                    } else {
                        adapter.log.warn(`Cannot send "${obj.command}" "${obj.message.ID}": because not connected`);
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'not connected'}, obj.callback);
                    }
                } catch (err) {
                    adapter.log.error(`Cannot call ${obj.command}: ${err}`);
                    adapter.sendTo(obj.from, obj.command, {error: err}, obj.callback);
                }
            }
        },
        unload: callback => {
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
                        rpcClient.methodCall('init', [daemonURL, ''], (/*err, data*/) => {
                            if (connected) {
                                adapter.log.info('Disconnected');
                                connected = false;
                                adapter.setState('info.connection', false, true);
                            }
                            if (callback) callback();
                            callback = null;
                        });
                    } catch (err) {
                        if (connected) {
                            adapter.log.info('Disconnected');
                            connected = false;
                            adapter.setState('info.connection', false, true);
                        }
                        adapter.log.error(`Cannot call init: [${daemonURL}, ""]${err}`);
                        if (callback) callback();
                        callback = null;
                    }

                } else {
                    if (callback) callback();
                    callback = null;
                }
            } catch (e) {
                if (adapter && adapter.log) {
                    adapter.log.error(`Unload error: ${e}`);
                } else {
                    console.log(e);
                }
                if (callback) callback();
                callback = null;
            }
        }
    });

    adapter = new utils.Adapter(options);

    return adapter;
}

let rpc;
let rpcClient;

let rpcServer;

const metaValues = {};
let metaRoles = {};
const dpTypes = {};

let lastEvent = 0;
let eventInterval;
let connInterval;
let connTimeout;
let daemonURL = '';
let daemonProto = '';
let homematicPath;

function main() {
    homematicPath = adapter.config.daemon === 'virtual-devices' ? '/groups/' : '/';

    adapter.config.reconnectInterval = parseInt(adapter.config.reconnectInterval, 10) || 30;
    if (adapter.config.reconnectInterval < 10) {
        adapter.log.error('Reconnect interval is less than 10 seconds. Set reconnect interval to 10 seconds.');
        adapter.config.reconnectInterval = 10;
    }

    adapter.config.checkInitInterval = parseInt(adapter.config.checkInitInterval, 10);
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

    // Load VALUE paramsetDescriptions (needed to create state objects)
    adapter.getObjectView('hm-rpc', 'paramsetDescription', {
        startkey: 'hm-rpc.meta.VALUES',
        endkey: 'hm-rpc.meta.VALUES.\u9999'
    }, (err, doc) => {
        if (err) adapter.log.error(`getObjectView hm-rpc: ${err}`);
        if (doc && doc.rows) {
            for (const row of doc.rows) {
                const channel = row.id.slice(19);
                metaValues[channel] = row.value.native;
            }
        }
        // Load common.role assignments
        adapter.getForeignObject('hm-rpc.meta.roles', (err, res) => {
            if (err) adapter.log.error(`hm-rpc.meta.roles: ${err}`);
            if (res) metaRoles = res.native;

            // Start Adapter
            if (adapter.config) initRpcServer();
        });
    });

    adapter.getObjectView('system', 'state', {
        startkey: adapter.namespace,
        endkey: adapter.namespace + '\u9999'
    }, (err, res) => {
        if (!err && res.rows) {
            for (const row of res.rows) {
                if (row.id === `${adapter.namespace}.updated`) continue;
                if (!row.value.native) {
                    adapter.log.warn(`State ${row.id} does not have native.`);
                    dpTypes[row.id] = {UNIT: '', TYPE: ''};
                } else {
                    dpTypes[row.id] = {
                        UNIT: row.value.native.UNIT,
                        TYPE: row.value.native.TYPE,
                        MIN: row.value.native.MIN,
                        MAX: row.value.native.MAX
                    };

                    if (typeof dpTypes[row.id].MIN === 'number') {
                        dpTypes[row.id].MIN = parseFloat(dpTypes[row.id].MIN);
                        dpTypes[row.id].MAX = parseFloat(dpTypes[row.id].MAX);
                        if (dpTypes[row.id].UNIT === '100%') {
                            dpTypes[row.id].UNIT = '%';
                        }
                        if (dpTypes[row.id].MAX === 99) {
                            dpTypes[row.id].MAX = 100;
                        } else if (dpTypes[row.id].MAX === 1.005 || dpTypes[row.id].MAX === 1.01) {
                            dpTypes[row.id].MAX = 1;
                        } // endElseIf
                    } // endIf
                }
            }
        }
    });
} // endMain

function sendInit() {
    try {
        if (rpcClient && (rpcClient.connected === undefined || rpcClient.connected)) {
            adapter.log.debug(`${adapter.config.type}rpc -> ${adapter.config.homematicAddress}:${adapter.config.homematicPort}${homematicPath} init ${JSON.stringify([daemonURL, adapter.namespace])}`);
            rpcClient.methodCall('init', [daemonURL, adapter.namespace], (err/*, data*/) => {
                if (!err) {
                    if (adapter.config.daemon === 'CUxD') {
                        getCuxDevices(function handleCuxDevices(err2) {
                            if (!err2) {
                                updateConnection();
                            } else {
                                adapter.log.error(`getCuxDevices error: ${err2}`);
                            }
                        });
                    } else {
                        updateConnection();
                    }
                } else {
                    adapter.log.error(`init error: ${err}`);
                }
            });
        }
    } catch (err) {
        adapter.log.error(`Init not possible, going to stop: ${err}`);
        adapter.stop();
    }
} // endSendInit

function sendPing() {
    if (rpcClient) {
        adapter.log.debug('Send PING...');
        try {
            rpcClient.methodCall('ping', [adapter.namespace], (err/*, data*/) => {
                if (!err) {
                    adapter.log.debug('PING ok');
                } else {
                    adapter.log.error(`Ping error: ${err}`);
                    if (connected) {
                        adapter.log.info('Disconnected');
                        connected = false;
                        adapter.setState('info.connection', false, true);
                        connect();
                    }
                }
            });
        } catch (err) {
            adapter.log.error(`Cannot call ping [${adapter.namespace}]: ${err}`);
        }
    } else {
        adapter.warn('Called PING, but client does not exist');
        if (connected) {
            adapter.log.info('Disconnected');
            connected = false;
            adapter.setState('info.connection', false, true);
            connect();
        }
    }
} // endSendPing

function initRpcServer() {
    adapter.config.homematicPort = parseInt(adapter.config.homematicPort, 10);
    adapter.config.port = parseInt(adapter.config.port, 10);
    adapter.config.useHttps = adapter.config.useHttps || false;

    // adapterPort was introduced in v1.0.1. If not set yet then try 2000
    const adapterPort = parseInt(adapter.config.port || adapter.config.homematicPort, 10) || 2000;
    const callbackAddress = adapter.config.callbackAddress || adapter.config.adapterAddress;
    adapter.getPort(adapterPort, port => {
        daemonURL = `${daemonProto + callbackAddress}:${port}`;

        rpcServer = rpc.createServer({
            host: adapter.config.adapterAddress,
            port: port
        });

        adapter.log.info(`${adapter.config.type}rpc server is trying to listen on ${adapter.config.adapterAddress}:${port}`);
        adapter.log.info(`${adapter.config.type}rpc client is trying to connect to ${adapter.config.homematicAddress}:${adapter.config.homematicPort}${homematicPath} with ${JSON.stringify([daemonURL, adapter.namespace])}`);

        connect(true);

        rpcServer.on('NotFound', (method, params) => adapter.log.warn(`${adapter.config.type}rpc <- undefined method ${method} ${JSON.stringify(params).slice(0, 80)}`));

        rpcServer.on('system.multicall', (method, params, callback) => {
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

        rpcServer.on('system.listMethods', (err, params, callback) => {
            if (err) {
                adapter.log.warn(` Error on system.listMethods: ${err}`);
            }
            adapter.log.info(`${adapter.config.type}rpc <- system.listMethods ${JSON.stringify(params)}`);
            callback(null, ['event', 'deleteDevices', 'listDevices', 'newDevices', 'system.listMethods', 'system.multicall', 'setReadyConfig']);
        });

        rpcServer.on('event', (err, params, callback) => {
            if (err) {
                adapter.log.warn(` Error on system.listMethods: ${err}`);
            }
            updateConnection();
            try {
                callback(null, methods.event(err, params));
            } catch (err) {
                adapter.log.error(`Cannot response on event:${err}`);
            }
        });

        rpcServer.on('newDevices', (err, params, callback) => {
            if (err) {
                adapter.log.warn(` Error on system.listMethods: ${err}`);
            }

            const newDevices = params[1];

            adapter.log.info(`${adapter.config.type}rpc <- newDevices ${newDevices.length}`);

            // for a HmIP-adapter we have to filter out the devices that
            // are already present if forceReinit is not set
            if (adapter.config.forceReInit === false && adapter.config.daemon === 'HMIP') {
                adapter.getObjectView('hm-rpc', 'listDevices', {
                    startkey: `hm-rpc.${adapter.instance}.`,
                    endkey: 'hm-rpc.' + adapter.instance + '.\u9999'
                }, (err, doc) => {
                    if (doc && doc.rows) {
                        for (const row of doc.rows) {
                            if (row.id === `${adapter.namespace}.updated`) continue;

                            // lets get the device description
                            const val = row.value;

                            if (typeof val.ADDRESS === 'undefined') continue;

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
                                    if (val.ADDRESS.indexOf(':') !== -1) {
                                        const address = val.ADDRESS.replace(':', '.').replace(FORBIDDEN_CHARS, '_');
                                        const parts = address.split('.');
                                        adapter.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
                                        adapter.log.info(`obsolete channel ${address} ${JSON.stringify(address)} deleted`);
                                    } else {
                                        adapter.deleteDevice(val.ADDRESS);
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

                    adapter.log.info(`new HmIP devices/channels after filter: ${newDevices.length}`);
                    createDevices(newDevices, callback);
                });
            } else {
                createDevices(newDevices, callback);
            }
        });

        rpcServer.on('listDevices', (err, params, callback) => {
            if (err) {
                adapter.log.warn(`Error on system.listMethods: ${err}`);
            }
            adapter.log.info(`${adapter.config.type}rpc <- listDevices ${JSON.stringify(params)}`);
            adapter.getObjectView('hm-rpc', 'listDevices', {
                startkey: `hm-rpc.${adapter.instance}.`,
                endkey: 'hm-rpc.' + adapter.instance + '.\u9999'
            }, (err, doc) => {
                const response = [];

                // we only fill the response if this isn't a force reinit and
                // if the adapter instance is not bothering with HmIP (which seems to work slightly different in terms of XMLRPC)
                if (!adapter.config.forceReInit && adapter.config.daemon !== 'HMIP' && doc && doc.rows) {
                    for (let i = 0; i < doc.rows.length; i++) {
                        if (doc.rows[i].id === `${adapter.namespace}.updated`) continue;
                        const val = doc.rows[i].value;

                        if (val.ADDRESS) response.push({ADDRESS: val.ADDRESS, VERSION: val.VERSION});
                    }
                }
                adapter.log.info(`${adapter.config.type}rpc -> ${response.length} devices`);

                try {
                    for (let r = response.length - 1; r >= 0; r--) {
                        if (!response[r].ADDRESS) {
                            adapter.log.warn(`${adapter.config.type}rpc -> found empty entry at position ${r} !`);
                            response.splice(r, 1);
                        }
                    }

                    callback(null, response);
                } catch (err) {
                    adapter.log.error(`Cannot response on listDevices:${err}`);
                    require('fs').writeFileSync(`${__dirname}/problem.json`, JSON.stringify(response));
                }
            });
        });

        rpcServer.on('deleteDevices', (err, params, callback) => {
            if (err) {
                adapter.log.warn(` Error on system.listMethods: ${err}`);
            }
            adapter.log.info(`${adapter.config.type}rpc <- deleteDevices ${params[1].length}`);
            for (let i = 0; i < params[1].length; i++) {
                if (params[1][i].indexOf(':') !== -1) {
                    params[1][i] = params[1][i].replace(':', '.').replace(FORBIDDEN_CHARS, '_');
                    adapter.log.info(`channel ${params[1][i]} ${JSON.stringify(params[1][i])} deleted`);
                    const parts = params[1][i].split('.');
                    adapter.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
                } else {
                    adapter.log.info(`device ${params[1][i]} deleted`);
                    adapter.deleteDevice(params[1][i]);
                }
            }
            try {
                callback(null, '');
            } catch (err) {
                adapter.log.error(`Cannot response on deleteDevices:${err}`);
            }
        });

        rpcServer.on('setReadyConfig', (err, params, callback) => {
            if (err) {
                adapter.log.warn(` Error on setReadyConfig: ${err}`);
            }
            adapter.log.info(`${adapter.config.type}rpc <- setReadyConfig ${JSON.stringify(params)}`);
            try {
                callback(null, '');
            } catch (err) {
                adapter.log.error(`Cannot response on setReadyConfig: ${err}`);
            }
        });

    });
} // endInitRPCServer

const methods = {

    event: function (err, params) {
        adapter.log.debug(`${adapter.config.type}rpc <- event ${JSON.stringify(params)}`);
        let val;
        // CUxD ignores all prefixes!!
        if (params[0] === 'CUxD' || params[0].indexOf(adapter.name) === -1) {
            params[0] = adapter.namespace;
        }
        const channel = params[1].replace(':', '.').replace(FORBIDDEN_CHARS, '_');
        const name = `${params[0]}.${channel}.${params[2]}`;

        if (dpTypes[name]) {
            if (dpTypes[name].MIN !== undefined && dpTypes[name].UNIT === '%') {
                val = ((parseFloat(params[3]) - dpTypes[name].MIN) / (dpTypes[name].MAX - dpTypes[name].MIN)) * 100;
                val = Math.round(val * 100) / 100;
            } else if (dpTypes[name].UNIT === '100%' || (dpTypes[name].UNIT === '%' && dpTypes[name].MAX === 1)) {
                val = params[3] * 100;
            } else {
                val = params[3];
            }
        } else {
            val = params[3];
        }
        adapter.log.debug(`${name} ==> UNIT: "${dpTypes[name] ? dpTypes[name].UNIT : 'none'}" (min: ${dpTypes[name] ? dpTypes[name].MIN : 'none'}, max: ${dpTypes[name] ? dpTypes[name].MAX : 'none'}) From "${params[3]}" => "${val}"`);

        adapter.setState(`${channel}.${params[2]}`, {val: val, ack: true});
        return '';
    }
};

const queueValueParamsets = [];

function addParamsetObjects(channel, paramset, callback) {
    const promises = [];

    for (const key in paramset) {
        if (!paramset.hasOwnProperty(key)) continue;
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
                def: paramset[key].DEFAULT,
                type: commonType[paramset[key].TYPE] || paramset[key].TYPE || '',
                read: !!(paramset[key].OPERATIONS & 1),
                write: !!(paramset[key].OPERATIONS & 2)
            },
            native: paramset[key]
        };

        if (obj.common.type === 'number') {
            obj.common.min = paramset[key].MIN;
            obj.common.max = paramset[key].MAX;

            if (paramset[key].TYPE === 'ENUM') {
                obj.common.states = {};
                for (let i = 0; i < paramset[key].VALUE_LIST.length; i++) {
                    obj.common.states[i] = paramset[key].VALUE_LIST[i];
                }
            } // endIf

            if (paramset[key].SPECIAL) {
                if (!obj.common.states) obj.common.states = {};
                for (let i = 0; i < paramset[key].SPECIAL.length; i++) {
                    obj.common.states[paramset[key].SPECIAL[i].VALUE] = paramset[key].SPECIAL[i].ID;
                }
            } // endIf
        } // endIf

        if (paramset[key].STATES) {
            obj.common.states = paramset[key].STATES;
        }

        // temporary fix for https://github.com/eq-3/occu/issues/105
        if (paramset[key].CONTROL === 'DIMMER_REAL.LEVEL' && typeof paramset[key].MIN === 'number' && typeof paramset[key].MAX === 'number' && paramset[key].UNIT === undefined) {
            paramset[key].UNIT = '%';
        } // endIf

        if (paramset[key].UNIT === '100%') {
            obj.common.unit = '%';
            obj.common.max = 100 * paramset[key].MAX;
        } else if (paramset[key].UNIT !== '') {
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

        // sometimes min max is string on hmip meta in combination with value_list
        if (typeof paramset[key].MIN === 'string' && paramset[key].VALUE_LIST) {
            obj.common.min = paramset[key].VALUE_LIST.indexOf(paramset[key].MIN);
        }
        if (typeof paramset[key].MAX === 'string' && paramset[key].VALUE_LIST) {
            obj.common.max = paramset[key].VALUE_LIST.indexOf(paramset[key].MAX);
        }

        if (obj.common.role === 'state' && obj.common.write) {
            obj.common.role = 'switch';
        } else if (obj.common.role === 'level.color.hue') {
            obj.common.max = 200;
        } else if (obj.common.role === 'value.rssi') {
            obj.common.unit = 'dBm';
        } else if (obj.common.role === 'value.voltage') {
            obj.common.unit = 'V';
        }

        if (paramset[key].OPERATIONS & 8) {
            obj.common.role = 'indicator.service';
        }

        if (typeof obj.common.role !== 'string' && typeof obj.common.role !== 'undefined') {
            throw `typeof obj.common.role ${typeof obj.common.role}`;
        }
        const dpID = `${channel._id}.${key}`;

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
            if (dpTypes[dpID].UNIT === '100%') {
                dpTypes[dpID].UNIT = '%';
            }
        }

        if (key === 'LEVEL' && paramset.WORKING) {
            obj.common.workingID = 'WORKING';
        }

        promises.push(new Promise(resolve => {
            adapter.extendObject(`${channel._id}.${key}`, obj, (err, res) => {
                if (!err) {
                    adapter.log.debug(`object ${res.id} extended`);
                } else {
                    adapter.log.error(`object ${res ? res.id : '?'} extend ${err}`);
                }
                resolve();
            });
        }));
    } // endFor

    Promise.all(promises).then(() => callback());
} // endAddParamsetObjects

function getValueParamsets() {
    if (queueValueParamsets.length === 0) {
        // Inform hm-rega about new devices
        adapter.setState('updated', true, false);
        // Inform hm-rega about new devices
        if (adapter.config.forceReInit) {
            adapter.extendForeignObject(`system.adapter.${adapter.namespace}`, {native: {forceReInit: false}});
        }
        return;
    }
    const obj = queueValueParamsets.pop();
    const cid = `${obj.native.PARENT_TYPE}.${obj.native.TYPE}.${obj.native.VERSION}`;

    adapter.log.debug(`getValueParamsets ${cid}`);

    // if meta values are cached for Epaper we extend this cached meta values by epaper states
    if (obj.native && obj.native.PARENT_TYPE === 'HM-Dis-EP-WM55' && obj.native.TYPE === 'MAINTENANCE') {
        addEPaperToMeta();
    }

    if (metaValues[cid]) {
        adapter.log.debug('paramset cache hit');
        addParamsetObjects(obj, metaValues[cid], () => setImmediate(getValueParamsets));
    } else {
        const key = `hm-rpc.meta.VALUES.${cid}`;
        adapter.getForeignObject(key, (err, res) => {

            if (res && res.native) {
                adapter.log.debug(`${key} found`);
                metaValues[cid] = res.native;

                if (obj.native && obj.native.PARENT_TYPE === 'HM-Dis-EP-WM55' && obj.native.TYPE === 'MAINTENANCE') {
                    addEPaperToMeta();
                }

                addParamsetObjects(obj, metaValues[cid], () => setImmediate(getValueParamsets));
            } else {
                adapter.log.info(`${adapter.config.type}rpc -> getParamsetDescription ${JSON.stringify([obj.native.ADDRESS, 'VALUES'])}`);
                try {
                    rpcClient.methodCall('getParamsetDescription', [obj.native.ADDRESS, 'VALUES'], (err, res) => {
                        if (err) {
                            adapter.log.error(`Error on getParamsetDescription: ${err}`);
                        } else {
                            metaValues[cid] = res;

                            if (obj.native && obj.native.PARENT_TYPE === 'HM-Dis-EP-WM55' && obj.native.TYPE === 'MAINTENANCE') {
                                addEPaperToMeta();
                            }

                            const paramset = {
                                'type': 'meta',
                                'meta': {
                                    adapter: 'hm-rpc',
                                    type: 'paramsetDescription'
                                },
                                'common': {},
                                'native': metaValues[cid]
                            };

                            if (res) {
                                // if not empty
                                for (const attr in res) {
                                    if (res.hasOwnProperty(attr)) {
                                        adapter.log.warn(`Send this info to developer: ${JSON.stringify(Object.assign({'_id': key}, paramset))}`);
                                        break;
                                    }
                                }
                            }

                            adapter.setForeignObject(key, paramset, () => {
                                addParamsetObjects(obj, metaValues[cid], () => {
                                    setImmediate(getValueParamsets);
                                });
                            });
                        }
                    });
                } catch (err) {
                    adapter.log.error(`Cannot call getParamsetDescription: ${err}`);
                }
            }
        });
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

function createDevices(deviceArr, callback) {
    const objs = [];

    for (const device of deviceArr) {
        let type;
        let role;
        let icon;

        if (device.PARENT) {
            type = 'channel';
            role = metaRoles.chTYPE && metaRoles.chTYPE[device.TYPE] ? metaRoles.chTYPE && metaRoles.chTYPE[device.TYPE] : undefined;
        } else {
            type = 'device';
            if (!images[device.TYPE]) {
                adapter.log.warn(`No image for "${device.TYPE}" found.`);
            }

            icon = images[device.TYPE] ? (`/icons/${images[device.TYPE]}`) : '';
        }

        const obj = {
            _id: device.ADDRESS.replace(':', '.').replace(FORBIDDEN_CHARS, '_'),
            type: type,
            common: {
                name: device.ADDRESS,
                role: role
            },
            native: device
        };

        if (icon) obj.common.icon = icon;

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

            // e. g. Humidity is from 0 to 99. It is wrong.
            if (dpTypes[dpID].MAX === 99) {
                dpTypes[dpID].MAX = 100;
            }

            // Sometimes unit is 100%, sometimes % it's the same
            if (dpTypes[dpID].UNIT === '100%') {
                dpTypes[dpID].UNIT = '%';
            }
        }
        objs.push(obj);
    }

    function queue() {
        if (objs.length) {

            const obj = objs.pop();

            if (metaRoles.dvTYPE && obj.native && metaRoles.dvTYPE[obj.native.PARENT_TYPE]) {
                obj.common.role = metaRoles.dvTYPE[obj.native.PARENT_TYPE];
            }

            adapter.setObject(obj._id, obj, (err, res) => {
                if (!err) {
                    adapter.log.debug(`object ${res.id} created`);
                } else {
                    adapter.log.error(`object ${res ? res.id : '?'} error on creation: ${err}`);
                }
                setImmediate(queue);
            });

            if (obj.type === 'channel') {
                queueValueParamsets.push(obj);
            }

        } else {
            getValueParamsets();
            callback(null, '');
        }
    }

    queue();
}

function getCuxDevices(callback) {
    if (rpcClient) {
        // request devices from CUxD
        try {
            rpcClient.methodCall('listDevices', [], (err, newDevices) => {
                if (err) {
                    adapter.log.error(`Error on listDevices: ${err}`);
                    return;
                }
                adapter.log.info(`${adapter.config.type}rpc -> listDevices ${newDevices.length}`);

                if (adapter.config.forceReInit === false) {
                    adapter.getObjectView('hm-rpc', 'listDevices', {
                        startkey: `hm-rpc.${adapter.instance}.`,
                        endkey: 'hm-rpc.' + adapter.instance + '.\u9999'
                    }, (err, doc) => {
                        if (doc && doc.rows) {
                            for (const row of doc.rows) {
                                if (row.id === `${adapter.namespace}.updated`) continue;

                                // lets get the device description
                                const val = row.value;

                                if (typeof val.ADDRESS === 'undefined') continue;

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
                                        if (val.ADDRESS.indexOf(':') !== -1) {
                                            const address = val.ADDRESS.replace(':', '.').replace(FORBIDDEN_CHARS, '_');
                                            const parts = address.split('.');
                                            adapter.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
                                            adapter.log.info(`obsolete channel ${address} ${JSON.stringify(address)} deleted`);
                                        } else {
                                            adapter.deleteDevice(val.ADDRESS);
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
                        createDevices(newDevices, callback);
                    });
                } else {
                    createDevices(newDevices, callback);
                }
            });
        } catch (err) {
            adapter.log.error(`Cannot call listDevices: ${err}`);
        }
    } else {
        callback && callback();
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

    // Virtual Devices API does not support PING
    if (!eventInterval && adapter.config.daemon !== 'virtual-devices') {
        adapter.log.debug('start ping interval');
        eventInterval = setInterval(keepAlive, adapter.config.checkInitInterval * 1000 / 2);
    }
}

function connect(isFirst) {
    if (!rpcClient && !adapter.config.useHttps) {
        rpcClient = rpc.createClient({
            host: adapter.config.homematicAddress,
            port: adapter.config.homematicPort,
            path: homematicPath,
            reconnectTimeout: adapter.config.reconnectInterval * 1000
        });

        // If we have bin-rpc, only need it here because bin-rpc cant have https
        if (rpcClient.on) {
            rpcClient.on('error', err => {
                adapter.log.error(`Socket error: ${err}`);
            });
        } // endIf
    } else if (!rpcClient) {
        adapter.getForeignObject('system.config', (err, obj) => {
            let password;
            let username;

            if (obj && obj.native && obj.native.secret) {
                password = crypto.decrypt(obj.native.secret, adapter.config.password);
                username = crypto.decrypt(obj.native.secret, adapter.config.username);
            } else {
                password = crypto.decrypt('Zgfr56gFe87jJOM', adapter.config.password);
                username = crypto.decrypt('Zgfr56gFe87jJOM', adapter.config.username);
            } // endElse

            rpcClient = rpc.createSecureClient({
                host: adapter.config.homematicAddress,
                port: adapter.config.homematicPort,
                path: homematicPath,
                reconnectTimeout: adapter.config.reconnectInterval * 1000,
                basic_auth: {user: username, pass: password},
                rejectUnauthorized: false
            });
        });

    } // endElseIf

    connTimeout = null;
    adapter.log.debug('Connect...');
    if (eventInterval) {
        adapter.log.debug('clear ping interval');
        clearInterval(eventInterval);
        eventInterval = null;
    }

    if (isFirst) sendInit();

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
    if (!lastEvent || (_now - lastEvent) >= adapter.config.checkInitInterval * 1000) {
        adapter.log.debug('[KEEPALIVE] Connection timed out, initializing new connection');
        connect();
    } else {
        sendPing();
    }
} // endKeepAlive

function createMeta() {
    return new Promise(resolve => {
        const promises = [];
        for (const data of meta) {
            promises.push(adapter.setForeignObjectAsync(data._id, data));
        } // endFor
        adapter.log.debug('[META] Meta data updated');
        Promise.all(promises).then(resolve);
    });
}  // endCreateMeta

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
} // endElse
