"use strict";
/**
 * The connection to an openccu-lite system through occulite-client: the requests go to lite-rpc with the
 * token, the events come from the stream the client opens, and `callbackEvents` turns them into the method
 * calls a callback server would make (`event`, `system.multicall`, `newDevices`, `deleteDevices`, ...) with
 * the same argument lists - so the adapter's handlers feed from the stream unchanged.
 *
 * occulite-client is an ES module; it is loaded here by a dynamic import, so the CCU path never loads it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiteConnection = void 0;
exports.tierAwareTransport = tierAwareTransport;
exports.loadOcculite = loadOcculite;
exports.listLiteInterfaces = listLiteInterfaces;
const lite_1 = require("./lite");
/** The rpc tiers of the system above `rpc:read`; each covers the ones below it */
const RPC_TIERS = ['rpc:operate', 'rpc:configure', 'rpc:admin'];
/**
 * occulite-client (0.3.0) decides "names only" from the literal `rpc:read` in `GET /api/auth/v1/state`, but a token
 * paired with a higher tier (`rpc:configure`, what this adapter asks for) carries that tier alone - the system
 * includes the lower ones. This spells `rpc:read` out in the auth state where a tier implies it, so the client
 * follows the devices and the stream. Goes once the package knows the tiers.
 *
 * @param transport the transport of occulite-client
 */
function tierAwareTransport(transport) {
    return {
        request: async (method, url, headers, body, signal) => {
            const response = await transport.request(method, url, headers, body, signal);
            if (response.status !== 200 || !/\/api\/auth\/v1\/state(\?|$)/.test(url)) {
                return response;
            }
            let parsed;
            try {
                parsed = JSON.parse(response.body);
            }
            catch {
                return response;
            }
            const scopes = Array.isArray(parsed?.scopes) ? parsed.scopes : [];
            if (scopes.includes('rpc:read') || !scopes.some(scope => RPC_TIERS.includes(scope))) {
                return response;
            }
            return { ...response, body: JSON.stringify({ ...parsed, scopes: [...scopes, 'rpc:read'] }) };
        },
        stream: (url, headers, signal) => transport.stream(url, headers, signal),
    };
}
let loaded;
/**
 * occulite-client, loaded once (an ES module, so by a dynamic import)
 */
function loadOcculite() {
    loaded ??= (async () => {
        const [client, callbacks, node] = await Promise.all([
            import('occulite-client'),
            import('occulite-client/callbacks'),
            import('occulite-client/node'),
        ]);
        return {
            OccuLite: client.OccuLite,
            callbackEvents: callbacks.callbackEvents,
            nodeTransport: node.nodeTransport,
            pair: node.pair,
            probe: node.probe,
        };
    })();
    return loaded;
}
/**
 * One instance's connection: one interface, one stream, the callbacks of the adapter fed from it
 */
class LiteConnection {
    constructor(opts) {
        this.opts = opts;
        /** the client as the adapter's `rpcClient` */
        this.client = {
            methodCall: (method, params, callback) => this.methodCall(method, params, callback),
            close: () => this.close(),
        };
        this.state = 'idle';
        this.closed = false;
    }
    /**
     * Opens the connection. `register` gets the callback emitter before the stream starts, because the device
     * snapshot arrives as `newDevices` calls while the client connects. Resolves once the first picture is
     * loaded, rejects with the client's reason (unauthenticated, forbidden, unsupported, certificate, timeout).
     *
     * @param register registers the adapter's handlers on the callback emitter
     */
    async start(register) {
        const modules = await (this.opts.loader ?? loadOcculite)();
        const trust = this.opts.fingerprint ? { fingerprint256: this.opts.fingerprint } : {};
        const box = new modules.OccuLite({
            url: this.opts.url,
            auth: { token: this.opts.token },
            transport: tierAwareTransport(modules.nodeTransport(trust)),
            interfaces: [this.opts.iface],
            timeout: this.opts.timeout,
            log: {
                debug: (m) => this.opts.log.debug(m),
                info: (m) => this.opts.log.debug(m),
                warn: (m) => this.opts.log.warn(m),
                error: (m) => this.opts.log.error(m),
            },
        });
        this.box = box;
        box.on('status', (s) => {
            this.state = s.state;
            if (!this.closed) {
                this.opts.onStatus(s.state);
            }
        });
        box.on('interface', (ev) => this.opts.log.info(`lite-rpc <- interface ${ev.interface} ${ev.state}`));
        box.on('error', (e) => this.opts.log.warn(`lite-rpc: ${e.message}`));
        box.on('resync', (ev) => {
            this.opts.log.info(`lite-rpc <- resync (${ev.reason}): the values were read again`);
            this.opts.onResync?.();
        });
        this.server = modules.callbackEvents(box, { initId: this.opts.initId });
        register(this.server);
        await box.ready();
    }
    /** The live copy of the system's names and taxonomy */
    get meta() {
        return this.box?.meta;
    }
    /** The last value of every datapoint the system's state store keeps, keyed `<iface>.<address>.<KEY>` */
    get values() {
        return this.box?.values;
    }
    /** Subscribes to the client's events (`meta`, `value`, ...); the answer unsubscribes */
    on(event, fn) {
        return this.box ? this.box.on(event, fn) : () => undefined;
    }
    /**
     * A method of the interface process through lite-rpc, in the callback shape of the RPC clients. A fault
     * of the process reaches the callback as its fault string, so the adapter's retry on `Failure` works.
     *
     * @param method the method name
     * @param params its parameters
     * @param callback (err, result)
     */
    methodCall(method, params, callback) {
        if (!this.box || this.closed) {
            callback('not connected', undefined);
            return;
        }
        this.box.call(this.opts.iface, method, params).then(result => callback(null, result ?? ''), (e) => callback((0, lite_1.rpcCallbackError)(e), undefined));
    }
    /** Closes the stream; nothing is de-registered, because nothing was registered */
    close() {
        this.closed = true;
        this.server?.close();
        this.server = undefined;
        this.box?.close();
        this.box = undefined;
    }
}
exports.LiteConnection = LiteConnection;
/**
 * The interfaces a system runs, from `GET /api/rpc/v1/interfaces` with the paired token
 *
 * @param opts the system and the credential
 * @param opts.url the system
 * @param opts.token the paired token
 * @param opts.fingerprint the certificate pinned at pairing
 * @param opts.loader loads occulite-client (the tests)
 */
async function listLiteInterfaces(opts) {
    const modules = await (opts.loader ?? loadOcculite)();
    const box = new modules.OccuLite({
        url: opts.url,
        auth: { token: opts.token },
        transport: tierAwareTransport(modules.nodeTransport(opts.fingerprint ? { fingerprint256: opts.fingerprint } : {})),
        timeout: 10_000,
    });
    try {
        return (await box.listInterfaces()).map(i => ({ name: i.name, running: i.running }));
    }
    finally {
        box.close();
    }
}
//# sourceMappingURL=liteConnection.js.map