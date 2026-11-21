/**
 * Names and rooms from an openccu-lite system: the `common.name` of the device, channel and state objects from
 * the system's names, the rooms and functions of its taxonomy as `enum.rooms.*` and `enum.functions.*`. Written
 * as differences only, from the metadata's live copy, whenever it changes.
 */

import { datapointName, enumsOfNodes, refOfAddress, type EnumMembership } from './lite';

/** The slice of the adapter the names need */
export interface NamesAdapter {
    namespace: string;
    log: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
    getForeignObjectsAsync(pattern: string, type: ioBroker.ObjectType): Promise<Record<string, ioBroker.Object>>;
    extendForeignObjectAsync(id: string, part: ioBroker.PartialObject): Promise<unknown>;
    setForeignObjectAsync(id: string, obj: ioBroker.SettableObject): Promise<unknown>;
    delForeignObjectAsync(id: string): Promise<void>;
    setTimeout(cb: () => void, timeout: number): ioBroker.Timeout | undefined;
    clearTimeout(timer: ioBroker.Timeout | undefined): void;
}

/** The slice of occulite-client's metadata copy the names read */
export interface MetaReader {
    name(ref: string): string | undefined;
    membership(
        ref: string,
        opts: { inherit?: boolean; lang?: string },
    ): { rooms: { path: string; name: string }[]; functions: { path: string; name: string }[] };
}

/** What the enum objects of this adapter carry in `native`, so they can be told from the user's */
interface EnumNative {
    hmRpc?: { path: string };
}

/** How a pass fits in with the rest of the adapter */
export interface LiteNamesOptions {
    /**
     * Resolves once the removal of the objects of devices the system no longer has is through: a pass waits for it,
     * so it does not rename objects while they are deleted (a rename of a deleted id would create a new object)
     */
    settled?: () => Promise<void>;
    /** Whether the system still lists a device or channel address; a pass leaves the ones it does not alone */
    known?: (address: string) => boolean;
}

/**
 * Keeps the objects of one instance named as the system names them
 */
export class LiteNames {
    private timer: ioBroker.Timeout | undefined;
    private running: Promise<void> | undefined;
    private again = false;

    /**
     * @param adapter the adapter
     * @param meta the system's metadata, live
     * @param iface the interface of this instance
     * @param lang the language the node names are taken in
     * @param opts the cleanup to wait for and the addresses the system still lists
     */
    constructor(
        private readonly adapter: NamesAdapter,
        private readonly meta: MetaReader,
        private readonly iface: string,
        private readonly lang: string,
        private readonly opts: LiteNamesOptions = {},
    ) {}

    /**
     * Applies the names soon: several changes in a row (an import, a renamed floor) become one pass
     *
     * @param delay ms to wait for more changes
     */
    schedule(delay = 300): void {
        if (this.timer) {
            this.adapter.clearTimeout(this.timer);
        }
        this.timer = this.adapter.setTimeout(() => {
            this.timer = undefined;
            void this.apply();
        }, delay);
    }

    /** Stops a scheduled pass */
    stop(): void {
        if (this.timer) {
            this.adapter.clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    /**
     * Applies the system's names and taxonomy to every object of the instance. A pass that is asked for while
     * one runs is run after it, once.
     */
    apply(): Promise<void> {
        if (this.running) {
            this.again = true;
            return this.running;
        }
        this.running = this.pass()
            .catch((e: unknown) =>
                this.adapter.log.warn(`Could not apply the names of the system: ${(e as Error).message}`),
            )
            .finally(() => {
                this.running = undefined;
                if (this.again) {
                    this.again = false;
                    void this.apply();
                }
            });
        return this.running;
    }

    private async pass(): Promise<void> {
        await this.opts.settled?.();
        const ns = `${this.adapter.namespace}.`;
        const devices = await this.adapter.getForeignObjectsAsync(`${ns}*`, 'device');
        const channels = await this.adapter.getForeignObjectsAsync(`${ns}*`, 'channel');
        const states = await this.adapter.getForeignObjectsAsync(`${ns}*`, 'state');

        /** channel id → the channel's name in the system (undefined when it has none) */
        const channelNames = new Map<string, string | undefined>();
        /** enum id → its name and the members of this instance */
        const enums = new Map<string, { name: string; path: string; members: Set<string> }>();
        let renamed = 0;

        for (const obj of [...Object.values(devices), ...Object.values(channels)]) {
            const address = obj.native?.ADDRESS as string | undefined;
            if (typeof address !== 'string' || this.opts.known?.(address) === false) {
                // a device removed on the system: its objects are being deleted, and so are its datapoints, which
                // are skipped with their channel
                continue;
            }
            const ref = refOfAddress(this.iface, address);
            const systemName = this.meta.name(ref);
            if (obj.type === 'channel') {
                channelNames.set(obj._id, systemName);
            }
            const name = systemName ?? address;
            if (obj.common.name !== name) {
                await this.adapter.extendForeignObjectAsync(obj._id, { common: { name } });
                renamed++;
            }
            const membership = this.meta.membership(ref, { inherit: false, lang: this.lang });
            for (const e of enumsOfNodes([...membership.rooms, ...membership.functions])) {
                const entry = enums.get(e.id) ?? { name: e.name, path: e.path, members: new Set<string>() };
                entry.members.add(obj._id);
                enums.set(e.id, entry);
            }
        }

        for (const obj of Object.values(states)) {
            const dot = obj._id.lastIndexOf('.');
            const channelId = obj._id.slice(0, dot);
            if (!channelNames.has(channelId)) {
                // info.*, updated: not a datapoint of a channel
                continue;
            }
            const name = datapointName(channelNames.get(channelId), obj._id.slice(dot + 1));
            if (obj.common.name !== name) {
                await this.adapter.extendForeignObjectAsync(obj._id, { common: { name } });
                renamed++;
            }
        }

        const changedEnums = await this.syncEnums(enums);
        if (renamed || changedEnums) {
            this.adapter.log.info(
                `Names of the system applied: ${renamed} object(s) renamed, ${changedEnums} enum(s) changed`,
            );
        }
    }

    /**
     * Brings the rooms and functions in line: only the members of this instance are managed in an enum (another
     * instance on the same system, or the user, may have added others), an enum this adapter created goes when
     * it has no members left. An enum is always written whole: `extendObject` merges arrays index-wise, so a
     * shorter member list would leave the old entries behind.
     *
     * @param wanted enum id → name, path and the members of this instance
     * @returns how many enum objects were written or removed
     */
    private async syncEnums(
        wanted: Map<string, { name: string; path: string; members: Set<string> }>,
    ): Promise<number> {
        const ns = `${this.adapter.namespace}.`;
        const existing = {
            ...(await this.adapter.getForeignObjectsAsync('enum.rooms.*', 'enum')),
            ...(await this.adapter.getForeignObjectsAsync('enum.functions.*', 'enum')),
        };
        let changed = 0;

        for (const [id, obj] of Object.entries(existing)) {
            const members = membersOf(obj);
            const foreign = members.filter(m => !m.startsWith(ns));
            const ours = members.filter(m => m.startsWith(ns)).sort();
            const want = wanted.get(id);
            const wantedOurs = want ? [...want.members].sort() : [];
            const mine = (obj.native as EnumNative | undefined)?.hmRpc !== undefined;
            if (!want && mine && foreign.length === 0) {
                await this.adapter.delForeignObjectAsync(id);
                changed++;
                continue;
            }
            const membersChanged = JSON.stringify(ours) !== JSON.stringify(wantedOurs);
            const nameChanged = want !== undefined && mine && obj.common.name !== want.name;
            if (membersChanged || nameChanged) {
                const next = structuredClone(obj) as ioBroker.EnumObject;
                next.common.members = [...foreign, ...wantedOurs];
                if (nameChanged) {
                    next.common.name = want.name;
                }
                await this.adapter.setForeignObjectAsync(id, next);
                changed++;
            }
        }

        for (const [id, want] of wanted) {
            if (existing[id]) {
                continue;
            }
            const native: EnumNative = { hmRpc: { path: want.path } };
            await this.adapter.setForeignObjectAsync(id, {
                type: 'enum',
                common: { name: want.name, members: [...want.members].sort() },
                native,
            });
            changed++;
        }
        return changed;
    }
}

/**
 * The members of an enum object: the array as stored, or the index-keyed object a store hands back for one
 *
 * @param obj the enum object
 */
function membersOf(obj: ioBroker.Object): string[] {
    const members: unknown = obj.common?.members;
    if (Array.isArray(members)) {
        return members.filter((m): m is string => typeof m === 'string');
    }
    if (members && typeof members === 'object') {
        return Object.values(members).filter((m): m is string => typeof m === 'string');
    }
    return [];
}

export type { EnumMembership };
