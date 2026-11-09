/**
 * Names and rooms from an openccu-lite system: the `common.name` of the device, channel and state objects from
 * the system's names, the rooms and functions of its taxonomy as `enum.rooms.*` and `enum.functions.*`. Written
 * as differences only, from the metadata's live copy, whenever it changes.
 */
import { type EnumMembership } from './lite';
/** The slice of the adapter the names need */
export interface NamesAdapter {
    namespace: string;
    log: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
    getForeignObjectsAsync(pattern: string, type: ioBroker.ObjectType): Promise<Record<string, ioBroker.Object>>;
    extendForeignObjectAsync(id: string, part: ioBroker.PartialObject): Promise<unknown>;
    setForeignObjectAsync(id: string, obj: ioBroker.SettableObject): Promise<unknown>;
    delForeignObjectAsync(id: string): Promise<void>;
}
/** The slice of occulite-client's metadata copy the names read */
export interface MetaReader {
    name(ref: string): string | undefined;
    membership(ref: string, opts: {
        inherit?: boolean;
        lang?: string;
    }): {
        rooms: {
            path: string;
            name: string;
        }[];
        functions: {
            path: string;
            name: string;
        }[];
    };
}
/**
 * Keeps the objects of one instance named as the system names them
 */
export declare class LiteNames {
    private readonly adapter;
    private readonly meta;
    private readonly iface;
    private readonly lang;
    private timer;
    private running;
    private again;
    /**
     * @param adapter the adapter
     * @param meta the system's metadata, live
     * @param iface the interface of this instance
     * @param lang the language the node names are taken in
     */
    constructor(adapter: NamesAdapter, meta: MetaReader, iface: string, lang: string);
    /**
     * Applies the names soon: several changes in a row (an import, a renamed floor) become one pass
     *
     * @param delay ms to wait for more changes
     */
    schedule(delay?: number): void;
    /** Stops a scheduled pass */
    stop(): void;
    /**
     * Applies the system's names and taxonomy to every object of the instance. A pass that is asked for while
     * one runs is run after it, once.
     */
    apply(): Promise<void>;
    private pass;
    /**
     * Brings the rooms and functions in line: only the members of this instance are managed in an enum (another
     * instance on the same system, or the user, may have added others), an enum this adapter created goes when
     * it has no members left. An enum is always written whole: `extendObject` merges arrays index-wise, so a
     * shorter member list would leave the old entries behind.
     *
     * @param wanted enum id → name, path and the members of this instance
     * @returns how many enum objects were written or removed
     */
    private syncEnums;
}
export type { EnumMembership };
