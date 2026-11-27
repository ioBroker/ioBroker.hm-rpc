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
     * @param opts the cleanup to wait for and the addresses the system still lists
     */
    constructor(adapter, meta, iface, lang, opts = {}) {
        this.adapter = adapter;
        this.meta = meta;
        this.iface = iface;
        this.lang = lang;
        this.opts = opts;
        this.again = false;
        /** the enums already reported as left behind, so the log names each once per run of the instance */
        this.reported = new Set();
    }
    /**
     * Applies the names soon: several changes in a row (an import, a renamed floor) become one pass
     *
     * @param delay ms to wait for more changes
     */
    schedule(delay = 300) {
        if (this.timer) {
            this.adapter.clearTimeout(this.timer);
        }
        this.timer = this.adapter.setTimeout(() => {
            this.timer = undefined;
            void this.apply();
        }, delay);
    }
    /** Stops a scheduled pass */
    stop() {
        if (this.timer) {
            this.adapter.clearTimeout(this.timer);
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
        await this.opts.settled?.();
        const ns = `${this.adapter.namespace}.`;
        const devices = await this.adapter.getForeignObjectsAsync(`${ns}*`, 'device');
        const channels = await this.adapter.getForeignObjectsAsync(`${ns}*`, 'channel');
        const states = await this.adapter.getForeignObjectsAsync(`${ns}*`, 'state');
        /** channel id → the channel's name in the system (undefined when it has none) */
        const channelNames = new Map();
        /** enum id → its name and the members of this instance */
        const enums = new Map();
        /** path → name of every node, for the names along the path of a nested one */
        const nodeNames = new Map();
        for (const node of [
            ...this.meta.rooms({ inherit: false, lang: this.lang }),
            ...this.meta.functions({ inherit: false, lang: this.lang }),
        ]) {
            nodeNames.set(node.path, node.name);
        }
        const nameOf = (path) => nodeNames.get(path);
        let renamed = 0;
        for (const obj of [...Object.values(devices), ...Object.values(channels)]) {
            const address = obj.native?.ADDRESS;
            if (typeof address !== 'string' || this.opts.known?.(address) === false) {
                // a device removed on the system: its objects are being deleted, and so are its datapoints, which
                // are skipped with their channel
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
            for (const e of (0, lite_1.enumsOfNodes)([...membership.rooms, ...membership.functions], nameOf)) {
                const entry = enums.get(e.id) ?? {
                    name: e.name,
                    path: e.path,
                    builtin: e.builtin,
                    members: new Set(),
                };
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
     * Brings the rooms and functions in line, as ioBroker.hm-rega does with the CCU's rooms: an enum of the id
     * wanted is carried on, whoever made it (its name, icon and the members of others stay; it is marked as
     * managed from then on). For one of the CCU's own rooms the import named in German, hm-rega's enum of the
     * key is taken when there is none of the name (`Wohnzimmer` → `enum.rooms.LivingRoom`). Only the members of
     * this instance are managed (another instance on the same system, or the user, may have added others), and
     * only in the enums this adapter manages: an enum it does not want and never managed - one made by hand, or
     * one hm-rega made for a room the system does not have - is not touched. An enum this adapter created goes
     * when it has no members left; one that stays because another adapter has members in it is named in the log,
     * once. An enum is always written whole: `extendObject` merges arrays index-wise, so
     * a shorter member list would leave the old entries behind.
     *
     * @param wantedByName enum id → name, path and the members of this instance
     * @returns how many enum objects were written or removed
     */
    async syncEnums(wantedByName) {
        const ns = `${this.adapter.namespace}.`;
        const existing = {
            ...(await this.adapter.getForeignObjectsAsync('enum.rooms.*', 'enum')),
            ...(await this.adapter.getForeignObjectsAsync('enum.functions.*', 'enum')),
        };
        const wanted = new Map();
        for (const [byName, want] of wantedByName) {
            const id = !existing[byName] && want.builtin && (0, lite_1.isHmRegaEnumOf)(existing[want.builtin.id], want.builtin.key)
                ? want.builtin.id
                : byName;
            const same = wanted.get(id);
            if (same) {
                want.members.forEach(m => same.members.add(m));
            }
            else {
                wanted.set(id, want);
            }
        }
        let changed = 0;
        for (const [id, obj] of Object.entries(existing)) {
            const want = wanted.get(id);
            const mark = obj.native?.hmRpc;
            if (!want && !mark) {
                // not ours, never was: the user's, or a room of hm-rega the system does not have
                continue;
            }
            const members = membersOf(obj);
            const foreign = members.filter(m => !m.startsWith(ns));
            const ours = members.filter(m => m.startsWith(ns)).sort();
            const wantedOurs = want ? [...want.members].sort() : [];
            const adopted = mark?.adopted === true;
            if (!want && !adopted && foreign.length === 0) {
                await this.adapter.delForeignObjectAsync(id);
                changed++;
                continue;
            }
            if (!want && !adopted && !this.reported.has(id) && foreign.some(m => !m.startsWith('hm-rpc.'))) {
                // one this adapter created (also with the ids of 4.3.0/4.3.1) that somebody else put members into
                this.reported.add(id);
                this.adapter.log.info(`${id} is not a room or function of the system (any more). It is kept because it holds ` +
                    `members of other adapters, and can be deleted by hand if it is no longer needed`);
            }
            const membersChanged = JSON.stringify(ours) !== JSON.stringify(wantedOurs);
            const nameChanged = want !== undefined && mark !== undefined && !adopted && obj.common.name !== want.name;
            const adopt = want !== undefined && mark === undefined;
            if (membersChanged || nameChanged || adopt) {
                const next = structuredClone(obj);
                next.common.members = [...foreign, ...wantedOurs];
                if (nameChanged) {
                    next.common.name = want.name;
                }
                if (adopt) {
                    const native = { hmRpc: { path: want.path, adopted: true } };
                    next.native = { ...next.native, ...native };
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