import { ActionContext, DeviceDetails, DeviceManagement, DeviceRefresh } from '@iobroker/dm-utils';
import { DeviceInfo } from '@iobroker/dm-utils/build/types/adapter';
import { HomematicRpc } from '../main';
export declare class dmHmRpc extends DeviceManagement<HomematicRpc> {
    private typeDetector;
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
