var adapter = require(__dirname + '/../../lib/adapter.js')({

    name:                   'hm-rpc',
    version:                '0.1.5',

    ready: function () {
        adapter.subscribeStates('*');
        main();
    },
    stateChange: function (id, state) {
        if (state.ack !== true) {
            var tmp = id.split('.');
            adapter.log.debug(adapter.config.type + 'rpc -> setValue ' + JSON.stringify([tmp[2], tmp[3], state.val]));
            if (channelParams[tmp[2]] && metaValues[channelParams[tmp[2]]] && metaValues[channelParams[tmp[2]]][tmp[3]]) {
                if (!(metaValues[channelParams[tmp[2]]][tmp[3]].OPERATIONS & 2)) {
                    adapter.log.warn(adapter.config.type + 'rpc -> setValue ' + JSON.stringify([tmp[2], tmp[3], state.val]) + ' is not writeable');
                }
                var type = metaValues[channelParams[tmp[2]]][tmp[3]].TYPE;
            } else {
                var type = 'UNKNOWN';
            }
            switch (type) {
                case 'BOOL':
                    var val = state.val ? true : false;
                    break;
                case 'FLOAT':
                    var val = {explicitDouble: state.val};
                    break;
                default:
                    var val = state.val;
            }
            rpcClient.methodCall('setValue', [tmp[2], tmp[3], val], function (err, data) {
                if (err) {
                    adapter.log.error(adapter.config.type + 'rpc -> setValue ' + JSON.stringify([tmp[2], tmp[3], state.val]));
                    adapter.log.error(err);
                }
            });
        }
    },
    //  - callback must be called in any case!
    unload: function (callback) {
        try {
            if (adapter.config.init) {
                adapter.config.init = false;
                log.info(adapter.config.type + "rpc -> " + adapter.config.ip + ':' + adapter.config.port + ' init ' + JSON.stringify(['http://' + adapter.host + ':' + adapter.config.port, '']));
                rpcClient.methodCall('init', ['http://' + adapter.host + ':' + adapter.config.port, ''], function (err, data) {
                    adapter.states.setState('system.adapter.' + adapter.namespace + '.connected', {val: false});
                    callback();
                });
            } else {
                callback();
            }
        } catch (e) {
            callback();
        }
    },
    install: function (callback) {
        var design = {
            "_id": "_design/hm-rpc",
            "language": "javascript",
            "views": {
                "listDevices": {
                    "map": "function(doc) {\n  if (doc._id.match(/^hm-rpc\\.[0-9]+\\.\\*?[A-Za-z0-9_-]+(:[0-9]+)?$/)) {\n   emit(doc._id, {ADDRESS:doc.native.ADDRESS,VERSION:doc.native.VERSION,PARENT_TYPE:doc.native.PARENT_TYPE,TYPE:doc.native.TYPE});\n  }\n}"
                },
                "paramsetDescription": {
                    "map": "function(doc) {\n  if (doc._id.match(/^hm-rpc\\.meta/) && doc.meta.type === 'paramsetDescription') {\n   emit(doc._id, doc);\n  }\n}"
                }
            }
        };
        adapter.objects.setObject(design._id, design, function () {
            log.info('object _design/hm-rpc created');
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


var xmlrpc = require('xmlrpc');
var iconv = require('iconv-lite');

function main() {
    rpcClient = xmlrpc.createClient({
        host: adapter.config.ip,
        port: adapter.config.port,
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
                if (!rpcServerStarted) initRpcServer(adapter.config.type);
            }

        });
    });

}

function initRpcServer(type) {
    adapter.getPort(2000, function (port) {
        rpcServerStarted = true;
        var protocol = 'http://';
        if (type === 'bin') {
            var protocol = 'xmlrpc_bin://';
            rpcServer = binrpc.createServer({ host: adapter.host, port: port });
        } else {
            rpcServer = xmlrpc.createServer({ host: adapter.host, port: port });
        }

        log.info(type + 'rpc server listening on ' + adapter.host + ':' + port);

        log.info(type + 'rpc -> ' + adapter.config.ip + ':' + adapter.config.port + ' init ' + JSON.stringify([protocol + adapter.host + ':' + port, adapter.namespace]));

        rpcClient.methodCall('init', [protocol + adapter.host + ':' + port, adapter.namespace], function (err, data) {
            if (!err) {
                connection();
            }
        });

        rpcServer.on('NotFound', function(method, params) {
            adapter.log.warn(type + 'rpc <- undefined method ' + method + ' ' + JSON.stringify(params).slice(0, 80));
        });

        rpcServer.on('system.multicall', function(method, params, callback) {
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

        rpcServer.on('system.listMethods', function(err, params, callback) {
            adapter.log.info(adapter.config.type + 'rpc <- system.listMethods ' + JSON.stringify(params));
            callback(null, ['event', 'deleteDevices', 'listDevices', 'newDevices', 'system.listMethods', 'system.multicall']);
        });

        rpcServer.on('event', function(err, params, callback) {
            connection();
            callback(null, methods.event(err, params));
        });

        rpcServer.on('newDevices', function(err, params, callback) {
            var deviceArr = params[1];
            adapter.log.info(adapter.config.type + 'rpc <- newDevices ' + deviceArr.length);

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
                    type: type,
                    parent: (deviceArr[i].PARENT === '' ? null : adapter.namespace + '.' + deviceArr[i].PARENT),
                    children: children,
                    common: {},
                    native: deviceArr[i]
                };



                adapter.setObject(deviceArr[i].ADDRESS, obj);
                adapter.log.info('object ' + deviceArr[i].ADDRESS + ' created');

                if (obj.type === 'channel') {
                    var cid = obj.PARENT_TYPE + '.' + obj.TYPE + '.' + obj.VERSION;
                    channelParams[deviceArr[i].ADDRESS] = cid;
                    if (metaValues[cid]) {

                    } else {
                        queueValueParamsets.push(obj);
                    }
                }
            }
            getValueParamsets();
            callback(null, '');
        });

        rpcServer.on('listDevices', function(err, params, callback) {
            log.info(adapter.config.type + 'rpc <- listDevices ' + JSON.stringify(params));
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
                log.info(adapter.config.type + 'rpc -> ' + doc.rows.length + ' devices');
                callback(null, response);
            });
        });

        rpcServer.on('deleteDevices', function(err, params, callback) {
            log.info(adapter.config.type + 'rpc <- deleteDevices ' + params[1].length);
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
        log.debug(adapter.config.type + 'rpc <- event ' + JSON.stringify(params));
        adapter.setState(params[1]+'.'+params[2], {val: params[3], ack: true});
        return '';
    }

};

var queueValueParamsets = [];

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
                def: paramset[key].DEFAULT,
                type: commonType[paramset[key].TYPE] || paramset[key].TYPE,
                read:   (paramset[key].OPERATIONS & 1 ? true : false),
                write:  (paramset[key].OPERATIONS & 2 ? true : false)
            },
            native: paramset[key]
        };

        if (obj.common.type === 'number') {
            obj.common.min = paramset[key].MIN;
            obj.common.max = paramset[key].MAX;

            if (paramset[key].TYPE === 'ENUM') {
                obj.common.states = {};
                for (var i = 0; i < paramset[key].VALUE_LIST.length; i++) {
                    obj.common.states[i] = paramset[key].VALUE_LIST[i];
                }
            }

            if (paramset[key].SPECIAL) {
                if (!obj.common.states) obj.common.states = {};
                for (var i = 0; i < paramset[key].SPECIAL.length; i++) {
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
            obj.common.role = metaRoles.dpNAME[key];
        }


        if (paramset[key].OPERATIONS & 8) {
            obj.common.role = 'indicator.service'
        }

        adapter.log.info('object ' + channel.native.ADDRESS + '.' + key + ' created');
        adapter.setObject(channel.native.ADDRESS + '.' + key, obj, function () {

        });
    }
    adapter.extendObject(channel.native.ADDRESS, {children: channelChildren});
    adapter.log.info('object ' + channel.native.ADDRESS + ' extended');

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
                    setTimeout(getValueParamsets, 1000);
                    adapter.log.info('setObject ' + key);
                    adapter.objects.setObject(key, paramset);
                    addParamsetObjects(obj, res);
                });
            }

        });
    }
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

