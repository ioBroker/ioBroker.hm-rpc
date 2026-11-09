/**
 * Pairing with an openccu-lite system: the adapter asks the system for a token, the admin shows the six-digit
 * code, an administrator approves the request on the system's Status page, and the token with the pinned
 * certificate comes back. Nothing is copied by hand.
 */
import type { PairingErrorCode, PairingState } from './lite';
import { type LiteLoader } from './liteConnection';
/** A pairing that did not end with a token, with the code the admin shows */
export declare class PairingError extends Error {
    readonly code: PairingErrorCode;
    constructor(code: PairingErrorCode, message?: string);
}
export interface PairingResult {
    /** the system's URL as it answered (after its redirect to https, where it has one) */
    url: string;
    token: string;
    /** the certificate the code was bound to (SHA-256), '' over plain HTTP */
    fingerprint: string;
}
export interface LitePairingOptions {
    /** what the system's Status page shows as the requesting program */
    app: string;
    appVersion: string;
    /** this instance, e.g. `hm-rpc.0 on iobroker` */
    instance: string;
    log: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
    /** every change of the pairing's state (shown live in the admin) */
    onState: (state: PairingState) => void;
    /** the whole pairing, ms */
    timeout?: number;
    loader?: LiteLoader;
}
/**
 * Runs one pairing at a time
 */
export declare class LitePairing {
    private readonly opts;
    private running;
    constructor(opts: LitePairingOptions);
    /** whether a pairing is in progress */
    get busy(): boolean;
    /**
     * Pairs with the system at `url`: probes it, requests the code, waits for the approval. Rejects with a
     * `PairingError` naming the reason.
     *
     * @param url the system's URL from the form (`liteUrlOf`), '' when no address was entered
     */
    pair(url: string): Promise<PairingResult>;
    private run;
}
