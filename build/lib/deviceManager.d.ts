import { type ActionContext, type DeviceDetails, DeviceManagement, type DeviceRefresh, type DeviceInfo } from '@iobroker/dm-utils';
import type { HomematicRpc } from '../main';
export declare class dmHmRpc extends DeviceManagement<HomematicRpc> {
    private typeDetector;
    private language;
    constructor(adapter: HomematicRpc);
    protected listDevices(): Promise<DeviceInfo[]>;
    private getControls;
    private typedControl2DeviceManager;
    protected getDeviceDetails(id: string): Promise<DeviceDetails | null | {
        error: string;
    }>;
    handleRenameDevice(id: string, context: ActionContext): Promise<{
        refresh: DeviceRefresh;
    }>;
}
