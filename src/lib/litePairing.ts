/**
 * Pairing with an openccu-lite system: the adapter asks the system for a token, the admin shows the six-digit
 * code, an administrator approves the request on the system's Status page, and the token with the pinned
 * certificate comes back. Nothing is copied by hand.
 */

import { LITE_ACCESS, PAIRING_TIMEOUT_MS, pairingErrorCode } from './lite';
import type { PairingErrorCode, PairingState } from './lite';
import { loadOcculite, type LiteLoader } from './liteConnection';

/** A pairing that did not end with a token, with the code the admin shows */
export class PairingError extends Error {
    constructor(
        readonly code: PairingErrorCode,
        message?: string,
    ) {
        super(message ?? code);
        this.name = 'PairingError';
    }
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
export class LitePairing {
    private running: Promise<PairingResult> | undefined;

    constructor(private readonly opts: LitePairingOptions) {}

    /** whether a pairing is in progress */
    get busy(): boolean {
        return this.running !== undefined;
    }

    /**
     * Pairs with the system at `url`: probes it, requests the code, waits for the approval. Rejects with a
     * `PairingError` naming the reason.
     *
     * @param url the system's URL from the form (`liteUrlOf`), '' when no address was entered
     */
    pair(url: string): Promise<PairingResult> {
        if (!url) {
            this.opts.onState({ phase: 'failed', url, error: 'no-url' });
            return Promise.reject(new PairingError('no-url'));
        }
        if (this.running) {
            return Promise.reject(new PairingError('busy'));
        }
        this.running = this.run(url).finally(() => {
            this.running = undefined;
        });
        return this.running;
    }

    private async run(typed: string): Promise<PairingResult> {
        let url = typed;
        try {
            this.opts.onState({ phase: 'requesting', url });
            const modules = await (this.opts.loader ?? loadOcculite)();
            const probed = await modules.probe(url, { timeout: 10_000 });
            if (probed.kind === 'unreachable') {
                throw new PairingError(
                    probed.reason === 'certificate' ? 'certificate' : 'unreachable',
                    `${url} is not reachable (${probed.reason})`,
                );
            }
            if (probed.kind !== 'openccu-lite') {
                throw new PairingError('not-openccu-lite', `${url} does not answer as an openccu-lite system`);
            }
            url = probed.url;
            this.opts.log.info(`Pairing with ${url} requested, approve it on the Status page of the system`);
            const paired = await modules
                .pair({
                    url,
                    app: this.opts.app,
                    appVersion: this.opts.appVersion,
                    instance: this.opts.instance,
                    access: { ...LITE_ACCESS },
                    purpose: {
                        devices: 'reads and writes the values and paramsets of the devices for ioBroker',
                        names: 'names, rooms and functions of the devices',
                    },
                    timeout: this.opts.timeout ?? PAIRING_TIMEOUT_MS,
                    onCode: code => this.opts.onState({ phase: 'waiting', url, code }),
                })
                .catch((e: unknown) => {
                    throw new PairingError(pairingErrorCode(e), (e as Error).message);
                });
            this.opts.onState({ phase: 'approved', url });
            this.opts.log.info(`Paired with ${url} as "${paired.name}" (${paired.scopes.join(', ')})`);
            return { url, token: paired.token, fingerprint: paired.fingerprint256 };
        } catch (e: unknown) {
            const error = e instanceof PairingError ? e : new PairingError('failed', (e as Error).message);
            this.opts.log.warn(`Pairing with ${url} failed: ${error.message}`);
            this.opts.onState({ phase: 'failed', url, error: error.code });
            throw error;
        }
    }
}
