"use strict";
/**
 * Pairing with an openccu-lite system: the adapter asks the system for a token, the admin shows the six-digit
 * code, an administrator approves the request on the system's Status page, and the token with the pinned
 * certificate comes back. Nothing is copied by hand.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LitePairing = exports.PairingError = void 0;
const lite_1 = require("./lite");
const liteConnection_1 = require("./liteConnection");
/** A pairing that did not end with a token, with the code the admin shows */
class PairingError extends Error {
    constructor(code, message) {
        super(message ?? code);
        this.code = code;
        this.name = 'PairingError';
    }
}
exports.PairingError = PairingError;
/**
 * Runs one pairing at a time
 */
class LitePairing {
    constructor(opts) {
        this.opts = opts;
    }
    /** whether a pairing is in progress */
    get busy() {
        return this.running !== undefined;
    }
    /**
     * Pairs with the system at `url`: probes it, requests the code, waits for the approval. Rejects with a
     * `PairingError` naming the reason.
     *
     * @param url the system's URL from the form (`liteUrlOf`), '' when no address was entered
     */
    pair(url) {
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
    async run(typed) {
        let url = typed;
        try {
            this.opts.onState({ phase: 'requesting', url });
            const modules = await (this.opts.loader ?? liteConnection_1.loadOcculite)();
            const probed = await modules.probe(url, { timeout: 10_000 });
            if (probed.kind === 'unreachable') {
                throw new PairingError(probed.reason === 'certificate' ? 'certificate' : 'unreachable', `${url} is not reachable (${probed.reason})`);
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
                access: { ...lite_1.LITE_ACCESS },
                purpose: {
                    devices: 'reads and writes the values and paramsets of the devices for ioBroker',
                    names: 'names, rooms and functions of the devices',
                },
                timeout: this.opts.timeout ?? lite_1.PAIRING_TIMEOUT_MS,
                onCode: code => this.opts.onState({ phase: 'waiting', url, code }),
            })
                .catch((e) => {
                throw new PairingError((0, lite_1.pairingErrorCode)(e), e.message);
            });
            this.opts.onState({ phase: 'approved', url });
            this.opts.log.info(`Paired with ${url} as "${paired.name}" (${paired.scopes.join(', ')})`);
            return { url, token: paired.token, fingerprint: paired.fingerprint256 };
        }
        catch (e) {
            const error = e instanceof PairingError ? e : new PairingError('failed', e.message);
            this.opts.log.warn(`Pairing with ${url} failed: ${error.message}`);
            this.opts.onState({ phase: 'failed', url, error: error.code });
            throw error;
        }
    }
}
exports.LitePairing = LitePairing;
//# sourceMappingURL=litePairing.js.map