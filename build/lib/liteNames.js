"use strict";
/**
 * Names and rooms from an openccu-lite system: the `common.name` of the device, channel and state objects from
 * the system's names, the rooms and functions of its taxonomy as `enum.rooms.*` and `enum.functions.*`. Written
 * as differences only, from the metadata's live copy, whenever it changes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiteNames = void 0;
const lite_1 = require("./lite");
/**
 * Keeps the objects of one instance named as the system names them
 */
class LiteNames {
    /**
     * @param adapter the adapter
     * @param meta the system's metadata, live
     * @param iface the interface of this instance
     * @param lang the language the node names are taken in
     */
    constructor(adapter, meta, iface, lang) {
        this.adapter = adapter;
        this.meta = meta;
        this.iface = iface;
        this.lang = lang;
        this.again = false;
    }
    /**
     * Applies the names soon: several changes in a row (an import, a renamed floor) become one pass
     *
     * @param delay ms to wait for more changes
     */
    schedule(delay = 300) {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.apply();
        }, delay);
    }
    /** Stops a scheduled pass */
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }
    /**
     * Applies the system's names and taxonomy to every object of the instance. A pass that is asked for while
     * one runs is run after it, once.
     */
    apply() {
        if (this.running) {
            this.again = true;
            return this.running;
        }
        this.running = this.pass()
            .catch((e) => this.adapter.log.warn(`Could not apply the names of the system: ${e.message}`))
            .finally(() => {
            this.running = undefined;
            if (this.again) {
                this.again = false;
                void this.apply();
            }
        });
        return this.running;
    }
    async pass() {
        const ns = `${this.adapter.namespace}.`;
        const devices = await this.adapter.getForeignObjectsAsync(`${ns}*`, 'device');
        const channels = await this.adapter.getForeignObjectsAsync(`${ns}*`, 'channel');
        const states = await this.adapter.getForeignObjectsAsync(`${ns}*`, 'state');
        /** channel id → the channel's name in the system (undefined when it has none) */
        const channelNames = new Map();
        /** enum id → its name and the members of this instance */
        const enums = new Map();
        let renamed = 0;
        for (const obj of [...Object.values(devices), ...Object.values(channels)]) {
            const address = obj.native?.ADDRESS;
            if (typeof address !== 'string') {
                continue;
            }
            const ref = (0, lite_1.refOfAddress)(this.iface, address);
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
            for (const e of (0, lite_1.enumsOfNodes)([...membership.rooms, ...membership.functions])) {
                const entry = enums.get(e.id) ?? { name: e.name, path: e.path, members: new Set() };
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
            const name = (0, lite_1.datapointName)(channelNames.get(channelId), obj._id.slice(dot + 1));
            if (obj.common.name !== name) {
                await this.adapter.extendForeignObjectAsync(obj._id, { common: { name } });
                renamed++;
            }
        }
        const changedEnums = await this.syncEnums(enums);
        if (renamed || changedEnums) {
            this.adapter.log.info(`Names of the system applied: ${renamed} object(s) renamed, ${changedEnums} enum(s) changed`);
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
    async syncEnums(wanted) {
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
            const mine = obj.native?.hmRpc !== undefined;
            if (!want && mine && foreign.length === 0) {
                await this.adapter.delForeignObjectAsync(id);
                changed++;
                continue;
            }
            const membersChanged = JSON.stringify(ours) !== JSON.stringify(wantedOurs);
            const nameChanged = want !== undefined && mine && obj.common.name !== want.name;
            if (membersChanged || nameChanged) {
                const next = structuredClone(obj);
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
            const native = { hmRpc: { path: want.path } };
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
exports.LiteNames = LiteNames;
/**
 * The members of an enum object: the array as stored, or the index-keyed object a store hands back for one
 *
 * @param obj the enum object
 */
function membersOf(obj) {
    const members = obj.common?.members;
    if (Array.isArray(members)) {
        return members.filter((m) => typeof m === 'string');
    }
    if (members && typeof members === 'object') {
        return Object.values(members).filter((m) => typeof m === 'string');
    }
    return [];
}
//# sourceMappingURL=liteNames.js.map