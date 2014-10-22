var adapter = require(__dirname + '/../../lib/adapter.js')({

    name:                   'hm-rpc',

    ready: function () {
        adapter.subscribeStates('*');
        main();
    },
    stateChange: function (id, state) {
        if (state.ack !== true) {
            var tmp = id.split('.');
            var val;
            adapter.log.debug(adapter.config.type + 'rpc -> setValue ' + JSON.stringify([tmp[2], tmp[3], state.val]));

            if (dpTypes[id] && dpTypes[id].UNIT === '100%') {
                state.val = state.val / 100;
            }
            var type = (dpTypes[id] ? dpTypes[id].TYPE : undefined);
            if (!dpTypes[id]) {
                adapter.log.error(adapter.config.type + 'rpc -> setValue: no dpType for ' + id + '!');
                return;
            }

            switch (dpTypes[id].TYPE) {
                case 'BOOL':
                    val = !!state.val;
                    break;
                case 'FLOAT':
                    val = {explicitDouble: state.val};
                    break;
                default:
                    val = state.val;
            }
            adapter.log.info('setValue ' + JSON.stringify([tmp[2], tmp[3], val]) + ' ' + type);
            rpcClient.methodCall('setValue', [tmp[2], tmp[3], val], function (err, data) {
                if (err) {
                    adapter.log.error(adapter.config.type + 'rpc -> setValue ' + JSON.stringify([tmp[2], tmp[3], state.val]) + ' ' + type);
                    adapter.log.error(err);
                }
            });
        }
    },
    unload: function (callback) {
        try {
            if (adapter.config.init) {
                adapter.config.init = false;
                var protocol;
                if (adapter.config.type === 'bin') {
                    protocol = 'xmlrpc_bin://';
                } else {
                    protocol = 'http://';
                }

                adapter.log.info(adapter.config.type + "rpc -> " + adapter.config.homematicAddress + ':' + adapter.config.homematicPort + ' init ' + JSON.stringify([protocol + adapter.config.adapterAddress + ':' + adapter.config.homematicPort, '']));
                rpcClient.methodCall('init', [protocol + adapter.config.adapterAddress + ':' + adapter.config.homematicPort, ''], function (err, data) {
                    adapter.states.setState('system.adapter.' + adapter.namespace + '.connected', {val: false});
                    callback();
                });
            } else {
                callback();
            }
        } catch (e) {
            adapter.log.error(e);
            callback();
        }
    },
    install: function (callback) {
        var design = {
            "_id": "_design/hm-rpc",
            "language": "javascript",
            "views": {
                "listDevices": {
                    "map": "function (doc) {\n  if (doc._id.match(/^hm-rpc\\.[0-9]+\\.\\*?[A-Za-z0-9_-]+(:[0-9]+)?$/)) {\n   emit(doc._id, {ADDRESS:doc.native.ADDRESS,VERSION:doc.native.VERSION,PARENT_TYPE:doc.native.PARENT_TYPE,TYPE:doc.native.TYPE});\n  }\n}"
                },
                "paramsetDescription": {
                    "map": "function (doc) {\n  if (doc._id.match(/^hm-rpc\\.meta/) && doc.meta.type === 'paramsetDescription') {\n   emit(doc._id, doc);\n  }\n}"
                }
            }
        };
        adapter.objects.setObject(design._id, design, function () {
            adapter.log.info('object _design/hm-rpc created');
            if (typeof callback === 'function') callback();
        });
    }
});

var rpc;
var rpcClient;
var rpcClientPending;

var rpcServer;
var rpcServerStarted;

var connected;

var metaValues =    {};
var metaRoles =     {};
var channelParams = {};
var dpTypes =       {};


var xmlrpc = require('homematic-xmlrpc');
var binrpc = require('binrpc');

function main() {
    if (adapter.config.type === 'bin') {
        rpc = binrpc;
    } else {
        rpc = xmlrpc;
    }

    rpcClient = rpc.createClient({
        host: adapter.config.homematicAddress,
        port: adapter.config.homematicPort,
        path: '/'
    });

    // Load VALUE paramsetDescriptions (needed to create state objects)
    adapter.objects.getObjectView('hm-rpc', 'paramsetDescription', {startkey: 'hm-rpc.meta.VALUES', endkey: 'hm-rpc.meta.VALUES.\u9999'}, function (err, doc) {
        // Todo Handle Errors
        var response = [];
        for (var i = 0; i < doc.rows.length; i++) {
            metaValues[doc.rows[i].id.slice(19)] = doc.rows[i].value.native;
        }
        // Load common.role assignments
        adapter.objects.getObject('hm-rpc.meta.roles', function (err, res) {
            // Todo Handle Errors
            metaRoles = res.native;

            // Start Adapter
            if (adapter.config.init) {
                if (!rpcServerStarted) initRpcServer();
            }

        });
    });

    adapter.objects.getObjectView('system', 'state', {startkey: 'hm-rpc.' + adapter.instance, endkey: 'hm-rpc.' + adapter.instance + '\u9999'}, function (err, res) {
        if (!err && res.rows) {
            for (var i = 0; i < res.rows.length; i++) {
                dpTypes[res.rows[i].id] = {UNIT: res.rows[i].value.native.UNIT, TYPE: res.rows[i].value.native.TYPE};
            }
        }
    });

}

function initRpcServer() {
    adapter.getPort(2000, function (port) {
        rpcServerStarted = true;
        var protocol;
        if (adapter.config.type === 'bin') {
            protocol = 'xmlrpc_bin://';
            rpcServer = binrpc.createServer({host: adapter.config.adapterAddress, port: port});
        } else {
            adapter.config.type = 'xml';
            protocol = 'http://';
            rpcServer = xmlrpc.createServer({host: adapter.config.adapterAddress, port: port});
        }

        adapter.log.info(adapter.config.type + 'rpc server listening on ' + adapter.config.adapterAddress + ':' + port);

        adapter.log.info(adapter.config.type + 'rpc -> ' + adapter.config.homematicAddress + ':' + adapter.config.homematicPort + ' init ' + JSON.stringify([protocol + adapter.config.adapterAddress + ':' + port, adapter.namespace]));

        rpcClient.methodCall('init', [protocol + adapter.config.adapterAddress + ':' + port, adapter.namespace], function (err, data) {
            if (!err) {
                if (adapter.config.daemon === 'CUxD') {
                    getCuxDevices(function (err2) {
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

        rpcServer.on('NotFound', function (method, params) {
            adapter.log.warn(type + 'rpc <- undefined method ' + method + ' ' + JSON.stringify(params).slice(0, 80));
        });

        rpcServer.on('system.multicall', function (method, params, callback) {
            var response = [];
            for (var i = 0; i < params[0].length; i++) {
                if (methods[params[0][i].methodName]) {
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
                for (var i = 0; i < doc.rows.length; i++) {
                    var val = doc.rows[i].value;
                    if (val.PARENT_TYPE) {
                        var cid = val.PARENT_TYPE + '.' + val.TYPE + '.' + val.VERSION;
                        channelParams[val.ADDRESS] = cid;
                    }
                    response.push({ADDRESS: val.ADDRESS, VERSION: val.VERSION});
                }
                adapter.log.info(adapter.config.type + 'rpc -> ' + doc.rows.length + ' devices');
                //log.info(JSON.stringify(response));
                callback(null, response);
            });
        });

        rpcServer.on('deleteDevices', function (err, params, callback) {
            adapter.log.info(adapter.config.type + 'rpc <- deleteDevices ' + params[1].length);
            for (var i = 0; i < params[1].length; i++) {
                adapter.log.info('object ' + params[1][i].ADDRESS + ' deleted');
                adapter.delObject(params[1][i]);
            }
            callback(null, '');
        });
    });
}

var methods = {

    event: function (err, params) {
        adapter.log.debug(adapter.config.type + 'rpc <- event ' + JSON.stringify(params));
        var val;
        if (dpTypes['hm-rpc.' + adapter.instance + '.' + params[1] + '.' + params[2]] && dpTypes['hm-rpc.' + adapter.instance + '.' + params[1] + '.' + params[2]].UNIT === '100%') {
            val = (params[3] * 100);
        } else {
            val = params[3];
        }

        adapter.setState(params[1] + '.' + params[2], {val: val, ack: true});
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
            'ACTION':       'boolean',
            'BOOL':         'boolean',
            'FLOAT':        'number',
            'ENUM':         'number',
            'INTEGER':      'number',
            'STRING':       'string'
        };

        var obj = {
            type: 'state',
            parent: channel._id,

            common: {
                def:    paramset[key].DEFAULT,
                type:   commonType[paramset[key].TYPE] || paramset[key].TYPE,
                read:   (paramset[key].OPERATIONS & 1 ? true : false),
                write:  (paramset[key].OPERATIONS & 2 ? true : false)
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



        adapter.extendObject(channel.native.ADDRESS + '.' + key, obj, _logResult);
    }
    adapter.extendObject(channel.native.ADDRESS, {children: channelChildren}, function (err, res, id) {
        if (!err) {
            adapter.log.info('object ' + res.id + ' extended');
        } else {
            adapter.log.error('object ' + id + ' extend: ' + err);
        }
    });

}

function getValueParamsets() {
    if (queueValueParamsets.length === 0) {
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
            }

        });
    }
}

function createDevices(deviceArr, callback) {
    adapter.log.debug(JSON.stringify(deviceArr));

    var objs = [];

    for (var i = 0; i < deviceArr.length; i++) {
        var type;
        var role;

        var children = [];

        if (deviceArr[i].PARENT) {
            type = 'channel';
            role = metaRoles.chTYPE && metaRoles.chTYPE[deviceArr[i].TYPE] ? metaRoles.chTYPE && metaRoles.chTYPE[deviceArr[i].TYPE] : undefined;
        } else {
            type = 'device';
            for (var j = 0; j < deviceArr[i].CHILDREN.length; j++) {
                children.push(adapter.namespace + '.' + deviceArr[i].CHILDREN[j]);
            }
        }

        var obj = {
            _id: deviceArr[i].ADDRESS,
            type: type,
            parent: (deviceArr[i].PARENT === '' ? null : adapter.namespace + '.' + deviceArr[i].PARENT),
            children: children,
            common: {
                // FIXME strange bug - LEVEL and WORKING datapoint of Dimmers have name of first dimmer device?!?
                name: deviceArr[i].ADDRESS,
                role: role
            },
            native: deviceArr[i]
        };
        dpTypes[deviceArr[i].ADDRESS] = {UNIT: deviceArr[i].UNIT, TYPE: deviceArr[i].TYPE};
        //adapter.log.debug(JSON.stringify(obj));
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
                queue();
            });

            if (obj.type === 'channel') {
                var cid = obj.PARENT_TYPE + '.' + obj.TYPE + '.' + obj.VERSION;
                channelParams[obj._id] = cid;
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
    var devices = [];

    // request devices from CUxD
    rpcClient.methodCall('listDevices', [], function (err, data) {
        adapter.log.info(adapter.config.type + 'rpc -> listDevices ' + data.length);
        // Todo remove device ids from array
        createDevices(data, callback);
    });

    // Todo delete all in array remaining devices
}

var connectionTimer;

function connection() {



    /* Todo Ping/Pong or eventTrigger
    connected = true;
    if (connectionTimer) clearTimeout(connectionTimer);
    connectionTimer = setTimeout(function () {
        connection = false;

    }, 300000);*/




    adapter.states.setState('system.adapter.' + adapter.namespace + '.connected', {val: true, expire: 300});
}

