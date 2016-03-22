/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// the adapter object
var adapter = utils.adapter({

    name: 'hm-rpc',

    ready: function () {
        adapter.subscribeStates('*');
        main();
    },
    stateChange: function (id, state) {
        if (state && state.ack !== true) {
            var tmp = id.split('.');
            var val;
            adapter.log.debug(adapter.config.type + 'rpc -> setValue ' + tmp[3] + ' ' + tmp[4] + ': ' + state.val);

            if (id == adapter.namespace + '.updated') return;
            if (!dpTypes[id]) {
                adapter.log.error(adapter.config.type + 'rpc -> setValue: no dpType for ' + id + '!');
                return;
            }

            if (dpTypes[id].UNIT === '100%') {
                state.val = state.val / 100;
            }

            var type = dpTypes[id].TYPE;

            switch (type) {
                case 'BOOL':
                    val = (state.val === "false" || state.val === "0") ? false : !!state.val;
                    break;
                case 'FLOAT':
                    val = {explicitDouble: state.val};
                    break;
                default:
                    val = state.val;
            }
            adapter.log.info('setValue ' + JSON.stringify([tmp[2] + ':' + tmp[3], tmp[4], val]) + ' ' + type);
            try {
                rpcClient.methodCall('setValue', [tmp[2] + ':' + tmp[3], tmp[4], val], function (err, data) {
                    if (err) {
                        adapter.log.error(adapter.config.type + 'rpc -> setValue ' + JSON.stringify([tmp[3], tmp[4], state.val]) + ' ' + type);
                        adapter.log.error(err);
                    }
                });
            } catch (err) {
                adapter.log.error('Cannot call setValue: :' + err);
            }
        }
    },
    // Add messagebox Function for ioBroker.occ
    message: function (obj) {
        if (obj.message.params === undefined || obj.message.params === null) {
            try {
                rpcClient.methodCall(obj.command, [obj.message.ID, obj.message.paramType], function (err, data) {
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, {result: data, error: err}, obj.callback);
                });
            } catch (err) {
                adapter.log.error('Cannot call ' + obj.command + ': ' + err);
            }
        } else {
            try {
                rpcClient.methodCall(obj.command, [obj.message.ID, obj.message.paramType, obj.message.params], function (err, data) {
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, {result: data, error: err}, obj.callback);
                });
            } catch (err) {
                adapter.log.error('Cannot call ' + obj.command + ': ' + err);
            }
        }
    },
    unload: function (callback) {
        try {
            if (eventInterval) {
                clearInterval(eventInterval);
                eventInterval = null;
            }

            if (adapter.config) {
                adapter.log.info(adapter.config.type + "rpc -> " + adapter.config.homematicAddress + ':' + adapter.config.homematicPort + ' init ' + JSON.stringify([daemonURL, '']));
                try {
                    rpcClient.methodCall('init', [daemonURL, ''], function (err, data) {
                        adapter.setState('info.connection', false, true);
                        callback();
                    });
                } catch (err) {
                    adapter.log.error('Cannot call init: [' + daemonURL + ', ""]' + err);
                }

            } else {
                callback();
            }
        } catch (e) {
            if (adapter && adapter.log) {
                adapter.log.error(e);
            } else {
                console.log(e);
            }
            callback();
        }
    }
});

var rpc;
var rpcClient;

var rpcServer;

var metaValues =    {};
var metaRoles =     {};
var dpTypes =       {};

var lastEvent = 0;
var eventInterval;
var rpcInitString = null;
var daemonURL = '';
var daemonProto = '';

var images =  {
    'HM-LC-Dim1TPBU-FM': 'PushButton-2ch-wm_thumb.png',
    'HM-LC-Sw1PBU-FM':   'PushButton-2ch-wm_thumb.png',
    'HM-LC-Bl1PBU-FM':   'PushButton-2ch-wm_thumb.png',
    'HM-LC-Sw1-PB-FM':   'PushButton-2ch-wm_thumb.png',
    'HM-PB-2-WM':        'PushButton-2ch-wm_thumb.png',
    'HM-LC-Sw2-PB-FM':   'PushButton-4ch-wm_thumb.png',
    'HM-PB-4-WM':        'PushButton-4ch-wm_thumb.png',
    'HM-LC-Dim1L-Pl':    'OM55_DimmerSwitch_thumb.png',
    'HM-LC-Dim1T-Pl':    'OM55_DimmerSwitch_thumb.png',
    'HM-LC-Sw1-Pl':      'OM55_DimmerSwitch_thumb.png',
    'HM-LC-Dim1L-Pl-2':  'OM55_DimmerSwitch_thumb.png',
    'HM-LC-Sw1-Pl-OM54': 'OM55_DimmerSwitch_thumb.png',
    'HM-Sys-sRP-Pl':     'OM55_DimmerSwitch_thumb.png',
    'HM-LC-Dim1T-Pl-2':  'OM55_DimmerSwitch_thumb.png',
    'HM-LC-Sw1-Pl-2':    'OM55_DimmerSwitch_thumb.png',
    'HM-LC-Sw4-Ba-PCB':  '88_hm-lc-sw4-ba-pcb_thumb.png',
    'HM-Sen-RD-O':       '87_hm-sen-rd-o_thumb.png',
    'HM-RC-Sec4-2':      '86_hm-rc-sec4-2_thumb.png',
    'HM-PB-6-WM55':      '86_hm-pb-6-wm55_thumb.png',
    'HM-RC-Key4-2':      '85_hm-rc-key4-2_thumb.png',
    'HM-RC-4-2':         '84_hm-rc-4-2_thumb.png',
    'HM-CC-RT-DN':       '83_hm-cc-rt-dn_thumb.png',
    'HM-Sen-Wa-Od':      '82_hm-sen-wa-od_thumb.png',
    'HM-Sen-WA-OD':      '82_hm-sen-wa-od_thumb.png',
    'HM-Dis-TD-T':       '81_hm-dis-td-t_thumb.png',
    'HM-Sen-MDIR-O':     '80_hm-sen-mdir-o_thumb.png',
    'HM-OU-LED16':       '78_hm-ou-led16_thumb.png',
    'HM-LC-Sw1-Ba-PCB':  '77_hm-lc-sw1-ba-pcb_thumb.png',
    'HM-LC-Sw4-WM':      '76_hm-lc-sw4-wm_thumb.png',
    'HM-PB-2-WM55':      '75_hm-pb-2-wm55_thumb.png',
    'atent':             '73_hm-atent_thumb.png',
    'HM-RC-BRC-H':       '72_hm-rc-brc-h_thumb.png',
    'HMW-IO-12-Sw14-DR': '71_hmw-io-12-sw14-dr_thumb.png',
    'HM-PB-4Dis-WM':     '70_hm-pb-4dis-wm_thumb.png',
    'HM-LC-Sw2-DR':      '69_hm-lc-sw2-dr_thumb.png',
    'HM-LC-Sw4-DR':      '68_hm-lc-sw4-dr_thumb.png',
    'HM-SCI-3-FM':       '67_hm-sci-3-fm_thumb.png',
    'HM-LC-Dim1T-CV':    '66_hm-lc-dim1t-cv_thumb.png',
    'HM-LC-Dim1T-FM':    '65_hm-lc-dim1t-fm_thumb.png',
    'HM-LC-Dim2T-SM':    '64_hm-lc-dim2T-sm_thumb.png',
    'HM-LC-Bl1-pb-FM':   '61_hm-lc-bl1-pb-fm_thumb.png',
    'HM-LC-Bi1-pb-FM':   '61_hm-lc-bi1-pb-fm_thumb.png',
    'HM-OU-CF-Pl':       '60_hm-ou-cf-pl_thumb.png',
    'HM-OU-CFM-Pl':      '60_hm-ou-cf-pl_thumb.png',
    'HMW-IO-12-FM':      '59_hmw-io-12-fm_thumb.png',
    'HMW-Sen-SC-12-FM':  '58_hmw-sen-sc-12-fm_thumb.png',
    'HM-CC-SCD':         '57_hm-cc-scd_thumb.png',
    'HMW-Sen-SC-12-DR':  '56_hmw-sen-sc-12-dr_thumb.png',
    'HM-Sec-SFA-SM':     '55_hm-sec-sfa-sm_thumb.png',
    'HM-LC-ddc1':        '54a_lc-ddc1_thumb.png',
    'HM-LC-ddc1-PCB':    '54_hm-lc-ddc1-pcb_thumb.png',
    'HM-Sen-MDIR-SM':    '53_hm-sen-mdir-sm_thumb.png',
    'HM-Sec-SD-Team':    '52_hm-sec-sd-team_thumb.png',
    'HM-Sec-SD':         '51_hm-sec-sd_thumb.png',
    'HM-Sec-MDIR':       '50_hm-sec-mdir_thumb.png',
    'HM-Sec-WDS':        '49_hm-sec-wds_thumb.png',
    'HM-Sen-EP':         '48_hm-sen-ep_thumb.png',
    'HM-Sec-TiS':        '47_hm-sec-tis_thumb.png',
    'HM-LC-Sw4-PCB':     '46_hm-lc-sw4-pcb_thumb.png',
    'HM-LC-Dim2L-SM':    '45_hm-lc-dim2l-sm_thumb.png',
    'HM-EM-CCM':         '44_hm-em-ccm_thumb.png',
    'HM-CC-VD':          '43_hm-cc-vd_thumb.png',
    'HM-CC-TC':          '42_hm-cc-tc_thumb.png',
    'HM-Swi-3-FM':       '39_hm-swi-3-fm_thumb.png',
    'HM-PBI-4-FM':       '38_hm-pbi-4-fm_thumb.png',
    'HMW-Sys-PS7-DR':    '36_hmw-sys-ps7-dr_thumb.png',
    'HMW-Sys-TM-DR':     '35_hmw-sys-tm-dr_thumb.png',
    'HMW-Sys-TM':        '34_hmw-sys-tm_thumb.png',
    'HMW-Sec-TR-FM':     '33_hmw-sec-tr-fm_thumb.png',
    'HMW-WSTH-SM':       '32_hmw-wsth-sm_thumb.png',
    'HMW-WSE-SM':        '31_hmw-wse-sm_thumb.png',
    'HMW-IO-12-Sw7-DR':  '30_hmw-io-12-sw7-dr_thumb.png',
    'HMW-IO-4-FM':       '29_hmw-io-4-fm_thumb.png',
    'HMW-LC-Dim1L-DR':   '28_hmw-lc-dim1l-dr_thumb.png',
    'HMW-LC-Bl1-DR':     '27_hmw-lc-bl1-dr_thumb.png',
    'HMW-LC-Sw2-DR':     '26_hmw-lc-sw2-dr_thumb.png',
    'HM-EM-CMM':         '25_hm-em-cmm_thumb.png',
    'HM-CCU-1':          '24_hm-cen-3-1_thumb.png',
    'HM-RCV-50':         '24_hm-cen-3-1_thumb.png',
    'HMW-RCV-50':        '24_hm-cen-3-1_thumb.png',
    'HM-RC-Key3':        '23_hm-rc-key3-b_thumb.png',
    'HM-RC-Key3-B':      '23_hm-rc-key3-b_thumb.png',
    'HM-RC-Sec3':        '22_hm-rc-sec3-b_thumb.png',
    'HM-RC-Sec3-B':      '22_hm-rc-sec3-b_thumb.png',
    'HM-RC-P1':          '21_hm-rc-p1_thumb.png',
    'HM-RC-19':          '20_hm-rc-19_thumb.png',
    'HM-RC-19-B':        '20_hm-rc-19_thumb.png',
    'HM-RC-19-SW':       '20_hm-rc-19_thumb.png',
    'HM-RC-12':          '19_hm-rc-12_thumb.png',
    'HM-RC-12-B':        '19_hm-rc-12_thumb.png',
    'HM-RC-4':           '18_hm-rc-4_thumb.png',
    'HM-RC-4-B':         '18_hm-rc-4_thumb.png',
    'HM-Sec-RHS':        '17_hm-sec-rhs_thumb.png',
    'HM-Sec-SC':         '16_hm-sec-sc_thumb.png',
    'HM-Sec-Win':        '15_hm-sec-win_thumb.png',
    'HM-Sec-Key':        '14_hm-sec-key_thumb.png',
    'HM-Sec-Key-S':      '14_hm-sec-key_thumb.png',
    'HM-WS550STH-I':     '13_hm-ws550sth-i_thumb.png',
    'HM-WDS40-TH-I':     '13_hm-ws550sth-i_thumb.png',
    'HM-WS550-US':       '9_hm-ws550-us_thumb.png',
    'WS550':             '9_hm-ws550-us_thumb.png',
    'HM-WDC7000':        '9_hm-ws550-us_thumb.png',
    'HM-LC-Sw1-SM':      '8_hm-lc-sw1-sm_thumb.png',
    'HM-LC-Bl1-FM':      '7_hm-lc-bl1-fm_thumb.png',
    'HM-LC-Bl1-SM':      '6_hm-lc-bl1-sm_thumb.png',
    'HM-LC-Sw2-FM':      '5_hm-lc-sw2-fm_thumb.png',
    'HM-LC-Sw1-FM':      '4_hm-lc-sw1-fm_thumb.png',
    'HM-LC-Sw4-SM':      '3_hm-lc-sw4-sm_thumb.png',
    'HM-LC-Dim1L-CV':    '2_hm-lc-dim1l-cv_thumb.png',
    'HM-LC-Dim1PWM-CV':  '2_hm-lc-dim1l-cv_thumb.png',
    'HM-WS550ST-IO':     'IP65_G201_thumb.png',
    'HM-WDS30-T-O':      'IP65_G201_thumb.png',
    'HM-WDS100-C6-O':    'WeatherCombiSensor_thumb.png',
    'HM-WDS10-TH-O':     'TH_CS_thumb.png',
    'HM-WS550STH-O':     'TH_CS_thumb.png',
    'HM-WDS30-OT2-SM':   'IP65_G201_thumb.png'
};

function main() {
    if (adapter.config.type === 'bin') {
        rpc = require('binrpc');
        daemonProto = 'xmlrpc_bin://';
    } else {
        rpc = require('homematic-xmlrpc');
        adapter.config.type = 'xml';
        daemonProto = 'http://';
    }
    
    rpcClient = rpc.createClient({
        host: adapter.config.homematicAddress,
        port: adapter.config.homematicPort,
        path: '/'
    });
    
    // Load VALUE paramsetDescriptions (needed to create state objects)
    adapter.objects.getObjectView('hm-rpc', 'paramsetDescription', {startkey: 'hm-rpc.meta.VALUES', endkey: 'hm-rpc.meta.VALUES.\u9999'}, function handleValueParamSetDescriptions(err, doc) {
        // Todo Handle Errors
        if (doc) {
            for (var i = 0; i < doc.rows.length; i++) {
                metaValues[doc.rows[i].id.slice(19)] = doc.rows[i].value.native;
            }
        }
        // Load common.role assignments
        adapter.objects.getObject('hm-rpc.meta.roles', function (err, res) {
            // Todo Handle Errors
            metaRoles = res.native;
            
            // Start Adapter
            if (adapter.config) {
                initRpcServer();
            }
        });
    });
    
    adapter.objects.getObjectView('system', 'state', {startkey: adapter.namespace, endkey: adapter.namespace + '\u9999'}, function handleStateViews(err, res) {
        if (!err && res.rows) {
            for (var i = 0; i < res.rows.length; i++) {
                if (res.rows[i].id == adapter.namespace + '.updated') continue;
                if (!res.rows[i].value.native) {
                    adapter.log.warn('State ' + res.rows[i].id + ' does not have native.');
                    dpTypes[res.rows[i].id] = {UNIT: '', TYPE: ''};
                } else {
                    dpTypes[res.rows[i].id] = {UNIT: res.rows[i].value.native.UNIT, TYPE: res.rows[i].value.native.TYPE};
                }
            }
        }
    });
}

function sendInit() {
    adapter.log.debug('Send INIT...');
    try {
        rpcClient.methodCall('init', [daemonURL, adapter.namespace], function handleInit(err, data) {
            if (!err) {
                if (adapter.config.daemon === 'CUxD') {
                    getCuxDevices(function handleCuxDevices(err2) {
                        if (!err2) {
                            connection();
                        } else {
                            adapter.log.error(err2);
                        }
                    });
                } else {
                    connection();
                }
            } else {
                adapter.log.error(err);
            }
        });
    } catch (err) {
        adapter.log.error('Init not possible, going to stop: ', err);
        adapter.stop();
    }
}

function sendPing() {
    adapter.log.debug('Send PING...');
    try {
        rpcClient.methodCall('ping', [adapter.namespace], function (err, data) {
            if (!err) {
                adapter.log.debug('no event recieved within keepalive-timeout, so PING sent');
            } else {
                adapter.log.error(err);
            }
        });
    } catch (err) {
        adapter.log.error('Cannot call ping [' + adapter.namespace + ']: ' + err);
    }
}

function initRpcServer() {
    //adapterPort was introduced in v1.0.1. If not set yet then try 2000
    var adapterPort = parseInt(adapter.config.port || adapter.config.homematicPort, 10) || 2000;
    adapter.getPort(adapterPort, function (port) {
        daemonURL = daemonProto + adapter.config.adapterAddress + ':' + port;
        rpcServer = rpc.createServer({host: adapter.config.adapterAddress, port: port});

        adapter.log.info(adapter.config.type + 'rpc server is trying to listen on ' + adapter.config.adapterAddress + ':' + port);

        adapter.log.info(adapter.config.type + 'rpc -> ' + adapter.config.homematicAddress + ':' + adapter.config.homematicPort + ' init ' + JSON.stringify([daemonURL, adapter.namespace]));

        sendInit();

        rpcServer.on('NotFound', function (method, params) {
            adapter.log.warn(adapter.config.type + 'rpc <- undefined method ' + method + ' ' + JSON.stringify(params).slice(0, 80));
        });

        rpcServer.on('system.multicall', function (method, params, callback) {
            connection();
            var response = [];
            for (var i = 0; i < params[0].length; i++) {
                if (methods[params[0][i].methodName]) {
                    adapter.log.debug(adapter.config.type + ' multicall <' + params[0][i].methodName + '>: ' + params[0][i].params);
                    response.push(methods[params[0][i].methodName](null, params[0][i].params));
                } else {
                    response.push('');
                }
            }
            callback(null, response);
        });

        rpcServer.on('system.listMethods', function (err, params, callback) {
            adapter.log.info(adapter.config.type + 'rpc <- system.listMethods ' + JSON.stringify(params));
            callback(null, ['event', 'deleteDevices', 'listDevices', 'newDevices', 'system.listMethods', 'system.multicall']);
        });

        rpcServer.on('event', function (err, params, callback) {
            connection();
            callback(null, methods.event(err, params));
        });

        rpcServer.on('newDevices', function (err, params, callback) {
            adapter.log.info(adapter.config.type + 'rpc <- newDevices ' + params[1].length);
            createDevices(params[1], callback);
        });

        rpcServer.on('listDevices', function (err, params, callback) {
            adapter.log.info(adapter.config.type + 'rpc <- listDevices ' + JSON.stringify(params));
            adapter.objects.getObjectView('hm-rpc', 'listDevices', {startkey: 'hm-rpc.' + adapter.instance + '.', endkey: 'hm-rpc.' + adapter.instance + '.\u9999'}, function (err, doc) {
                var response = [];
                if (!adapter.config.forceReInit) {
                     for (var i = 0; i < doc.rows.length; i++) {
                         if (doc.rows[i].id == adapter.namespace + '.updated') continue;
                         var val = doc.rows[i].value;

                         /*if (val.PARENT_TYPE) {
                            channelParams[val.ADDRESS] = val.PARENT_TYPE + '.' + val.TYPE + '.' + val.VERSION;
                         }*/

                         response.push({ADDRESS: val.ADDRESS, VERSION: val.VERSION});
                     }
                }
                adapter.log.info(adapter.config.type + 'rpc -> ' + response.length + ' devices');
                //log.info(JSON.stringify(response));
                callback(null, response);
            });
        });

        rpcServer.on('deleteDevices', function (err, params, callback) {
            adapter.log.info(adapter.config.type + 'rpc <- deleteDevices ' + params[1].length);
            for (var i = 0; i < params[1].length; i++) {
                if (params[1][i].indexOf(':') != -1) {
                    params[1][i] = params[1][i].replace(':', '.');
                    adapter.log.info('channel ' + params[1][i] + ' ' + JSON.stringify(params[1][i]) + ' deleted');
                    var parts = params[1][i].split('.');
                    adapter.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
                } else {
                    adapter.log.info('device ' + params[1][i] + ' deleted');
                    adapter.deleteDevice(params[1][i]);
                }
            }
            callback(null, '');
        });
    });
}

var methods = {

    event: function (err, params) {
        adapter.log.debug(adapter.config.type + 'rpc <- event ' + JSON.stringify(params));
        var val;
        var channel = params[1].replace(':', '.');
        var name = params[0] + '.' + channel + '.' + params[2];

        if (dpTypes[name] && dpTypes[name].UNIT === '100%') {
            val = (params[3] * 100);
        } else {
            val = params[3];
        }

        adapter.setState(channel + '.' + params[2], {val: val, ack: true});
        return '';
    }

};

var queueValueParamsets = [];

function _logResult(err, res) {
    if (!err) {
        adapter.log.info('object ' + res.id + ' extended');
    } else {
        adapter.log.error('object ' + (res ? res.id : '?') + ' extend ' + err);
    }
}

function addParamsetObjects(channel, paramset) {
    var channelChildren = [];
    for (var key in paramset) {
        channelChildren.push(channel._id + '.' + key);
        var commonType = {
            'ACTION':  'boolean',
            'BOOL':    'boolean',
            'FLOAT':   'number',
            'ENUM':    'number',
            'INTEGER': 'number',
            'STRING':  'string'
        };

        var obj = {
            type:   'state',
            common: {
                def:   paramset[key].DEFAULT,
                type:  commonType[paramset[key].TYPE] || paramset[key].TYPE || '',
                read:  (paramset[key].OPERATIONS & 1 ? true : false),
                write: (paramset[key].OPERATIONS & 2 ? true : false)
            },
            native: paramset[key]
        };

        if (obj.common.type === 'number') {
            var i;
            obj.common.min = paramset[key].MIN;
            obj.common.max = paramset[key].MAX;

            if (paramset[key].TYPE === 'ENUM') {
                obj.common.states = {};
                for (i = 0; i < paramset[key].VALUE_LIST.length; i++) {
                    obj.common.states[i] = paramset[key].VALUE_LIST[i];
                }
            }

            if (paramset[key].SPECIAL) {
                if (!obj.common.states) obj.common.states = {};
                for (i = 0; i < paramset[key].SPECIAL.length; i++) {
                    obj.common.states[paramset[key].SPECIAL[i].VALUE] = paramset[key].SPECIAL[i].ID;
                }
            }

        }

        if (paramset[key].UNIT === '100%') {
            obj.common.unit = '%';
            obj.common.max = 100 * paramset[key].MAX;
        } else if (paramset[key].UNIT !== '') {
            obj.common.unit = paramset[key].UNIT;
            if (obj.common.unit == '�C') {
                obj.common.unit = '°C';
            } else if (obj.common.unit == '�F') {
                obj.common.unit = '°F';
            }
        }

        if (metaRoles.dpCONTROL && metaRoles.dpCONTROL[obj.native.CONTROL]) {
            obj.common.role = metaRoles.dpCONTROL[obj.native.CONTROL];

        } else if (metaRoles.chTYPE_dpNAME && metaRoles.chTYPE_dpNAME[channel.native.TYPE + '.' + key]) {
            obj.common.role = metaRoles.chTYPE_dpNAME[channel.native.TYPE + '.' + key];

        } else if (metaRoles.dpNAME && metaRoles.dpNAME[key]) {
            obj.common.role =  metaRoles.dpNAME[key];
        }


        if (paramset[key].OPERATIONS & 8) {
            obj.common.role = 'indicator.service';
        }

        if (typeof obj.common.role !== 'string' && typeof obj.common.role !== 'undefined') {
            throw 'typeof obj.common.role ' + typeof obj.common.role;
        }
        dpTypes[adapter.namespace + '.' + channel._id + '.' + key] = {UNIT: paramset[key].UNIT, TYPE: paramset[key].TYPE};
        if (key == 'LEVEL' && paramset.WORKING) {
            obj.common.workingID = 'WORKING';
        }

        adapter.extendObject(channel._id + '.' + key, obj, _logResult);
    }
}

function getValueParamsets() {
    if (queueValueParamsets.length === 0) {
        // Inform hm-rega about new devices
        adapter.setState('updated', true, true);
        // Inform hm-rega about new devices
        if (adapter.config.forceReInit) {
            adapter.extendForeignObject('system.adapter.' + adapter.namespace, {native: {forceReInit: false}});
        }
        return;
    }
    var obj = queueValueParamsets.pop();
    var cid = obj.native.PARENT_TYPE + '.' + obj.native.TYPE + '.' + obj.native.VERSION;

    adapter.log.debug('getValueParamsets ' + cid);

    if (metaValues[cid]) {

        adapter.log.debug('paramset cache hit');
        addParamsetObjects(obj, metaValues[cid]);
        setTimeout(getValueParamsets, 50);

    } else {

        var key = 'hm-rpc.meta.VALUES.' + cid;
        adapter.objects.getObject(key, function (err, res) {

            if (res && res.native) {
                adapter.log.debug(key + ' found');
                metaValues[cid] = res.native;
                addParamsetObjects(obj, res.native);
                setTimeout(getValueParamsets, 50);
            } else {
                adapter.log.info(adapter.config.type + 'rpc -> getParamsetDescription ' + JSON.stringify([obj.native.ADDRESS, 'VALUES']));
                try {
                    rpcClient.methodCall('getParamsetDescription', [obj.native.ADDRESS, 'VALUES'], function (err, res) {
                        var paramset = {
                            'type': 'meta',
                            'meta': {
                                adapter: 'hm-rpc',
                                type: 'paramsetDescription'
                            },
                            'common': {

                            },
                            'native': res
                        };
                        metaValues[key] = res;
                        setTimeout(getValueParamsets, 1200); // Slow down
                        adapter.log.info('setObject ' + key);
                        adapter.objects.setObject(key, paramset);
                        addParamsetObjects(obj, res);
                    });
                } catch (err) {
                    adapter.log.error('Cannot call getParamsetDescription: :' + err);
                }
            }

        });
    }
}

function createDevices(deviceArr, callback) {
    var objs = [];

    for (var i = 0; i < deviceArr.length; i++) {
        var type;
        var role;
        var icon;

        if (deviceArr[i].PARENT) {
            type = 'channel';
            role = metaRoles.chTYPE && metaRoles.chTYPE[deviceArr[i].TYPE] ? metaRoles.chTYPE && metaRoles.chTYPE[deviceArr[i].TYPE] : undefined;
        } else {
            type = 'device';
            icon = images[deviceArr[i].TYPE] ? ('/icons/' + images[deviceArr[i].TYPE]) : '';
        }

        var obj = {
            _id: deviceArr[i].ADDRESS.replace(':', '.'),
            type: type,
            common: {
                // FIXME strange bug - LEVEL and WORKING datapoint of Dimmers have name of first dimmer device?!?
                name: deviceArr[i].ADDRESS,
                role: role
            },
            native: deviceArr[i]
        };

        if (icon) obj.common.icon = icon;

        dpTypes[adapter.namespace + '.' + obj._id] = {UNIT: deviceArr[i].UNIT, TYPE: deviceArr[i].TYPE};
        objs.push(obj);
    }

    function queue() {
        if (objs.length) {

            var obj = objs.pop();
            adapter.setObject(obj._id, obj, function (err, res) {
                if (!err) {
                    adapter.log.info('object ' + res.id + ' created');
                } else {
                    adapter.log.error('object ' + (res ? res.id : '?') + ' error on creation: ' + err);
                }
                setTimeout(queue, 0);
            });

            if (obj.type === 'channel') {
                var cid = obj.PARENT_TYPE + '.' + obj.TYPE + '.' + obj.VERSION;
                //channelParams[obj._id] = cid;
                if (!metaValues[cid]) {
                    queueValueParamsets.push(obj);
                }
            }

        } else {
            getValueParamsets();
            callback(null, '');
        }
    }

    queue();
}

function getCuxDevices(callback) {
    // Todo read existing devices from couchdb and put IDs in array
    // var devices = [];

    // request devices from CUxD
    try {
        rpcClient.methodCall('listDevices', [], function (err, data) {
            adapter.log.info(adapter.config.type + 'rpc -> listDevices ' + data.length);
            // Todo remove device ids from array
            createDevices(data, callback);
        });
    } catch (err) {
        adapter.log.error('Cannot call listDevices: ' + err);
    }
    // Todo delete all in array remaining devices
}

function connection() {
    var now = (new Date()).getTime();
    // do not send more often than 5 seconds
    if (!lastEvent || now - lastEvent > 5000) {
        adapter.setState('info.connection', {val: true, expire: 300, ack: true});
    }
    
    lastEvent = (new Date()).getTime();
    
    if (!eventInterval) {
        adapter.config.checkInitInterval = parseInt(adapter.config.checkInitInterval, 10);
        
        if (adapter.config.checkInitInterval < 10) {
            adapter.log.error('Check init interval is less than 10 seconds. Set init interval to 10 seconds.');
            adapter.config.checkInitInterval = 10;
        }
        
        eventInterval = setInterval(keepAlive, adapter.config.checkInitInterval * 1000 / 2);
    }
}

function keepAlive() {
    var _now = (new Date()).getTime();
    // Check last event time. If timeout => send init again
    if (!lastEvent || ((_now - lastEvent) >= adapter.config.checkInitInterval * 1000)) {
        sendInit();
    } else
    // Send every half interval ping to CCU
    if (!lastEvent || 1 || ((_now - lastEvent) >= adapter.config.checkInitInterval * 1000 / 2)) {
        sendPing();
    }
}

