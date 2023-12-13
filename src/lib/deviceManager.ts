import {
    ActionContext,
    DeviceDetails,
    DeviceManagement,
    DeviceRefresh,
    DeviceStatus,
    MessageContext,
    ErrorResponse
} from '@iobroker/dm-utils';
import { DeviceInfo, InstanceDetails, DeviceControl } from '@iobroker/dm-utils/build/types/adapter';
import { ControlState } from '@iobroker/dm-utils/build/types/base';
import ChannelDetector, { DetectOptions, Types, PatternControl } from '@iobroker/type-detector';

import { HomematicRpc } from '../main';

export class dmHmRpc extends DeviceManagement<HomematicRpc> {
    private typeDetector: ChannelDetector;

    constructor(adapter: HomematicRpc) {
        super(adapter);
        this.typeDetector = new ChannelDetector();
    }

    protected async getInstanceInfo(): Promise<InstanceDetails> {
        const superDetails: InstanceDetails = await super.getInstanceInfo();

        return {
            ...superDetails,
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
                        // @ts-expect-error
                        uk: 'Оновити список пристроїв'
                    },
                    handler: this.handleRefresh.bind(this)
                }
            ]
        };
    }

    protected handleRefresh(context: object): Promise<{
        refresh: boolean;
    }> {
        this.adapter.log.info(`handleRefresh: ${JSON.stringify(context)}`);
        return Promise.resolve({ refresh: true });
    }

    protected async listDevices(): Promise<DeviceInfo[]> {
        const devices = await this.adapter.getDevicesAsync();
        const arrDevices: DeviceInfo[] = [];
        for (const i in devices) {
            const connected = await this.adapter.getStateAsync(`${devices[i]._id}.0.UNREACH`);
            const rssi = await this.adapter.getStateAsync(`${devices[i]._id}.0.RSSI_DEVICE`);
            const lowBat = await this.adapter.getStateAsync(`${devices[i]._id}.0.LOWBAT`);
            const sabotage = await this.adapter.getStateAsync(`${devices[i]._id}.0.SABOTAGE`);

            const status: DeviceStatus = {
                connection: connected ? (connected.val ? 'disconnected' : 'connected') : 'connected',
                rssi: rssi ? parseFloat((rssi.val || '0').toString()) : undefined,
                battery: lowBat?.val ? !lowBat.val : undefined,
                warning: sabotage?.val ? 'Sabotage' : undefined
            };

            let hasDetails = false;
            if (devices[i].native.AVAILABLE_FIRMWARE || devices[i].native.FIRMWARE) {
                hasDetails = true;
            }

            const res: DeviceInfo = {
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

    private async getControls(device: ioBroker.Object): Promise<DeviceControl[] | undefined> {
        // analyse channels
        const channels = await this.adapter.getChannelsOfAsync(device._id);
        // for every channel
        const controls: DeviceControl[] = [];
        for (let c = 0; c < channels.length; c++) {
            const channel = channels[c];
            if (!channel || !channel._id || channel._id.endsWith('.0')) {
                // skip information channel
                continue;
            }
            const parts = channel._id.split('.');
            // get states of a channel
            const states = await this.adapter.getStatesOfAsync(parts[2], parts[3]);
            const objects: Record<string, ioBroker.Object> = {};
            const keys: string[] = [];
            states.forEach(state => {
                objects[state._id] = state;
                keys.push(state._id);
            });
            objects[channel._id] = channel;

            const options: DetectOptions = {
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

    private typedControl2DeviceManager(
        tdControl: PatternControl,
        objects: Record<string, ioBroker.Object>
    ): DeviceControl[] | undefined {
        const parts = tdControl.states[0].id.split('.');

        if (tdControl.type === Types.button) {
            const control: DeviceControl = {
                id: `${parts[3]}.${parts[4]}`,
                type: 'button',
                stateId: tdControl.states[0].id,
                label: tdControl.states[0].name,
                handler: async (
                    deviceId: string,
                    actionId: string,
                    state: ControlState
                ): Promise<ErrorResponse | ioBroker.State> => {
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

        if (tdControl.type === Types.lock) {
            const controls: DeviceControl[] = [];
            tdControl.states.forEach(state => {
                if (state.name === 'SET') {
                    controls.push({
                        id: state.id,
                        type: 'switch',
                        stateId: state.id,
                        label: 'Open',
                        getStateHandler: async (
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            deviceId: string,
                            actionId: string
                        ): Promise<ioBroker.State | ErrorResponse> => {
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
                            deviceId: string,
                            actionId: string,
                            state: ControlState
                        ): Promise<ErrorResponse | ioBroker.State> => {
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
                } else if (state.name === 'OPEN') {
                    controls.push({
                        id: state.id,
                        type: 'button',
                        stateId: state.id,
                        label: 'OpenDoor',
                        handler: async (
                            deviceId: string,
                            actionId: string,
                            state: ControlState
                        ): Promise<ErrorResponse | ioBroker.State> => {
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
            });

            return controls;
        }
    }

    protected async getDeviceDetails(id: string): Promise<DeviceDetails | null | { error: string }> {
        const devices = await this.adapter.getDevicesAsync();
        const device = devices.find(d => d._id === id);
        if (!device) {
            return { error: 'Device not found' };
        }
        const data: DeviceDetails = {
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

    async handleRenameDevice(id: string, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        const result = await context.showForm(
            {
                type: 'panel',
                items: {
                    newName: {
                        type: 'text',
                        trim: false,
                        placeholder: ''
                    }
                }
            },
            {
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
            }
        );
        if (result?.newName === undefined || result?.newName === '') {
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
