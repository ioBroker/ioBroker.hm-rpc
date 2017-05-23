/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';
var utils  = require(__dirname + '/lib/utils'); // Get common adapter utils
var images = require(__dirname + '/lib/images');
var connected = false;

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

            if (id === adapter.namespace + '.updated') return;

            adapter.log.debug(adapter.config.type + 'rpc -> setValue ' + tmp[3] + ' ' + tmp[4] + ': ' + state.val);

            if (!dpTypes[id]) {
                adapter.log.error(adapter.config.type + 'rpc -> setValue: no dpType for ' + id + '!');
                return;
            }

            if (dpTypes[id].UNIT === '%' && dpTypes[id].MIN !== undefined) {
                state.val = (state.val / 100) * (dpTypes[id].MAX - dpTypes[id].MIN) + dpTypes[id].MIN;
                state.val = Math.round(state.val * 1000) / 1000;
            } else
            if (dpTypes[id].UNIT === '100%') {
                state.val = state.val / 100;
            }

            var type = dpTypes[id].TYPE;

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

            adapter.log.debug('setValue ' + JSON.stringify([tmp[2] + ':' + tmp[3], tmp[4], val]) + ' ' + type);

            try {
                if (rpcClient && connected) {
                    rpcClient.methodCall('setValue', [tmp[2] + ':' + tmp[3], tmp[4], val], function (err, data) {
                        if (err) {
                            adapter.log.error(adapter.config.type + 'rpc -> setValue ' + JSON.stringify([tmp[3], tmp[4], state.val]) + ' ' + type);
                            adapter.log.error(err);
                        }
                    });
                } else {
                    adapter.log.warn('Cannot setValue "' + id + '", because not connected.');
                }
            } catch (err) {
                adapter.log.error('Cannot call setValue: :' + err);
            }
        }
    },
    // Add messagebox Function for ioBroker.occ
    message: function (obj) {
        if (obj.message.params === undefined || obj.message.params === null) {
            try {
                if (rpcClient && connected) {
                    rpcClient.methodCall(obj.command, [obj.message.ID, obj.message.paramType], function (err, data) {
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {result: data, error: err}, obj.callback);
                    });
                } else {
                    adapter.log.warn('Cannot send "' + obj.command + '" "' + obj.message.ID + '": because not connected');
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'not connected'}, obj.callback);
                }
            } catch (err) {
                adapter.log.error('Cannot call ' + obj.command + ': ' + err);
                adapter.sendTo(obj.from, obj.command, {error: err}, obj.callback);
            }
        } else {
            try {
                if (rpcClient && connected) {
                    rpcClient.methodCall(obj.command, [obj.message.ID, obj.message.paramType, obj.message.params], function (err, data) {
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {
                            result: data,
                            error:  err
                        }, obj.callback);
                    });
                } else {
                    adapter.log.warn('Cannot send "' + obj.command + '" "' + obj.message.ID + '": because not connected');
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'not connected'}, obj.callback);
                }
            } catch (err) {
                adapter.log.error('Cannot call ' + obj.command + ': ' + err);
                adapter.sendTo(obj.from, obj.command, {error: err}, obj.callback);
            }
        }
    },
    unload: function (callback) {
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
                adapter.log.info(adapter.config.type + 'rpc -> ' + adapter.config.homematicAddress + ':' + adapter.config.homematicPort + ' init ' + JSON.stringify([daemonURL, '']));
                try {
                    rpcClient.methodCall('init', [daemonURL, ''], function (err, data) {
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
                    adapter.log.error('Cannot call init: [' + daemonURL + ', ""]' + err);
                    if (callback) callback();
                    callback = null;
                }

            } else {
                if (callback) callback();
                callback = null;
            }
        } catch (e) {
            if (adapter && adapter.log) {
                adapter.log.error('Unload error: ' + e);
            } else {
                console.log(e);
            }
            if (callback) callback();
            callback = null;
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
var connInterval;
var connTimeout;
var daemonURL = '';
var daemonProto = '';



function main() {
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
    adapter.objects.getObjectView('hm-rpc', 'paramsetDescription', {startkey: 'hm-rpc.meta.VALUES', endkey: 'hm-rpc.meta.VALUES.\u9999'}, function handleValueParamSetDescriptions(err, doc) {
        if (err) adapter.log.error('getObjectView hm-rpc: ' + err);
        if (doc && doc.rows) {
            for (var i = 0; i < doc.rows.length; i++) {
                metaValues[doc.rows[i].id.slice(19)] = doc.rows[i].value.native;
            }
        }
        // Load common.role assignments
        adapter.objects.getObject('hm-rpc.meta.roles', function (err, res) {
            if (err) adapter.log.error('hm-rpc.meta.roles: ' + err);
            if (res) metaRoles = res.native;

            // Start Adapter
            if (adapter.config) initRpcServer();
        });
    });

    adapter.objects.getObjectView('system', 'state', {startkey: adapter.namespace, endkey: adapter.namespace + '\u9999'}, function handleStateViews(err, res) {
        if (!err && res.rows) {
            for (var i = 0; i < res.rows.length; i++) {
                if (res.rows[i].id === adapter.namespace + '.updated') continue;
                if (!res.rows[i].value.native) {
                    adapter.log.warn('State ' + res.rows[i].id + ' does not have native.');
                    dpTypes[res.rows[i].id] = {UNIT: '', TYPE: ''};
                } else {
                    dpTypes[res.rows[i].id] = {
                        UNIT: res.rows[i].value.native.UNIT,
                        TYPE: res.rows[i].value.native.TYPE,
                        MIN:  res.rows[i].value.native.MIN,
                        MAX:  res.rows[i].value.native.MAX
                    };

                    if (dpTypes[res.rows[i].id].MIN !== undefined && typeof dpTypes[res.rows[i].id].MIN === 'number') {
                        dpTypes[res.rows[i].id].MIN = parseFloat(dpTypes[res.rows[i].id].MIN);
                        dpTypes[res.rows[i].id].MAX = parseFloat(dpTypes[res.rows[i].id].MAX);
                        if (dpTypes[res.rows[i].id].UNIT === '100%') {
                            dpTypes[res.rows[i].id].UNIT = '%';
                        }
                    }
                }
            }
        }
    });
}

function sendInit() {
    try {
        if (rpcClient && (rpcClient.connected === undefined || rpcClient.connected)) {
            adapter.log.debug(adapter.config.type + 'rpc -> ' + adapter.config.homematicAddress + ':' + adapter.config.homematicPort + ' init ' + JSON.stringify([daemonURL, adapter.namespace]));
            rpcClient.methodCall('init', [daemonURL, adapter.namespace], function handleInit(err, data) {
                if (!err) {
                    if (adapter.config.daemon === 'CUxD') {
                        getCuxDevices(function handleCuxDevices(err2) {
                            if (!err2) {
                                updateConnection();
                            } else {
                                adapter.log.error('getCuxDevices error: ' + err2);
                            }
                        });
                    } else {
                        updateConnection();
                    }
                } else {
                    adapter.log.error('init error: ' + err);
                }
            });
        }
    } catch (err) {
        adapter.log.error('Init not possible, going to stop: ', err);
        adapter.stop();
    }
}

function sendPing() {
    if (rpcClient) {
        adapter.log.debug('Send PING...');
        try {
            rpcClient.methodCall('ping', [adapter.namespace], function (err, data) {
                if (!err) {
                    adapter.log.debug('PING ok');
                } else {
                    adapter.log.error('Ping error: ' + err);
                    if (connected) {
                        adapter.log.info('Disconnected');
                        connected = false;
                        adapter.setState('info.connection', false, true);
                        connect();
                    }
                }
            });
        } catch (err) {
            adapter.log.error('Cannot call ping [' + adapter.namespace + ']: ' + err);
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
}

function initRpcServer() {
    adapter.config.homematicPort = parseInt(adapter.config.homematicPort, 10);
    adapter.config.port          = parseInt(adapter.config.port, 10);

    //adapterPort was introduced in v1.0.1. If not set yet then try 2000
    var adapterPort = parseInt(adapter.config.port || adapter.config.homematicPort, 10) || 2000;
    adapter.getPort(adapterPort, function (port) {
        daemonURL = daemonProto + adapter.config.adapterAddress + ':' + port;
        rpcServer = rpc.createServer({host: adapter.config.adapterAddress, port: port});

        adapter.log.info(adapter.config.type + 'rpc server is trying to listen on ' + adapter.config.adapterAddress + ':' + port);
        adapter.log.info(adapter.config.type + 'rpc client is trying to connect to ' + adapter.config.homematicAddress + ':' + adapter.config.homematicPort + ' with ' + JSON.stringify([daemonURL, adapter.namespace]));

        connect(true);

        rpcServer.on('NotFound', function (method, params) {
            adapter.log.warn(adapter.config.type + 'rpc <- undefined method ' + method + ' ' + JSON.stringify(params).slice(0, 80));
        });

        rpcServer.on('system.multicall', function (method, params, callback) {
            updateConnection();
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
            updateConnection();
            try {
                callback(null, methods.event(err, params));
            } catch (err) {
                adapter.log.error('Cannot response on event:' + err);
            }
        });

        rpcServer.on('newDevices', function (err, params, callback) {

            var newDevices = params[1];

            adapter.log.info(adapter.config.type + 'rpc <- newDevices ' + newDevices.length);

            // for a HmIP-adapter we have to filter out the devices that
            // are already present if forceReinit is not set
            if (adapter.config.forceReInit === false && adapter.config.daemon === 'HMIP') {
                adapter.objects.getObjectView('hm-rpc', 'listDevices', {
                    startkey: 'hm-rpc.' + adapter.instance + '.',
                    endkey: 'hm-rpc.' + adapter.instance + '.\u9999'
                }, function (err, doc) {
                    if (doc && doc.rows) {
                        for (var i = 0; i < doc.rows.length; i++) {
                            if (doc.rows[i].id === adapter.namespace + '.updated') continue;

                            // lets get the device description
                            var val = doc.rows[i].value;

                            if (typeof val.ADDRESS === 'undefined') continue;

                            // lets find the current device in the newDevices array
                            // and if it doesn't exist we can delete it
                            var index = -1;
                            for (var j = 0; j < newDevices.length; j++) {
                                if (newDevices[j].ADDRESS === val.ADDRESS && newDevices[j].VERSION === val.VERSION) {
                                    index = j;
                                    break;
                                }
                            }

                            // if index is -1 than the newDevices doesn't have the
                            // device with address val.ADDRESS anymore, thus we can delete it
                            if (index === -1) {
                                if (val.ADDRESS) {
                                    if (val.ADDRESS.indexOf(':') !== -1) {
                                        var address = val.ADDRESS.replace(':', '.');
                                        var parts = address.split('.');
                                        adapter.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
                                        adapter.log.info('obsolete channel ' + address + ' ' + JSON.stringify(address) + ' deleted');
                                    } else {
                                        adapter.deleteDevice(val.ADDRESS);
                                        adapter.log.info('obsolete device ' + val.ADDRESS + ' deleted');
                                    }
                                }
                            } else {
                                // we can remove the item at index because it is already registered
                                // to ioBroker
                                newDevices.splice(index, 1);
                            }
                        }
                    }


                    adapter.log.info('new HmIP devices/channels after filter: ' + newDevices.length);
                    createDevices(newDevices, callback);
                });
            } else {
                createDevices(newDevices, callback);
            }
        });

        rpcServer.on('listDevices', function (err, params, callback) {
            adapter.log.info(adapter.config.type + 'rpc <- listDevices ' + JSON.stringify(params));
            adapter.objects.getObjectView('hm-rpc', 'listDevices', {startkey: 'hm-rpc.' + adapter.instance + '.', endkey: 'hm-rpc.' + adapter.instance + '.\u9999'}, function (err, doc) {
                var response = [];

                // we only fill the response if this isn't a force reinit and
                // if the adapter instance is not bothering with HmIP (which seems to work slightly different in terms of XMLRPC)
                if (!adapter.config.forceReInit && adapter.config.daemon !== 'HMIP' && doc && doc.rows) {
                    for (var i = 0; i < doc.rows.length; i++) {
                        if (doc.rows[i].id === adapter.namespace + '.updated') continue;
                        var val = doc.rows[i].value;

                        /*if (val.PARENT_TYPE) {
                         channelParams[val.ADDRESS] = val.PARENT_TYPE + '.' + val.TYPE + '.' + val.VERSION;
                         }*/
                        if (val.ADDRESS) response.push({ADDRESS: val.ADDRESS, VERSION: val.VERSION});
                    }
                }
                adapter.log.info(adapter.config.type + 'rpc -> ' + response.length + ' devices');
                //log.info(JSON.stringify(response));
                try {
                    for (var r = response.length - 1; r >= 0; r--) {
                        if (!response[r].ADDRESS) {
                            adapter.log.warn(adapter.config.type + 'rpc -> found empty entry at position ' + r + ' !');
                            response.splice(r, 1);
                        }
                    }

                    callback(null, response);
                } catch (err) {
                    adapter.log.error('Cannot response on listDevices:' + err);
                    require('fs').writeFileSync(__dirname + '/problem.json', JSON.stringify(response));
                }
            });
        });

        rpcServer.on('deleteDevices', function (err, params, callback) {
            adapter.log.info(adapter.config.type + 'rpc <- deleteDevices ' + params[1].length);
            for (var i = 0; i < params[1].length; i++) {
                if (params[1][i].indexOf(':') !== -1) {
                    params[1][i] = params[1][i].replace(':', '.');
                    adapter.log.info('channel ' + params[1][i] + ' ' + JSON.stringify(params[1][i]) + ' deleted');
                    var parts = params[1][i].split('.');
                    adapter.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
                } else {
                    adapter.log.info('device ' + params[1][i] + ' deleted');
                    adapter.deleteDevice(params[1][i]);
                }
            }
            try {
                callback(null, '');
            } catch (err) {
                adapter.log.error('Cannot response on deleteDevices:' + err);
            }
        });
    });
}

var methods = {

    event: function (err, params) {
        adapter.log.debug(adapter.config.type + 'rpc <- event ' + JSON.stringify(params));
        var val;
        // CUxD ignores all prefixes!!
        if (params[0] === 'CUxD' || params[0].indexOf(adapter.name) === -1) {
            params[0] = adapter.namespace;
        }
        var channel = params[1].replace(':', '.');
        var name = params[0] + '.' + channel + '.' + params[2];

        if (dpTypes[name]) {
            if (dpTypes[name].MIN !== undefined && dpTypes[name].UNIT === '%') {
                val = Math.round(((parseFloat(params[3]) - dpTypes[name].MIN) / (dpTypes[name].MAX - dpTypes[name].MIN)) * 10000) / 100;
            } else if (dpTypes[name].UNIT === '100%') {
                val = (params[3] * 100);
            } else {
                val = params[3];
            }
        } else {
            val = params[3];
        }
        adapter.log.debug(name + ' ==> UNIT: "' + (dpTypes[name] ? dpTypes[name].UNIT : 'none')  + '" (min: ' + (dpTypes[name] ? dpTypes[name].MIN : 'none')  + ', max: ' + (dpTypes[name] ? dpTypes[name].MAX : 'none') + ') From "' + params[3] + '" => "' + val + '"');

        adapter.setState(channel + '.' + params[2], {val: val, ack: true});
        return '';
    }

};

var queueValueParamsets = [];

function addParamsetObjects(channel, paramset, callback) {
    var channelChildren = [];
    var count = 0;
    for (var key in paramset) {
        if (!paramset.hasOwnProperty(key)) continue;
        channelChildren.push(channel._id + '.' + key);
        var commonType = {
            ACTION:  'boolean',
            BOOL:    'boolean',
            FLOAT:   'number',
            ENUM:    'number',
            INTEGER: 'number',
            STRING:  'string'
        };

        var obj = {
            type:   'state',
            common: {
                def:   paramset[key].DEFAULT,
                type:  commonType[paramset[key].TYPE] || paramset[key].TYPE || '',
                read:  !!(paramset[key].OPERATIONS & 1),
                write: !!(paramset[key].OPERATIONS & 2)
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
            if (obj.common.unit === '�C' || obj.common.unit === '&#176;C') {
                obj.common.unit = '°C';
            } else if (obj.common.unit === '�F' || obj.common.unit === '&#176;F') {
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

        // specify which value is LOCK
        if (obj.native.CONTROL === 'LOCK.STATE') {
            obj.native.LOCK_VALUE = false;
            obj.common.role = 'switch.lock';
        }

        if (typeof obj.common.role !== 'string' && typeof obj.common.role !== 'undefined') {
            throw 'typeof obj.common.role ' + typeof obj.common.role;
        }
        var dpID = adapter.namespace + '.' + channel._id + '.' + key;

        dpTypes[dpID] = {UNIT: paramset[key].UNIT, TYPE: paramset[key].TYPE, MIN: paramset[key].MIN, MAX: paramset[key].MAX};

        if (dpTypes[dpID].MIN !== undefined && typeof dpTypes[dpID].MIN === 'number') {
            dpTypes[dpID].MIN = parseFloat(dpTypes[dpID].MIN);
            dpTypes[dpID].MAX = parseFloat(dpTypes[dpID].MAX);
            // Humidity is from 0 to 99. It is wrong.
            if (dpTypes[dpID].MAX === 99) dpTypes[dpID].MAX = 100;
            if (dpTypes[dpID].UNIT === '100%') {
                dpTypes[dpID].UNIT = '%';
            }
        }

        if (key === 'LEVEL' && paramset.WORKING) {
            obj.common.workingID = 'WORKING';
        }
        count++;
        adapter.extendObject(channel._id + '.' + key, obj, function (err, res) {
            if (!err) {
                adapter.log.debug('object ' + res.id + ' extended');
            } else {
                adapter.log.error('object ' + (res ? res.id : '?') + ' extend ' + err);
            }

            if (!--count) callback();
        });
    }
    if (!count) callback();
}

function getValueParamsets() {
    if (queueValueParamsets.length === 0) {
        // Inform hm-rega about new devices
        adapter.setState('updated', true, false);
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
        addParamsetObjects(obj, metaValues[cid], function () {
            setTimeout(getValueParamsets, 0);
        });

    } else {

        var key = 'hm-rpc.meta.VALUES.' + cid;
        adapter.objects.getObject(key, function (err, res) {

            if (res && res.native) {
                adapter.log.debug(key + ' found');
                metaValues[cid] = res.native;
                addParamsetObjects(obj, res.native, function () {
                    setTimeout(getValueParamsets, 0);
                });
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
                        if (res) {
                            // if not empty
                            for (var attr in res) {
                                if (res.hasOwnProperty(attr)) {
                                    adapter.log.warn('Send this info to developer: _id: "' + key + '"');
                                    adapter.log.warn('Send this info to developer: ' + JSON.stringify(paramset));
                                    break;
                                }
                            }
                        }

                        adapter.objects.setObject(key, paramset, function () {
                            addParamsetObjects(obj, res, function () {
                                setTimeout(getValueParamsets, 0);
                            });
                        });
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
            if (!images[deviceArr[i].TYPE]) {
                adapter.log.warn('No image for "' + deviceArr[i].TYPE + '" found.');
            }

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

        var dpID = adapter.namespace + '.' + obj._id;
        dpTypes[dpID] = {UNIT: deviceArr[i].UNIT, TYPE: deviceArr[i].TYPE, MAX: deviceArr[i].MAX, MIN: deviceArr[i].MIN};
        if (dpTypes[dpID].MIN !== undefined && typeof dpTypes[dpID].MIN === 'number') {
            dpTypes[dpID].MIN = parseFloat(dpTypes[dpID].MIN);
            dpTypes[dpID].MAX = parseFloat(dpTypes[dpID].MAX);

            // Humidity is from 0 to 99. It is wrong.
            if (dpTypes[dpID].MAX === 99) dpTypes[dpID].MAX = 100;

            if (dpTypes[dpID].UNIT === '100%') {
                dpTypes[dpID].UNIT = '%';
            }
        }
        objs.push(obj);
    }

    function queue() {
        if (objs.length) {

            var obj = objs.pop();
            adapter.setObject(obj._id, obj, function (err, res) {
                if (!err) {
                    adapter.log.debug('object ' + res.id + ' created');
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
    if (rpcClient) {
        // request devices from CUxD
        try {
            rpcClient.methodCall('listDevices', [], function (err, newDevices) {

                adapter.log.info(adapter.config.type + 'rpc -> listDevices ' + newDevices.length);

                if (adapter.config.forceReInit === false) {
                    adapter.objects.getObjectView('hm-rpc', 'listDevices', {
                        startkey: 'hm-rpc.' + adapter.instance + '.',
                        endkey:   'hm-rpc.' + adapter.instance + '.\u9999'
                    }, function (err, doc) {
                        if (doc && doc.rows) {
                            for (var i = 0; i < doc.rows.length; i++) {
                                if (doc.rows[i].id === adapter.namespace + '.updated') continue;

                                // lets get the device description
                                var val = doc.rows[i].value;

                                if (typeof val.ADDRESS === 'undefined') continue;

                                // lets find the current device in the newDevices array
                                // and if it doesn't exist we can delete it
                                var index = -1;
                                for (var j = 0; j < newDevices.length; j++) {
                                    if (newDevices[j].ADDRESS === val.ADDRESS && newDevices[j].VERSION === val.VERSION) {
                                        index = j;
                                        break;
                                    }
                                }

                                // if index is -1 than the newDevices doesn't have the
                                // device with address val.ADDRESS anymore, thus we can delete it
                                if (index === -1) {
                                    if (val.ADDRESS) {
                                        if (val.ADDRESS.indexOf(':') !== -1) {
                                            var address = val.ADDRESS.replace(':', '.');
                                            var parts = address.split('.');
                                            adapter.deleteChannel(parts[parts.length - 2], parts[parts.length - 1]);
                                            adapter.log.info('obsolete channel ' + address + ' ' + JSON.stringify(address) + ' deleted');
                                        } else {
                                            adapter.deleteDevice(val.ADDRESS);
                                            adapter.log.info('obsolete device ' + val.ADDRESS + ' deleted');
                                        }
                                    }
                                } else {
                                    // we can remove the item at index because it is already registered
                                    // to ioBroker
                                    newDevices.splice(index, 1);
                                }
                            }
                        }

                        adapter.log.info('new CUxD devices/channels after filter: ' + newDevices.length);
                        createDevices(newDevices, callback);
                    });
                } else {
                    createDevices(newDevices, callback);
                }
            });
        } catch (err) {
            adapter.log.error('Cannot call listDevices: ' + err);
        }
    } else {
        callback && callback();
    }
}

function updateConnection() {
    lastEvent = (new Date()).getTime();

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
    if (!eventInterval) {
        adapter.log.debug('start ping interval');
        eventInterval = setInterval(keepAlive, adapter.config.checkInitInterval * 1000 / 2);
    }
}

function connect(isFirst) {
    if (!rpcClient) {
        rpcClient = rpc.createClient({
            host: adapter.config.homematicAddress,
            port: adapter.config.homematicPort,
            path: '/'
        });

        // if bin-rpc
        if (rpcClient.on) {
            rpcClient.on('connect', function (err) {
                sendInit();
            });

            rpcClient.on('error', function (err) {
                adapter.log.error('Socket error: ' + err);
            });

            rpcClient.on('close', function () {
                adapter.log.debug('Socket closed.');
                if (connected) {
                    adapter.log.info('Disconnected');
                    connected = false;
                    adapter.setState('info.connection', false, true);
                }

                if (eventInterval) {
                    adapter.log.debug('clear ping interval');
                    clearInterval(eventInterval);
                    eventInterval = null;
                }
                // clear queue
                if (rpcClient.queue) {
                    while (rpcClient.queue.length) {
                        rpcClient.queue.pop();
                    }
                    rpcClient.pending = false;
                }

                if (!connTimeout) {
                    connTimeout = setTimeout(connect, adapter.config.reconnectInterval * 1000);
                }
            });
        }
    }

    connTimeout = null;
    adapter.log.debug('Connect...');
    if (eventInterval) {
        adapter.log.debug('clear ping interval');
        clearInterval(eventInterval);
        eventInterval = null;
    }

    // if bin rpc
    if (rpcClient.connect) {
        if (!isFirst) rpcClient.connect();
    } else {
        if (isFirst) sendInit();

        if (!connInterval) {
            adapter.log.debug('start connecting interval');
            connInterval = setInterval(function () {
                sendInit();
            }, adapter.config.reconnectInterval * 1000);
        }
    }
}

function keepAlive() {
    if (connInterval) {
        clearInterval(connInterval);
        connInterval = null;
    }

    var _now = (new Date()).getTime();
    // Check last event time. If timeout => send init again
    if (!lastEvent || (_now - lastEvent) >= adapter.config.checkInitInterval * 1000) {
        connect();
    } else {
        // Send every half interval ping to CCU
        sendPing();
    }
}
