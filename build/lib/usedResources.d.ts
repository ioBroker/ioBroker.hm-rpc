/**
 * Addresses that stand for every interface. A socket bound to one of them occupies the port in both
 * address families (a wildcard listener is dual-stack), so the family must not be reported for it.
 */
export declare const WILDCARD_ADDRESSES: string[];
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
 * Report a TCP port as occupied by this instance.
 *
 * The host drops what this instance registered before whenever it starts, so a stale registration of
 * a previous configuration cannot survive a restart.
 *
 * @param adapter the ioBroker adapter
 * @param data the port, and the address it is bound to if it is not every interface
 * @returns whether the host accepted the registration
 */
export declare function registerUsedPort(adapter: ioBroker.Adapter, data: UsedTcpPort): Promise<boolean>;
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
export declare function freeUsedPort(adapter: ioBroker.Adapter, data?: Partial<UsedTcpPort>): Promise<boolean>;
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
export declare function reportPortConflict(adapter: ioBroker.Adapter, data: UsedTcpPort, what: string): Promise<RegisteredTcpPort[]>;
