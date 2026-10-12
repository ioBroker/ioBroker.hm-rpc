/*
 * Reports the TCP port of the RPC callback server to the per-host registry of exclusive resources
 * js-controller 8 keeps (`system.host.<hostname>.usedResources.<type>`).
 *
 * The registry answers "which port is already spoken for on this host". That is worth more here than
 * the entry js-controller derives for an adapter that declares nothing: it would take `native.port`,
 * which is only the *wish* for the callback port - the default `0` means "pick one", and even a
 * configured one is moved on by `getPort()` when it is taken. What the CCU really calls back on is
 * known at runtime, and that is what is reported.
 *
 * `native.homematicPort` is not reported at all: that is the port of the CCU, on another machine.
 *
 * Nothing in this module is required for the adapter to work - every failure is logged and swallowed.
 */

/** Feature a js-controller announces once it maintains the registry. Since js-controller 8. */
const USED_RESOURCES_FEATURE = 'CONTROLLER_USED_RESOURCES';

/**
 * Addresses that stand for every interface. A socket bound to one of them occupies the port in both
 * address families (a wildcard listener is dual-stack), so the family must not be reported for it.
 */
export const WILDCARD_ADDRESSES = ['0.0.0.0', '::', '*', ''];

/** A TCP port occupied by this instance */
export interface UsedTcpPort {
    /** TCP port number */
    port: number;
    /** Address the socket is bound to, `0.0.0.0` or `::` for every interface */
    bind?: string;
    /** Address family, only reported for a concrete bind address */
    family?: 4 | 6;
}

/** One entry of the registry, as `checkUsedResource` returns it */
export interface RegisteredTcpPort {
    /** Instance that occupies the port, e.g. `mqtt.0` */
    instance: string;
    /** Whether that instance is running and really holds it now */
    isBlocked: boolean;
    /** The port it holds */
    data: UsedTcpPort;
}

/**
 * The part of the adapter API this module uses, all of it optional: the methods exist since
 * js-controller 8, and `supportsFeature()` is typed against a union of known features that does not
 * contain {@link USED_RESOURCES_FEATURE} in older types - this adapter builds against those.
 */
interface UsedResourcesApi {
    registerUsedResource?: (type: 'tcpPort', data: UsedTcpPort) => Promise<void>;
    freeUsedResource?: (type: 'tcpPort', data?: Partial<UsedTcpPort>) => Promise<void>;
    checkUsedResource?: (type: 'tcpPort', data?: Partial<UsedTcpPort>) => Promise<RegisteredTcpPort[]>;
    supportsFeature?: (feature: string) => boolean;
}

/** `common` of the instance object, with the flag deciding who fills the registry for it */
type UsedResourcesCommon = ioBroker.AdapterCommon & {
    /**
     * `true`: the adapter declares its resources itself, which is what this module does.
     * Not set: js-controller derives them from `native.port`. `false`: the instance has no entries.
     */
    declareUsedResources?: boolean;
};

/**
 * Log without ever throwing.
 *
 * A free arrives while the adapter is being torn down, at which point its logger can already be
 * gone. A throwing log statement in one of these calls would end up as a rejection nobody listens
 * to, which terminates the adapter - a lot of damage for a line that only says a port was reported.
 *
 * @param adapter the ioBroker adapter
 * @param level the log level to write with
 * @param message what to write
 */
function log(adapter: ioBroker.Adapter, level: 'debug' | 'warn', message: string): void {
    try {
        adapter.log[level](message);
    } catch {
        // There is nothing left that could report this
    }
}

/**
 * How a port is named in the log. An IPv6 address is bracketed, otherwise its own colons run into
 * the one before the port (`:::1883`).
 *
 * @param data the port and the address it is bound to
 */
function describe(data: Partial<UsedTcpPort>): string {
    if (!data.bind) {
        return `${data.port}`;
    }
    return data.bind.includes(':') ? `[${data.bind}]:${data.port}` : `${data.bind}:${data.port}`;
}

/**
 * Whether this instance may report its used resources to the host.
 *
 * All three reasons against it are perfectly normal - an older controller, an adapter built against
 * an older `@iobroker/adapter-core`, an instance that leaves the registry to the controller - so
 * none is worth more than a debug line. A host that knows no `registerUsedResource` does not refuse
 * the call, it simply never answers it, so every single one would first sit out the five second
 * timeout of the adapter API. That is why the feature is asked for before anything is sent.
 *
 * @param adapter the ioBroker adapter
 */
function canReportUsedResources(adapter: ioBroker.Adapter): boolean {
    const api = adapter as unknown as UsedResourcesApi;

    if (typeof api.registerUsedResource !== 'function' || typeof api.freeUsedResource !== 'function') {
        // Told apart from the feature below only to name the half that is missing: this one can be
        // fixed by the adapter, by updating its @iobroker/adapter-core
        log(adapter, 'debug', 'Used resources are not reported: @iobroker/adapter-core is older than js-controller 8');
        return false;
    }

    if (typeof api.supportsFeature !== 'function' || !api.supportsFeature(USED_RESOURCES_FEATURE)) {
        log(
            adapter,
            'debug',
            `Used resources are not reported: js-controller keeps no registry of used resources (feature "${USED_RESOURCES_FEATURE}")`,
        );
        return false;
    }

    if ((adapter.common as UsedResourcesCommon | undefined)?.declareUsedResources !== true) {
        // The host would refuse the registration in this case, and asking it first only to be told
        // so costs a message round-trip
        log(
            adapter,
            'debug',
            'Used resources are not reported: "common.declareUsedResources" is not true in io-package.json',
        );
        return false;
    }

    return true;
}

/**
 * Report a TCP port as occupied by this instance.
 *
 * The host drops what this instance registered before whenever it starts, so a stale registration of
 * a previous configuration cannot survive a restart.
 *
 * @param adapter the ioBroker adapter
 * @param data the port, and the address it is bound to if it is not every interface
 * @returns whether the host accepted the registration
 */
export async function registerUsedPort(adapter: ioBroker.Adapter, data: UsedTcpPort): Promise<boolean> {
    if (!canReportUsedResources(adapter)) {
        return false;
    }

    try {
        await (adapter as unknown as UsedResourcesApi).registerUsedResource!('tcpPort', data);
        log(adapter, 'debug', `Registered TCP port ${describe(data)} as used by this instance`);
        return true;
    } catch (e: any) {
        log(adapter, 'warn', `Could not register TCP port ${describe(data)} as used: ${e.message}`);
        return false;
    }
}

/**
 * Take a previously reported TCP port back.
 *
 * `data` is a filter and not the exact payload: every field it names has to match, fields it leaves
 * out are ignored - so omitting it frees every TCP port of this instance. Freeing on shutdown is not
 * needed, the host marks the entries of a stopped instance as no longer held by itself.
 *
 * @param adapter the ioBroker adapter
 * @param data the fields identifying the ports to free; every TCP port of this instance without it
 * @returns whether the host accepted the request
 */
export async function freeUsedPort(adapter: ioBroker.Adapter, data?: Partial<UsedTcpPort>): Promise<boolean> {
    if (!canReportUsedResources(adapter)) {
        return false;
    }

    try {
        await (adapter as unknown as UsedResourcesApi).freeUsedResource!('tcpPort', data);
        log(adapter, 'debug', `Freed TCP port ${data ? describe(data) : 'registrations'} of this instance`);
        return true;
    } catch (e: any) {
        log(adapter, 'warn', `Could not free TCP port ${data ? describe(data) : 'registrations'}: ${e.message}`);
        return false;
    }
}

/**
 * Say in the log which other instance holds a port this adapter is about to open.
 *
 * Asked before the port is opened: afterwards the operating system has already decided the conflict,
 * and all this could do is improve the wording of the EADDRINUSE. The answer is a hint and not a
 * permission - the registry knows what adapters declare, so an empty result does not promise the
 * port is free, and a program outside ioBroker holding it is not in the registry at all.
 *
 * @param adapter the ioBroker adapter
 * @param data the port that is about to be opened
 * @param what which part of this adapter wants it, for the log line
 */
export async function reportPortConflict(
    adapter: ioBroker.Adapter,
    data: UsedTcpPort,
    what: string,
): Promise<RegisteredTcpPort[]> {
    if (!canReportUsedResources(adapter)) {
        return [];
    }

    let holders: RegisteredTcpPort[];
    try {
        holders = (await (adapter as unknown as UsedResourcesApi).checkUsedResource!('tcpPort', data)) || [];
    } catch (e: any) {
        log(adapter, 'debug', `Could not ask which instance uses TCP port ${describe(data)}: ${e.message}`);
        return [];
    }

    if (holders.length) {
        const running = holders.filter(holder => holder.isBlocked);
        log(
            adapter,
            'warn',
            `TCP port ${describe(data)} for ${what} is declared by ${holders
                .map(holder => holder.instance)
                .join(', ')}${running.length ? '' : ' (not running at the moment)'}`,
        );
    }

    return holders;
}
