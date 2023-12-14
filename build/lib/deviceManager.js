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
exports.dmHmRpc = void 0;
const dm_utils_1 = require("@iobroker/dm-utils");
const type_detector_1 = __importStar(require("@iobroker/type-detector"));
class dmHmRpc extends dm_utils_1.DeviceManagement {
    constructor(adapter) {
        super(adapter);
        this.typeDetector = new type_detector_1.default();
    }
    async listDevices() {
        const devices = await this.adapter.getDevicesAsync();
        const arrDevices = [];
        for (const i in devices) {
            const connected = await this.adapter.getStateAsync(`${devices[i]._id}.0.UNREACH`);
            const rssi = await this.adapter.getStateAsync(`${devices[i]._id}.0.RSSI_DEVICE`);
            const lowBat = await this.adapter.getStateAsync(`${devices[i]._id}.0.LOWBAT`);
            const sabotage = await this.adapter.getStateAsync(`${devices[i]._id}.0.SABOTAGE`);
            const status = {
                connection: connected ? (connected.val ? 'disconnected' : 'connected') : 'connected',
                rssi: rssi ? parseFloat((rssi.val || '0').toString()) : undefined,
                battery: (lowBat === null || lowBat === void 0 ? void 0 : lowBat.val) ? !lowBat.val : undefined,
                warning: (sabotage === null || sabotage === void 0 ? void 0 : sabotage.val) ? 'Sabotage' : undefined
            };
            let hasDetails = false;
            if (devices[i].native.AVAILABLE_FIRMWARE || devices[i].native.FIRMWARE) {
                hasDetails = true;
            }
            const res = {
                id: devices[i]._id,
                name: devices[i].common.name,
                icon: devices[i].common.icon ? `../../adapter/hm-rpc${devices[i].common.icon}` : undefined,
                manufacturer: 'EQ-3 AG',
                model: devices[i].native.TYPE ? devices[i].native.TYPE : null,
                status: status,
                hasDetails: hasDetails,
                actions: [
                    {
                        id: 'rename',
                        icon: 'fa-solid fa-pen',
                        description: {
                            en: 'Rename this device',
                            de: 'Gerät umbenennen',
                            ru: 'Переименовать это устройство',
                            pt: 'Renomear este dispositivo',
                            nl: 'Hernoem dit apparaat',
                            fr: 'Renommer cet appareil',
                            it: 'Rinomina questo dispositivo',
                            es: 'Renombrar este dispositivo',
                            pl: 'Zmień nazwę tego urządzenia',
                            'zh-cn': '重命名此设备',
                            // @ts-expect-error
                            uk: 'Перейменуйте цей пристрій'
                        },
                        handler: this.handleRenameDevice.bind(this)
                    }
                ],
                controls: await this.getControls(devices[i])
            };
            arrDevices.push(res);
        }
        return arrDevices;
    }
    async getControls(device) {
        // analyse channels
        const channels = await this.adapter.getChannelsOfAsync(device._id);
        // for every channel
        const controls = [];
        for (let c = 0; c < channels.length; c++) {
            const channel = channels[c];
            if (!channel || !channel._id || channel._id.endsWith('.0')) {
                // skip information channel
                continue;
            }
            const parts = channel._id.split('.');
            // get states of a channel
            const states = await this.adapter.getStatesOfAsync(parts[2], parts[3]);
            const objects = {};
            const keys = [];
            states.forEach(state => {
                objects[state._id] = state;
                keys.push(state._id);
            });
            objects[channel._id] = channel;
            const options = {
                _keysOptional: keys,
                _usedIdsOptional: [],
                objects,
                id: channel._id
            };
            const tdControls = this.typeDetector.detect(options);
            if (tdControls) {
                tdControls.forEach(tdControl => {
                    for (let i = tdControl.states.length - 1; i >= 0; i--) {
                        if (!tdControl.states[i].id) {
                            tdControl.states.splice(i, 1);
                        }
                    }
                    const result = this.typedControl2DeviceManager(tdControl, objects);
                    if (result && result.length) {
                        result.forEach(control => controls.push(control));
                    }
                });
            }
        }
        return controls.length ? controls : undefined;
    }
    typedControl2DeviceManager(tdControl, objects) {
        const parts = tdControl.states[0].id.split('.');
        if (tdControl.type === type_detector_1.Types.button) {
            const control = {
                id: `${parts[3]}.${parts[4]}`,
                type: 'button',
                stateId: tdControl.states[0].id,
                label: tdControl.states[0].name,
                handler: async (deviceId, actionId, state) => {
                    await this.adapter.setForeignStateAsync(actionId, state, false);
                    const currentState = await this.adapter.getStateAsync(`${deviceId}.${actionId}`);
                    if (currentState) {
                        return currentState;
                    }
                    return {
                        error: {
                            message: 'Can not get current state',
                            code: 305
                        }
                    };
                }
            };
            return [control];
        }
        if (tdControl.type === type_detector_1.Types.lock) {
            const controls = [];
            tdControl.states.forEach(state => {
                var _a, _b;
                if (objects[state.id] && objects[state.id].common) {
                    if ((_a = objects[state.id].common.role) === null || _a === void 0 ? void 0 : _a.includes('switch')) {
                        controls.push({
                            id: state.id,
                            type: 'switch',
                            stateId: state.id,
                            label: objects[state.id].native.CONTROL || state.id.split('.').pop() || state.name,
                            getStateHandler: async (
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            deviceId, actionId) => {
                                const currentState = await this.adapter.getForeignStateAsync(actionId);
                                if (currentState) {
                                    return currentState;
                                }
                                return {
                                    error: {
                                        message: 'Can not get current state',
                                        code: 305
                                    }
                                };
                            },
                            handler: async (
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            deviceId, actionId, state) => {
                                console.log(state);
                                await this.adapter.setForeignStateAsync(actionId, state, false);
                                const currentState = await this.adapter.getStateAsync(actionId);
                                if (currentState) {
                                    return currentState;
                                }
                                return {
                                    error: {
                                        message: 'Can not get current state',
                                        code: 305
                                    }
                                };
                            }
                        });
                    }
                    else if ((_b = objects[state.id].common.role) === null || _b === void 0 ? void 0 : _b.includes('button')) {
                        controls.push({
                            id: state.id,
                            type: 'button',
                            stateId: state.id,
                            label: objects[state.id].native.CONTROL || state.id.split('.').pop() || state.name,
                            handler: async (deviceId, actionId, state) => {
                                console.log(state);
                                await this.adapter.setForeignStateAsync(actionId, true, false);
                                const currentState = await this.adapter.getStateAsync(`${deviceId}.${actionId}`);
                                if (currentState) {
                                    return currentState;
                                }
                                return {
                                    error: {
                                        message: 'Can not get current state',
                                        code: 305
                                    }
                                };
                            }
                        });
                    }
                }
            });
            return controls;
        }
    }
    async getDeviceDetails(id) {
        const devices = await this.adapter.getDevicesAsync();
        const device = devices.find(d => d._id === id);
        if (!device) {
            return { error: 'Device not found' };
        }
        const data = {
            id: device._id,
            schema: {
                type: 'panel',
                items: {}
            }
        };
        if (device.native.FIRMWARE) {
            data.schema.items.firmwareLabel = {
                type: 'staticText',
                text: `Installed firmware:`,
                style: { fontWeight: 'bold' },
                newLine: false
            };
            data.schema.items.firmware = {
                type: 'staticText',
                text: `${device.native.FIRMWARE}`,
                newLine: false
            };
        }
        if (device.native.AVAILABLE_FIRMWARE) {
            data.schema.items.labelAvailableFirmware = {
                type: 'staticText',
                text: `Available firmware:`,
                style: { fontWeight: 'bold' },
                newLine: true
            };
            data.schema.items.availableFirmware = {
                type: 'staticText',
                text: `${device.native.AVAILABLE_FIRMWARE}`,
                newLine: false
            };
        }
        return data;
    }
    async handleRenameDevice(id, context) {
        const result = await context.showForm({
            type: 'panel',
            items: {
                newName: {
                    type: 'text',
                    trim: false,
                    placeholder: ''
                }
            }
        }, {
            data: {
                newName: ''
            },
            title: {
                en: 'Enter new name',
                de: 'Neuen Namen eingeben',
                ru: 'Введите новое имя',
                pt: 'Digite um novo nome',
                nl: 'Voer een nieuwe naam in',
                fr: 'Entrez un nouveau nom',
                it: 'Inserisci un nuovo nome',
                es: 'Ingrese un nuevo nombre',
                pl: 'Wpisz nowe imię',
                'zh-cn': '输入新名称',
                // @ts-expect-error
                uk: "Введіть нове ім'я"
            }
        });
        if ((result === null || result === void 0 ? void 0 : result.newName) === undefined || (result === null || result === void 0 ? void 0 : result.newName) === '') {
            return { refresh: false };
        }
        const obj = {
            common: {
                name: result.newName
            }
        };
        const res = await this.adapter.extendObjectAsync(id, obj);
        if (res === null) {
            this.adapter.log.warn(`Can not rename device ${id}: ${JSON.stringify(res)}`);
            return { refresh: false };
        }
        return { refresh: true };
    }
}
exports.dmHmRpc = dmHmRpc;
//# sourceMappingURL=deviceManager.js.map