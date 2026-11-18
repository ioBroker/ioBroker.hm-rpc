/**
 * The pure parts of the openccu-lite mode: nothing here talks to the system or to ioBroker.
 *
 * openccu-lite is a CCU firmware without ReGaHSS. Its interface processes are reached through lite-rpc
 * (`/api/rpc/v1`): the requests over HTTP(S) with a token, the events as a stream the adapter opens -
 * no callback server, no `init`. The names and rooms of devices and channels are the system's metadata.
 */
import type { Daemon } from './_types';
/** The interfaces lite-rpc carries (the names of `InterfacesList.xml`, as `GET /api/rpc/v1/interfaces` lists them) */
export declare const LITE_INTERFACES: readonly ["HmIP-RF", "BidCos-RF", "BidCos-Wired", "VirtualDevices"];
/** The scopes the pairing asks for: paramsets are written (`configure`), the names are read */
export declare const LITE_ACCESS: {
    readonly devices: "configure";
    readonly names: "read";
};
/** The pairing waits at most this long for the approval (the system lets a request expire after five minutes) */
export declare const PAIRING_TIMEOUT_MS: number;
/** What the adapter answers the admin when a pairing does not end with a token */
export type PairingErrorCode = 'no-url' | 'unreachable' | 'not-openccu-lite' | 'no-pairing' | 'rejected' | 'expired' | 'timeout' | 'busy' | 'certificate' | 'failed';
/** The state of a pairing, as the instance state `info.pairing` shows it */
export type PairingState = {
    phase: 'idle';
} | {
    phase: 'requesting';
    url: string;
} | {
    phase: 'waiting';
    url: string;
    code: string;
} | {
    phase: 'approved';
    url: string;
} | {
    phase: 'failed';
    url: string;
    error: PairingErrorCode;
};
/**
 * The daemon an interface of the system corresponds to. The daemon decides the CCU specific fixes of the
 * paramset descriptions (`fixParamset`) and which devices are filtered on `newDevices`, so the lite mode
 * derives it from the interface instead of asking the user twice.
 *
 * @param iface the interface name, e.g. `HmIP-RF`
 */
export declare function interfaceDaemon(iface: string): Daemon;
/** The fields of the instance configuration that name the system (the same as for a CCU) */
export interface LiteAddress {
    homematicAddress: string;
    homematicPort: string;
    useHttps: boolean;
}
/**
 * The URL of the system from the configuration: `https://<address>:<port>` (`http://` without TLS), the default
 * port of the scheme left out. A scheme or a path the user typed into the address is dropped; blanks are trimmed.
 * An empty address gives an empty URL.
 *
 * @param config the address fields
 */
export declare function liteUrlOf(config: LiteAddress): string;
/**
 * The address fields for a URL of the system (the one the pairing stored, after the system's redirect)
 *
 * @param url the system's URL, e.g. `https://192.168.1.20`
 */
export declare function liteUrlParts(url: string): LiteAddress;
/**
 * The code the admin shows for an error of the pairing. occulite-client reports its errors as
 * `OccuLiteError` with a `code`; everything else is `failed`.
 *
 * @param e the error
 */
export declare function pairingErrorCode(e: unknown): PairingErrorCode;
/**
 * The text of the instance state `info.pairing`, which the admin shows live while a pairing runs: the code
 * with a link to the system's Status page, then the result. HTML, in German or English (English for every
 * other language of the system).
 *
 * @param state the pairing's state
 * @param lang the system language of ioBroker
 */
export declare function pairingHtml(state: PairingState, lang: string): string;
/**
 * The error string of a failed lite-rpc call for the callback of `methodCall`, in the shape hm-rpc's retry
 * expects: a fault of the interface process is its fault string (`Failure`, `… (UNREACH)`), everything else
 * names the client's error code.
 *
 * @param e the error occulite-client threw
 */
export declare function rpcCallbackError(e: unknown): string;
/**
 * The id of a device or channel object in ioBroker (relative to the namespace) for a CCU address
 *
 * @param address the address, e.g. `000A1B2C3D4E5F:1`
 */
export declare function objectIdOfAddress(address: string): string;
/**
 * The reference of a device or channel in the system's metadata, as occulite-client keys it
 *
 * @param iface the interface name
 * @param address the address
 */
export declare function refOfAddress(iface: string, address: string): string;
/**
 * The name of a datapoint object: `<channel name>.<DATAPOINT>` when the system names the channel (as hm-rega
 * names them), else the datapoint alone (hm-rpc's own default)
 *
 * @param channelName the channel's name in the system, or undefined
 * @param datapoint the datapoint, e.g. `STATE`
 */
export declare function datapointName(channelName: string | undefined, datapoint: string): string;
/**
 * The id of the ioBroker enum for a node of the system's taxonomy: a room tree is flattened, every node is an
 * enum of its own named by its path (`room/eg/bad` → `enum.rooms.eg_bad`), so two rooms `bad` on two floors
 * stay apart. Undefined for an enum of the system ioBroker has no counterpart for.
 *
 * @param path the node's path, e.g. `room/eg/bad`
 */
export declare function enumIdOfPath(path: string): string | undefined;
/** An ioBroker enum an object belongs to directly (one of its innermost nodes) */
export interface EnumMembership {
    /** the enum object's id, e.g. `enum.rooms.eg_bad` */
    id: string;
    /** the node's name in the language asked for */
    name: string;
    /** the node's path in the system, e.g. `room/eg/bad` */
    path: string;
}
/**
 * The ioBroker enums an object belongs to: its direct nodes in the system's taxonomy, each mapped to a flat enum
 * (a channel in `room/eg/bad` is a member of `enum.rooms.eg_bad` and not of `enum.rooms.eg` - the innermost room, as
 * hm-rega handles the CCU's flat rooms)
 *
 * @param nodes the direct nodes of the object (`membership(ref, {inherit: false})` of occulite-client, rooms and functions together)
 */
export declare function enumsOfNodes(nodes: {
    path: string;
    name: string;
}[]): EnumMembership[];
