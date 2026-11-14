// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
import type { Daemon } from './lib/_types';

declare global {
    namespace ioBroker {
        interface AdapterConfig {
            homematicAddress: string;
            adapterAddress: string;
            homematicPort: string;
            callbackAddress: string;
            port: string;
            type: string;
            /** the interface process; `openccu-lite` is lite-rpc of an openccu-lite system at homematicAddress:homematicPort */
            daemon: Daemon;
            checkInitInterval: number;
            reconnectInterval: number;
            forceReInit: boolean;
            username: string;
            password: string;
            useHttps: boolean;
            dontDelete: boolean;
            /** openccu-lite: the token the pairing gave */
            liteToken: string;
            /** openccu-lite: the certificate pinned at pairing (SHA-256), '' over plain HTTP */
            liteFingerprint: string;
            /** openccu-lite: the interface of this instance, e.g. `HmIP-RF` */
            liteInterface: string;
            /** openccu-lite: name the objects and fill the rooms and functions from the system's metadata */
            liteNames: boolean;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
