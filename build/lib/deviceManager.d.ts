import { type ActionContext, type DeviceDetails, DeviceManagement, type DeviceRefresh, type DeviceInfo, type DeviceLoadContext } from '@iobroker/dm-utils';
import type { HomematicRpc } from '../main';
export declare class dmHmRpc extends DeviceManagement<HomematicRpc> {
    private typeDetector;
    private language;
    constructor(adapter: HomematicRpc);
    protected loadDevices(context: DeviceLoadContext<string>): Promise<void>;
    protected listDevices(): Promise<DeviceInfo<string>[]>;
    private getControls;
    private typedControl2DeviceManager;
    protected getDeviceDetails(id: string): Promise<DeviceDetails<string> | null | {
        error: string;
    }>;
    handleRenameDevice(id: string, context: ActionContext): Promise<{
        refresh: DeviceRefresh;
    }>;
}
