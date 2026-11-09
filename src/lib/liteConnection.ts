/**
 * The connection to an openccu-lite system through occulite-client: the requests go to lite-rpc with the
 * token, the events come from the stream the client opens, and `callbackEvents` turns them into the method
 * calls a callback server would make (`event`, `system.multicall`, `newDevices`, `deleteDevices`, ...) with
 * the same argument lists - so the adapter's handlers feed from the stream unchanged.
 *
 * occulite-client is an ES module; it is loaded here by a dynamic import, so the CCU path never loads it.
 */

import type { OccuLite, Status, Transport } from 'occulite-client';
import type { callbackEvents, CallbackServer } from 'occulite-client/callbacks';
import type { nodeTransport, pair, probe } from 'occulite-client/node';
import { rpcCallbackError } from './lite';

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
export function tierAwareTransport(transport: Transport): Transport {
    return {
        request: async (method, url, headers, body, signal) => {
            const response = await transport.request(method, url, headers, body, signal);
            if (response.status !== 200 || !/\/api\/auth\/v1\/state(\?|$)/.test(url)) {
                return response;
            }
            let parsed: { scopes?: unknown };
            try {
                parsed = JSON.parse(response.body);
            } catch {
                return response;
            }
            const scopes = Array.isArray(parsed?.scopes) ? (parsed.scopes as string[]) : [];
            if (scopes.includes('rpc:read') || !scopes.some(scope => RPC_TIERS.includes(scope))) {
                return response;
            }
            return { ...response, body: JSON.stringify({ ...parsed, scopes: [...scopes, 'rpc:read'] }) };
        },
        stream: (url, headers, signal) => transport.stream(url, headers, signal),
    };
}

/** The parts of occulite-client the lite mode uses, loaded once */
export interface LiteModules {
    OccuLite: typeof OccuLite;
    callbackEvents: typeof callbackEvents;
    nodeTransport: typeof nodeTransport;
    pair: typeof pair;
    probe: typeof probe;
}

/** Loads occulite-client, for the tests and the pairing a replaceable step */
export type LiteLoader = () => Promise<LiteModules>;

let loaded: Promise<LiteModules> | undefined;

/**
 * occulite-client, loaded once (an ES module, so by a dynamic import)
 */
export function loadOcculite(): Promise<LiteModules> {
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

/** The slice of a homematic-xmlrpc/binrpc client the adapter uses, served by lite-rpc */
export interface RpcClientLike {
    methodCall(method: string, params: unknown[], callback: (err: unknown, res: unknown) => void): void;
    close(): void;
}

export interface LiteConnectionOptions {
    /** the system, scheme and authority */
    url: string;
    /** the paired token */
    token: string;
    /** the certificate pinned at pairing (SHA-256), empty when the system is reached over plain HTTP */
    fingerprint?: string;
    /** the one interface this instance follows, e.g. `HmIP-RF` */
    iface: string;
    /** the first argument of every callback method (the interface id the adapter expects) */
    initId: string;
    log: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
    /** the client's state: connecting | ready | degraded | offline | closed */
    onStatus: (state: Status) => void;
    /** after a gap or a restart of the system the values were read again */
    onResync?: () => void;
    /** per request, ms */
    timeout?: number;
    loader?: LiteLoader;
}

/**
 * One instance's connection: one interface, one stream, the callbacks of the adapter fed from it
 */
export class LiteConnection {
    /** the client as the adapter's `rpcClient` */
    readonly client: RpcClientLike = {
        methodCall: (method, params, callback) => this.methodCall(method, params, callback),
        close: () => this.close(),
    };
    state: Status = 'idle';
    private box: OccuLite | undefined;
    private server: CallbackServer | undefined;
    private closed = false;

    constructor(private readonly opts: LiteConnectionOptions) {}

    /**
     * Opens the connection. `register` gets the callback emitter before the stream starts, because the device
     * snapshot arrives as `newDevices` calls while the client connects. Resolves once the first picture is
     * loaded, rejects with the client's reason (unauthenticated, forbidden, unsupported, certificate, timeout).
     *
     * @param register registers the adapter's handlers on the callback emitter
     */
    async start(register: (server: CallbackServer) => void): Promise<void> {
        const modules = await (this.opts.loader ?? loadOcculite)();
        const trust = this.opts.fingerprint ? { fingerprint256: this.opts.fingerprint } : {};
        const box = new modules.OccuLite({
            url: this.opts.url,
            auth: { token: this.opts.token },
            transport: tierAwareTransport(modules.nodeTransport(trust)),
            interfaces: [this.opts.iface],
            timeout: this.opts.timeout,
            log: {
                debug: (m: string) => this.opts.log.debug(m),
                info: (m: string) => this.opts.log.debug(m),
                warn: (m: string) => this.opts.log.warn(m),
                error: (m: string) => this.opts.log.error(m),
            },
        });
        this.box = box;
        box.on('status', (s: { state: Status }) => {
            this.state = s.state;
            if (!this.closed) {
                this.opts.onStatus(s.state);
            }
        });
        box.on('interface', (ev: { interface: string; state: string }) =>
            this.opts.log.info(`lite-rpc <- interface ${ev.interface} ${ev.state}`),
        );
        box.on('error', (e: Error) => this.opts.log.warn(`lite-rpc: ${e.message}`));
        box.on('resync', (ev: { reason: string }) => {
            this.opts.log.info(`lite-rpc <- resync (${ev.reason}): the values were read again`);
            this.opts.onResync?.();
        });
        this.server = modules.callbackEvents(box, { initId: this.opts.initId });
        register(this.server);
        await box.ready();
    }

    /** The live copy of the system's names and taxonomy */
    get meta(): OccuLite['meta'] | undefined {
        return this.box?.meta;
    }

    /** The last value of every datapoint the system's state store keeps, keyed `<iface>.<address>.<KEY>` */
    get values(): OccuLite['values'] | undefined {
        return this.box?.values;
    }

    /** Subscribes to the client's events (`meta`, `value`, ...); the answer unsubscribes */
    on(event: string, fn: (arg: any) => void): () => void {
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
    methodCall(method: string, params: unknown[], callback: (err: unknown, res: unknown) => void): void {
        if (!this.box || this.closed) {
            callback('not connected', undefined);
            return;
        }
        this.box.call(this.opts.iface, method, params).then(
            result => callback(null, result ?? ''),
            (e: unknown) => callback(rpcCallbackError(e), undefined),
        );
    }

    /** Closes the stream; nothing is de-registered, because nothing was registered */
    close(): void {
        this.closed = true;
        this.server?.close();
        this.server = undefined;
        this.box?.close();
        this.box = undefined;
    }
}

/**
 * The interfaces a system runs, from `GET /api/rpc/v1/interfaces` with the paired token
 *
 * @param opts the system and the credential
 * @param opts.url the system
 * @param opts.token the paired token
 * @param opts.fingerprint the certificate pinned at pairing
 * @param opts.loader loads occulite-client (the tests)
 */
export async function listLiteInterfaces(opts: {
    url: string;
    token: string;
    fingerprint?: string;
    loader?: LiteLoader;
}): Promise<{ name: string; running: boolean }[]> {
    const modules = await (opts.loader ?? loadOcculite)();
    const box = new modules.OccuLite({
        url: opts.url,
        auth: { token: opts.token },
        transport: tierAwareTransport(
            modules.nodeTransport(opts.fingerprint ? { fingerprint256: opts.fingerprint } : {}),
        ),
        timeout: 10_000,
    });
    try {
        return (await box.listInterfaces()).map(i => ({ name: i.name, running: i.running }));
    } finally {
        box.close();
    }
}
