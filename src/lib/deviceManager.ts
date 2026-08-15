import {
    type ActionContext,
    type DeviceDetails,
    DeviceManagement,
    type DeviceRefresh,
    type DeviceStatus,
    type ErrorResponse,
    type DeviceInfo,
    type DeviceControl,
    type DeviceLoadContext,
} from '@iobroker/dm-utils';
import type { ControlState, ChannelInfo } from '@iobroker/dm-utils/build/types/base';
import ChannelDetector, { type DetectOptions, type PatternControl } from '@iobroker/type-detector';

import type { HomematicRpc } from '../main';

function getText(text: ioBroker.StringOrTranslated, lang: ioBroker.Languages): string {
    if (typeof text === 'string') {
        return text;
    }
    if (text) {
        return text[lang] || text.en;
    }

    return '';
}

export class dmHmRpc extends DeviceManagement<HomematicRpc> {
    private typeDetector: ChannelDetector;
    private language: ioBroker.Languages = 'en';

    /**
     * The `icon` a device is listed with. `common.icon` is an inline
     * `data:image/svg+xml` URI (see `HomematicRpc.getIcon`), which the GUI hands
     * to `<Icon src>` unchanged, so the SVG's `currentColor` follows the theme.
     * Devices created before that change still carry an `/icons/…` path relative
     * to the adapter directory; keep resolving those until `migrateDeviceIcons`
     * has rewritten them.
     *
     * @param icon the device object's `common.icon`
     */
    private static deviceIcon(icon: string | undefined): string | undefined {
        if (!icon) {
            return undefined;
        }
        return icon.startsWith('data:') ? icon : `../../adapter/hm-rpc${icon}`;
    }

    constructor(adapter: HomematicRpc) {
        super(adapter);
        this.typeDetector = new ChannelDetector();
        void adapter
            .getForeignObjectAsync('system.config')
            .then(obj => {
                if (obj?.common?.language) {
                    this.language = obj.common.language;
                }
            })
            .catch(e => adapter.log.error(e));
    }

    protected async loadDevices(context: DeviceLoadContext<string>): Promise<void> {
        const devices = await this.adapter.getDevicesAsync();
        context.setTotalDevices(devices.length);
        for (const device of devices) {
            const connected = await this.adapter.getStateAsync(`${device._id}.0.UNREACH`);
            const rssi = await this.adapter.getStateAsync(`${device._id}.0.RSSI_DEVICE`);
            const lowBat = await this.adapter.getStateAsync(`${device._id}.0.LOWBAT`);
            const sabotage = await this.adapter.getStateAsync(`${device._id}.0.SABOTAGE`);

            const status: DeviceStatus = {
                connection: connected ? (connected.val ? 'disconnected' : 'connected') : 'connected',
                rssi: rssi ? parseFloat((rssi.val || '0').toString()) : undefined,
                battery: lowBat?.val ? !lowBat.val : undefined,
                warning: sabotage?.val ? 'Sabotage' : undefined,
            };

            let hasDetails = false;
            if (device.native.AVAILABLE_FIRMWARE || device.native.FIRMWARE) {
                hasDetails = true;
            }

            const res: DeviceInfo<string> = {
                id: device._id,
                name: device.common.name,
                icon: dmHmRpc.deviceIcon(device.common.icon),
                manufacturer: 'EQ-3 AG',
                model: device.native.TYPE ? device.native.TYPE : null,
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
                            uk: 'Перейменуйте цей пристрій',
                        },
                        handler: this.handleRenameDevice.bind(this),
                    },
                ],
                controls: await this.getControls(device),
            };
            context.addDevice(res);
        }
    }

    protected async listDevices(): Promise<DeviceInfo<string>[]> {
        const devices = await this.adapter.getDevicesAsync();
        const arrDevices: DeviceInfo<string>[] = [];
        for (const device of devices) {
            const connected = await this.adapter.getStateAsync(`${device._id}.0.UNREACH`);
            const rssi = await this.adapter.getStateAsync(`${device._id}.0.RSSI_DEVICE`);
            const lowBat = await this.adapter.getStateAsync(`${device._id}.0.LOWBAT`);
            const sabotage = await this.adapter.getStateAsync(`${device._id}.0.SABOTAGE`);

            const status: DeviceStatus = {
                connection: connected ? (connected.val ? 'disconnected' : 'connected') : 'connected',
                rssi: rssi ? parseFloat((rssi.val || '0').toString()) : undefined,
                battery: lowBat?.val ? !lowBat.val : undefined,
                warning: sabotage?.val ? 'Sabotage' : undefined,
            };

            let hasDetails = false;
            if (device.native.AVAILABLE_FIRMWARE || device.native.FIRMWARE) {
                hasDetails = true;
            }

            const res: DeviceInfo<string> = {
                id: device._id,
                name: device.common.name,
                icon: dmHmRpc.deviceIcon(device.common.icon),
                manufacturer: 'EQ-3 AG',
                model: device.native.TYPE ? device.native.TYPE : null,
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
                            uk: 'Перейменуйте цей пристрій',
                        },
                        handler: this.handleRenameDevice.bind(this),
                    },
                ],
                controls: await this.getControls(device),
            };

            arrDevices.push(res);
        }

        return arrDevices;
    }

    private async getControls(device: ioBroker.Object): Promise<DeviceControl<string>[] | undefined> {
        // analyse channels
        const channels = await this.adapter.getChannelsOfAsync(device._id);
        // for every channel
        const controls: DeviceControl<string>[] = [];
        if (channels.find(a => a._id.includes('hm-rpc.0.EEQ0043360'))) {
            console.log('aaa');
        }
        for (let c = 0; c < channels.length; c++) {
            const channel = channels[c];
            if (!channel?._id || channel._id.endsWith('.0')) {
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
                id: channel._id,
            };

            const tdControls = this.typeDetector.detect(options);
            if (tdControls?.length) {
                for (const tdControl of tdControls) {
                    for (let i = tdControl.states.length - 1; i >= 0; i--) {
                        // delete empty states
                        if (!tdControl.states[i].id) {
                            tdControl.states.splice(i, 1);
                        }
                    }
                    const result = this.typedControl2DeviceManager(tdControl, objects);
                    if (result?.length) {
                        result.forEach(control => controls.push(control));
                        break;
                    }
                }
            }
        }

        controls.sort((a, b) => {
            if (a.channel && b.channel) {
                const aName = getText(a.channel.name, this.language);
                const bName = getText(b.channel.name, this.language);

                if (aName === bName || (a.channel.order === b.channel.order && a.channel.order !== undefined)) {
                    return a.id.localeCompare(b.id);
                }
                if (a.channel.order !== undefined && b.channel.order !== undefined) {
                    return a.channel.order - b.channel.order;
                }
                return bName.localeCompare(bName);
            }

            return a.id.localeCompare(b.id);
        });

        return controls.length ? controls : undefined;
    }

    private typedControl2DeviceManager(
        tdControl: PatternControl,
        objects: Record<string, ioBroker.Object>,
    ): DeviceControl<string>[] | undefined {
        const controls: DeviceControl<string>[] = [];

        tdControl.states.forEach(state => {
            const parts = state.id.split('.');
            const stateName: string = (
                parts.pop() ||
                objects[state.id].native.CONTROL ||
                state.id.split('.').pop() ||
                state.name ||
                ''
            ).replaceAll('_', ' ');

            const channelId = parts.join('.');
            const channel: ChannelInfo = {
                name: objects[channelId].common.name || objects[channelId].native.TYPE || parts[parts.length - 1],
                description: objects[channelId].native.TYPE,
                order: parseInt(parts[parts.length - 1], 10),
            };

            if (objects[state.id] && objects[state.id].common) {
                if (
                    objects[state.id].common.write !== false ||
                    objects[state.id].common.role?.includes('button') ||
                    stateName?.startsWith('PRESS ')
                ) {
                    if (objects[state.id].common.states) {
                        const options: { label: ioBroker.StringOrTranslated; value: ControlState }[] = [];
                        if (Array.isArray(objects[state.id].common.states)) {
                            objects[state.id].common.states.forEach((value: number) => {
                                options.push({
                                    label: value.toString(),
                                    value,
                                });
                            });
                        } else {
                            Object.keys(objects[state.id].common.states).forEach(value => {
                                options.push({
                                    label: objects[state.id].common.states[value],
                                    value,
                                });
                            });
                        }

                        controls.push({
                            id: state.id,
                            type: 'select',
                            options,
                            channel,
                            description: objects[state.id].common.desc,
                            stateId: state.id,
                            label: stateName, // objects[state.id].native.CONTROL || state.id.split('.').pop() || state.name,
                            getStateHandler: async (
                                _deviceId: string,
                                actionId: string,
                            ): Promise<ioBroker.State | ErrorResponse> => {
                                const currentState = await this.adapter.getForeignStateAsync(actionId);
                                if (currentState) {
                                    return currentState;
                                }
                                return {
                                    error: {
                                        message: 'Can not get current state',
                                        code: 305,
                                    },
                                };
                            },
                            handler: async (
                                _deviceId: string,
                                actionId: string,
                                state: ControlState,
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
                                        code: 305,
                                    },
                                };
                            },
                        });
                    } else if (objects[state.id].common.type === 'number') {
                        const control: DeviceControl<string> = {
                            id: state.id,
                            stateId: state.id,
                            description: objects[state.id].common.desc,
                            type: 'number',
                            channel,
                            unit: objects[state.id].common.unit,
                            label: stateName, // objects[state.id].native.CONTROL || state.id.split('.').pop() || state.name,
                            min: objects[state.id].common.min,
                            max: objects[state.id].common.max,
                            getStateHandler: async (
                                _deviceId: string,
                                actionId: string,
                            ): Promise<ioBroker.State | ErrorResponse> => {
                                const currentState = await this.adapter.getForeignStateAsync(actionId);
                                if (currentState) {
                                    return currentState;
                                }
                                return {
                                    error: {
                                        message: 'Can not get current state',
                                        code: 305,
                                    },
                                };
                            },
                            handler: async (
                                _deviceId: string,
                                actionId: string,
                                state: ControlState,
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
                                        code: 305,
                                    },
                                };
                            },
                        };

                        if (objects[state.id].common.unit === '%') {
                            control.type = 'slider';
                            control.min = 0;
                            control.max = 100;
                        } else if (
                            objects[state.id].common.min === undefined &&
                            objects[state.id].common.max === undefined
                        ) {
                            control.type = 'number';
                        } else if (
                            objects[state.id].common.min === undefined &&
                            objects[state.id].common.max !== undefined
                        ) {
                            control.type = 'slider';
                            objects[state.id].common.min = 0;
                        }

                        controls.push(control);
                    } else if (objects[state.id].common.type === 'boolean') {
                        if (
                            objects[state.id].common.read === false ||
                            objects[state.id].common.role?.includes('button') ||
                            stateName?.startsWith('PRESS ')
                        ) {
                            controls.push({
                                id: state.id,
                                type: 'button',
                                stateId: state.id,
                                channel,
                                label: stateName, // objects[state.id].native.CONTROL || state.id.split('.').pop() || state.name,
                                handler: async (
                                    _deviceId: string,
                                    actionId: string,
                                    state: ControlState,
                                ): Promise<ErrorResponse | ioBroker.State> => {
                                    console.log(state);

                                    await this.adapter.setForeignStateAsync(actionId, true, false);
                                    const currentState = await this.adapter.getStateAsync(actionId);
                                    if (currentState) {
                                        return currentState;
                                    }
                                    return {
                                        error: {
                                            message: 'Can not get current state',
                                            code: 305,
                                        },
                                    };
                                },
                            });
                        } else {
                            controls.push({
                                id: state.id,
                                type: 'switch',
                                channel,
                                stateId: state.id,
                                label: stateName, // objects[state.id].native.CONTROL || state.id.split('.').pop() || state.name,
                                getStateHandler: async (
                                    _deviceId: string,
                                    actionId: string,
                                ): Promise<ioBroker.State | ErrorResponse> => {
                                    const currentState = await this.adapter.getForeignStateAsync(actionId);
                                    if (currentState) {
                                        return currentState;
                                    }
                                    return {
                                        error: {
                                            message: 'Can not get current state',
                                            code: 305,
                                        },
                                    };
                                },
                                handler: async (
                                    _deviceId: string,
                                    actionId: string,
                                    state: ControlState,
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
                                            code: 305,
                                        },
                                    };
                                },
                            });
                        }
                    } else {
                        controls.push({
                            id: state.id,
                            type: 'text',
                            unit: objects[state.id].common.unit,
                            description: objects[state.id].common.desc,
                            stateId: state.id,
                            channel,
                            label: stateName, // objects[state.id].native.CONTROL || state.id.split('.').pop() || state.name,
                            getStateHandler: async (
                                _deviceId: string,
                                actionId: string,
                            ): Promise<ioBroker.State | ErrorResponse> => {
                                const currentState = await this.adapter.getForeignStateAsync(actionId);
                                if (currentState) {
                                    return currentState;
                                }
                                return {
                                    error: {
                                        message: 'Can not get current state',
                                        code: 305,
                                    },
                                };
                            },
                            handler: async (
                                _deviceId: string,
                                actionId: string,
                                state: ControlState,
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
                                        code: 305,
                                    },
                                };
                            },
                        });
                    }
                } else if (objects[state.id].common.read !== false) {
                    const states = objects[state.id].common.states;

                    controls.push({
                        id: state.id,
                        type: 'info',
                        stateId: state.id,
                        description: objects[state.id].common.desc,
                        channel,
                        unit: objects[state.id].common.unit,
                        label: stateName, // objects[state.id].native.CONTROL || state.id.split('.').pop() || state.name,
                        getStateHandler: async (
                            _deviceId: string,
                            actionId: string,
                        ): Promise<ErrorResponse | ioBroker.State> => {
                            console.log(state);

                            const currentState = await this.adapter.getStateAsync(actionId);
                            if (currentState) {
                                if (states) {
                                    const translatedValue = states[currentState.val as number | string];
                                    if (translatedValue !== undefined) {
                                        currentState.val = translatedValue;
                                    }
                                }
                                if (currentState.val === true) {
                                    currentState.val = 'true';
                                } else if (currentState.val === false) {
                                    currentState.val = 'false';
                                }

                                return currentState;
                            }
                            return {
                                error: {
                                    message: 'Can not get current state',
                                    code: 305,
                                },
                            };
                        },
                    });
                }
            }
        });

        return controls;
    }

    protected async getDeviceDetails(id: string): Promise<DeviceDetails<string> | null | { error: string }> {
        const devices = await this.adapter.getDevicesAsync();
        const device = devices.find(d => d._id === id);
        if (!device) {
            return { error: 'Device not found' };
        }
        const data: DeviceDetails<string> = {
            id: device._id,
            schema: {
                type: 'panel',
                items: {},
            },
        };

        if (device.native.FIRMWARE) {
            data.schema.items.firmwareLabel = {
                type: 'staticText',
                text: `Installed firmware:`,
                style: { fontWeight: 'bold' },
                newLine: false,
            };
            data.schema.items.firmware = {
                type: 'staticText',
                text: `${device.native.FIRMWARE}`,
                newLine: false,
            };
        }

        if (device.native.AVAILABLE_FIRMWARE) {
            data.schema.items.labelAvailableFirmware = {
                type: 'staticText',
                text: `Available firmware:`,
                style: { fontWeight: 'bold' },
                newLine: true,
            };
            data.schema.items.availableFirmware = {
                type: 'staticText',
                text: `${device.native.AVAILABLE_FIRMWARE}`,
                newLine: false,
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
                        placeholder: '',
                    },
                },
            },
            {
                data: {
                    newName: '',
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
                    uk: "Введіть нове ім'я",
                },
            },
        );
        if (result?.newName === undefined || result?.newName === '') {
            return { refresh: 'none' };
        }
        const obj = {
            common: {
                name: result.newName,
            },
        };
        const res = await this.adapter.extendObjectAsync(id, obj);
        if (res === null) {
            this.adapter.log.warn(`Can not rename device ${id}: ${JSON.stringify(res)}`);
            return { refresh: 'none' };
        }

        return { refresh: 'devices' };
    }
}
