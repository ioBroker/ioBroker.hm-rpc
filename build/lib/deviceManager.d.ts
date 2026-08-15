import { type ActionContext, type DeviceDetails, DeviceManagement, type DeviceRefresh, type DeviceInfo, type DeviceLoadContext } from '@iobroker/dm-utils';
import type { HomematicRpc } from '../main';
export declare class dmHmRpc extends DeviceManagement<HomematicRpc> {
    private typeDetector;
    private language;
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
    private static deviceIcon;
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
