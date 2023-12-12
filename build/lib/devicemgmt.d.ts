import { ActionContext, DeviceDetails, DeviceInfo, DeviceManagement, DeviceRefresh, InstanceDetails } from '@iobroker/dm-utils';
import { HomematicRpc } from '../main';
export declare class dmHmRpc extends DeviceManagement<HomematicRpc> {
    protected getInstanceInfo(): InstanceDetails;
    protected handleRefresh(context: object): Promise<{
        refresh: boolean;
    }>;
    protected listDevices(): Promise<DeviceInfo[]>;
    protected getDeviceDetails(id: string, context: ActionContext): Promise<DeviceDetails | null | {
        error: string;
    }>;
    handleRenameDevice(id: string, context: ActionContext): Promise<{
        refresh: DeviceRefresh;
    } | undefined>;
}
