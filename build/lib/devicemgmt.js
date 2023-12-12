"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dmHmRpc = void 0;
const dm_utils_1 = require("@iobroker/dm-utils");
class dmHmRpc extends dm_utils_1.DeviceManagement {
    getInstanceInfo() {
        const data = {
            ...super.getInstanceInfo(),
            apiVersion: 'v1',
            actions: [
                {
                    id: 'refresh',
                    icon: 'fas fa-redo-alt',
                    title: '',
                    description: {
                        en: 'Refresh device list',
                        de: 'Geräteliste aktualisieren',
                        ru: 'Обновить список устройств',
                        pt: 'Atualizar lista de dispositivos',
                        nl: 'Vernieuw apparaatlijst',
                        fr: 'Actualiser la liste des appareils',
                        it: 'Aggiorna elenco dispositivi',
                        es: 'Actualizar lista de dispositivos',
                        pl: 'Odśwież listę urządzeń',
                        'zh-cn': '刷新设备列表',
                        // @ts-ignore
                        uk: 'Оновити список пристроїв'
                    },
                    handler: this.handleRefresh.bind(this)
                }
            ],
        };
        return data;
    }
    async handleRefresh(context) {
        this.adapter.log.info('handleRefresh');
        return { refresh: true };
    }
    async listDevices() {
        const devices = await this.adapter.getDevicesAsync();
        const arrDevices = [];
        for (const i in devices) {
            const status = {};
            let hasDetails = false;
            if (devices[i].native.AVAILABLE_FIRMWARE || devices[i].native.FIRMWARE) {
                hasDetails = true;
            }
            const connected = await this.adapter.getStateAsync(`${devices[i]._id}.0.UNREACH`);
            if (connected !== null && connected !== undefined) {
                status.connection = connected.val ? 'disconnected' : 'connected';
            }
            const rssi = await this.adapter.getStateAsync(`${devices[i]._id}.0.RSSI_DEVICE`);
            if (rssi !== null && rssi !== undefined) {
                // @ts-ignore
                status.rssi = `${rssi.val} dBm`;
            }
            const lowbat = await this.adapter.getStateAsync(`${devices[i]._id}.0.LOWBAT`);
            if (lowbat !== null && lowbat !== undefined && (lowbat === null || lowbat === void 0 ? void 0 : lowbat.val) !== 0) {
                // @ts-ignore
                status.battery = !lowbat.val;
            }
            const res = {
                id: devices[i]._id,
                name: devices[i].common.name,
                icon: devices[i].common.icon ? `../../adapter/hm-rpc${devices[i].common.icon}` : null,
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
                            uk: 'Перейменуйте цей пристрій'
                        },
                        handler: this.handleRenameDevice.bind(this)
                    }
                ]
            };
            arrDevices.push(res);
        }
        // @ts-ignore
        return arrDevices;
    }
    // @ts-ignore
    async getDeviceDetails(id, context) {
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
            // @ts-ignore
            data.schema.items.firmwareLabel = {
                type: 'staticText',
                text: `Installed firmware:`,
                style: { fontWeight: 'bold' },
                newLine: false
            };
            // @ts-ignore
            data.schema.items.firmware = {
                type: 'staticText',
                text: `${device.native.FIRMWARE}`,
                newLine: false
            };
        }
        if (device.native.AVAILABLE_FIRMWARE) {
            // @ts-ignore
            data.schema.items.labelAvailableFirmware = {
                type: 'staticText',
                text: `Available firmware:`,
                style: { fontWeight: 'bold' },
                newLine: true
            };
            // @ts-ignore
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
                    placeholder: '',
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
                uk: 'Введіть нове ім\'я'
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
            //@ts-ignore
            this.adapter.log.warn(`Can not rename device ${context.id}: ${JSON.stringify(res)}`);
            return { refresh: false };
        }
        //@ts-ignore
        return { refresh: true };
    }
}
exports.dmHmRpc = dmHmRpc;
//# sourceMappingURL=devicemgmt.js.map