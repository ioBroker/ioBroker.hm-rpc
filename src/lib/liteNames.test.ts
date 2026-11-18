import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import type { MockAdapter, MockDatabase } from '@iobroker/testing';
import { LiteNames, type MetaReader } from './liteNames';
import { createMocks, DEVICE, IFACE, stopTimers } from './liteTestUtil';

const NS = 'hm-rpc.0';

/** the members of an enum in the mock database (which stores an array as an index-keyed object) */
function membersIn(db: MockDatabase, id: string): string[] | undefined {
    const obj = db.getObject(id);
    return obj ? Object.values(obj.common.members ?? {}) : undefined;
}
const DEV = `${NS}.${DEVICE}`;
const CH1 = `${DEV}.1`;
const CH0 = `${DEV}.0`;

/** A metadata copy the tests control: names and direct nodes per ref */
class FakeMeta implements MetaReader {
    names = new Map<string, string>();
    nodes = new Map<string, { rooms: { path: string; name: string }[]; functions: { path: string; name: string }[] }>();

    name(ref: string): string | undefined {
        return this.names.get(ref);
    }

    membership(
        ref: string,
        opts: { inherit?: boolean; lang?: string },
    ): { rooms: { path: string; name: string }[]; functions: { path: string; name: string }[] } {
        expect(opts.inherit, 'the direct nodes only').to.equal(false);
        return this.nodes.get(ref) ?? { rooms: [], functions: [] };
    }
}

describe('LiteNames', () => {
    let adapter: MockAdapter;
    let db: MockDatabase;
    let meta: FakeMeta;
    let names: LiteNames;

    /** the objects an instance holds after createDevices: a device, two channels, their states, info.* and updated */
    function publishObjects(): void {
        db.publishObject({
            _id: DEV,
            type: 'device',
            common: { name: DEVICE },
            native: { ADDRESS: DEVICE, TYPE: 'HmIP-PS' },
        });
        db.publishObject({
            _id: CH0,
            type: 'channel',
            common: { name: `${DEVICE}:0` },
            native: { ADDRESS: `${DEVICE}:0` },
        });
        db.publishObject({
            _id: CH1,
            type: 'channel',
            common: { name: `${DEVICE}:1` },
            native: { ADDRESS: `${DEVICE}:1` },
        });
        db.publishObject({ _id: `${CH1}.STATE`, type: 'state', common: { name: 'STATE' }, native: {} });
        db.publishObject({ _id: `${CH1}.LEVEL`, type: 'state', common: { name: 'LEVEL' }, native: {} });
        db.publishObject({ _id: `${CH0}.UNREACH`, type: 'state', common: { name: 'UNREACH' }, native: {} });
        db.publishObject({ _id: `${NS}.info`, type: 'channel', common: { name: 'Information' }, native: {} });
        db.publishObject({ _id: `${NS}.info.connection`, type: 'state', common: { name: 'connected' }, native: {} });
        db.publishObject({ _id: `${NS}.updated`, type: 'state', common: { name: 'New devices added' }, native: {} });
    }

    beforeEach(() => {
        ({ adapter, database: db } = createMocks());
        meta = new FakeMeta();
        meta.names.set(`${IFACE}.${DEVICE}`, 'Stehlampe');
        meta.names.set(`${IFACE}.${DEVICE}:1`, 'Stehlampe Schalter');
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, {
            rooms: [{ path: 'room/eg/wohnzimmer', name: 'Wohnzimmer' }],
            functions: [{ path: 'function/licht', name: 'Licht' }],
        });
        publishObjects();
        names = new LiteNames(adapter, meta, IFACE, 'de');
    });

    afterEach(() => {
        names.stop();
        stopTimers();
    });

    it('names the devices, channels and datapoints as the system does', async () => {
        await names.apply();
        expect(db.getObject(DEV)!.common.name).to.equal('Stehlampe');
        expect(db.getObject(CH1)!.common.name).to.equal('Stehlampe Schalter');
        expect(db.getObject(`${CH1}.STATE`)!.common.name).to.equal('Stehlampe Schalter.STATE');
        expect(db.getObject(`${CH1}.LEVEL`)!.common.name).to.equal('Stehlampe Schalter.LEVEL');
        // a channel without a name on the system keeps the address, its datapoints their own name
        expect(db.getObject(CH0)!.common.name).to.equal(`${DEVICE}:0`);
        expect(db.getObject(`${CH0}.UNREACH`)!.common.name).to.equal('UNREACH');
        // info.* and updated are not datapoints of a channel
        expect(db.getObject(`${NS}.info.connection`)!.common.name).to.equal('connected');
        expect(db.getObject(`${NS}.updated`)!.common.name).to.equal('New devices added');
        expect(adapter.log.info.calledWithMatch(/4 object\(s\) renamed, 2 enum\(s\) changed/)).to.equal(true);
    });

    it('creates the enums of the direct nodes with this instance as member, marked as its own', async () => {
        await names.apply();
        const room = db.getObject('enum.rooms.eg_wohnzimmer')!;
        expect(room.type).to.equal('enum');
        expect(room.common.name).to.equal('Wohnzimmer');
        expect(membersIn(db, 'enum.rooms.eg_wohnzimmer')).to.deep.equal([CH1]);
        expect(room.native).to.deep.equal({ hmRpc: { path: 'room/eg/wohnzimmer' } });
        expect(db.getObject('enum.functions.licht')!.common.name).to.equal('Licht');
        expect(membersIn(db, 'enum.functions.licht')).to.deep.equal([CH1]);
        // the innermost room only: no enum for the floor
        expect(db.getObject('enum.rooms.eg')).to.be.undefined;
    });

    it('writes nothing when nothing changed', async () => {
        await names.apply();
        adapter.extendForeignObject.resetHistory();
        adapter.setForeignObject.resetHistory();
        adapter.log.info.resetHistory();
        const before = JSON.stringify([...db.objects]);
        await names.apply();
        expect(adapter.extendForeignObject.called).to.equal(false);
        expect(adapter.setForeignObject.called).to.equal(false);
        expect(adapter.log.info.called).to.equal(false);
        expect(JSON.stringify([...db.objects])).to.equal(before);
    });

    it('follows a rename on the system', async () => {
        await names.apply();
        meta.names.set(`${IFACE}.${DEVICE}:1`, 'Deckenlampe');
        await names.apply();
        expect(db.getObject(CH1)!.common.name).to.equal('Deckenlampe');
        expect(db.getObject(`${CH1}.STATE`)!.common.name).to.equal('Deckenlampe.STATE');
    });

    it('falls back to the address when the name is removed on the system', async () => {
        await names.apply();
        meta.names.delete(`${IFACE}.${DEVICE}`);
        await names.apply();
        expect(db.getObject(DEV)!.common.name).to.equal(DEVICE);
    });

    it('moves the member when the channel changes its room, and removes an enum of its own that is empty', async () => {
        await names.apply();
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, { rooms: [{ path: 'room/og/bad', name: 'Bad' }], functions: [] });
        await names.apply();
        expect(db.getObject('enum.rooms.eg_wohnzimmer')).to.be.undefined;
        expect(db.getObject('enum.functions.licht')).to.be.undefined;
        expect(membersIn(db, 'enum.rooms.og_bad')).to.deep.equal([CH1]);
    });

    it('manages only the members of its own namespace in an enum', async () => {
        db.publishObject({
            _id: 'enum.rooms.eg_wohnzimmer',
            type: 'enum',
            common: { name: 'Living', members: ['hue.0.light1', 'hm-rpc.1.ABC.1', `${NS}.OLD.1`] },
            native: {},
        });
        await names.apply();
        const room = db.getObject('enum.rooms.eg_wohnzimmer')!;
        // the other members stay, the stale one of this instance goes, the new one comes
        expect(membersIn(db, 'enum.rooms.eg_wohnzimmer')).to.deep.equal(['hue.0.light1', 'hm-rpc.1.ABC.1', CH1]);
        // not this adapter's enum: its name is not touched
        expect(room.common.name).to.equal('Living');
        expect(room.native).to.deep.equal({});

        // the channel leaves the room: the enum of the user stays, without this instance
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, { rooms: [], functions: [] });
        await names.apply();
        expect(membersIn(db, 'enum.rooms.eg_wohnzimmer')).to.deep.equal(['hue.0.light1', 'hm-rpc.1.ABC.1']);
    });

    it('reads the members as the controller stores them, an array', async () => {
        const original = adapter.getForeignObjectsAsync;
        (adapter as any).getForeignObjectsAsync = async (pattern: string, type: string) => {
            const objects = (await original.call(adapter, pattern, type)) as Record<string, ioBroker.Object>;
            for (const obj of Object.values(objects)) {
                if (obj.type === 'enum' && obj.common.members) {
                    obj.common.members = Object.values(obj.common.members);
                }
            }
            return objects;
        };
        db.publishObject({
            _id: 'enum.rooms.eg_wohnzimmer',
            type: 'enum',
            common: { name: 'Living', members: ['hue.0.light1', `${NS}.OLD.1`] },
            native: {},
        });
        await names.apply();
        expect(membersIn(db, 'enum.rooms.eg_wohnzimmer')).to.deep.equal(['hue.0.light1', CH1]);
    });

    it('keeps an enum of its own that another instance still uses', async () => {
        await names.apply();
        const room = db.getObject('enum.rooms.eg_wohnzimmer')!;
        room.common.members = [CH1, 'hm-rpc.1.ABC.1'];
        db.publishObject(room);
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, { rooms: [], functions: [] });
        await names.apply();
        expect(membersIn(db, 'enum.rooms.eg_wohnzimmer')).to.deep.equal(['hm-rpc.1.ABC.1']);
        expect(db.getObject('enum.rooms.eg_wohnzimmer')!.native).to.deep.equal({
            hmRpc: { path: 'room/eg/wohnzimmer' },
        });
    });

    it('renames an enum of its own when the node is renamed on the system', async () => {
        await names.apply();
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, {
            rooms: [{ path: 'room/eg/wohnzimmer', name: 'Living room' }],
            functions: [{ path: 'function/licht', name: 'Licht' }],
        });
        await names.apply();
        expect(db.getObject('enum.rooms.eg_wohnzimmer')!.common.name).to.equal('Living room');
    });

    it('skips objects without an address and enum objects without members', async () => {
        db.publishObject({ _id: `${NS}.odd`, type: 'device', common: { name: 'odd' }, native: {} });
        db.publishObject({ _id: 'enum.rooms.manual', type: 'enum', common: { name: 'Manual' }, native: {} });
        await names.apply();
        expect(db.getObject(`${NS}.odd`)!.common.name).to.equal('odd');
        expect(db.getObject('enum.rooms.manual')!.common.name).to.equal('Manual');
    });

    it('runs one more pass when asked for during a pass, and reports an error of a pass as a warning', async () => {
        const original = adapter.getForeignObjectsAsync;
        let calls = 0;
        (adapter as any).getForeignObjectsAsync = (pattern: string, type: string) => {
            calls++;
            if (calls === 1) {
                return Promise.reject(new Error('db gone'));
            }
            return original.call(adapter, pattern, type);
        };
        const first = names.apply();
        const second = names.apply();
        expect(second).to.equal(first);
        await first;
        expect(adapter.log.warn.calledWithMatch(/Could not apply the names of the system: db gone/)).to.equal(true);
        // the pass asked for during the failed one ran afterwards and applied the names
        await new Promise(res => setTimeout(res, 50));
        expect(db.getObject(DEV)!.common.name).to.equal('Stehlampe');
    });

    it('schedule() debounces several changes into one pass, stop() cancels it', async () => {
        const original = adapter.getForeignObjectsAsync;
        let reads = 0;
        (adapter as any).getForeignObjectsAsync = (pattern: string, type: string) => {
            reads++;
            return original.call(adapter, pattern, type);
        };
        names.schedule(30);
        names.schedule(30);
        names.schedule(30);
        await new Promise(res => setTimeout(res, 120));
        expect(reads).to.equal(5); // one pass: devices, channels, states, two enum kinds
        expect(db.getObject(DEV)!.common.name).to.equal('Stehlampe');

        reads = 0;
        names.schedule(30);
        names.stop();
        await new Promise(res => setTimeout(res, 80));
        expect(reads).to.equal(0);
        names.stop();
    });
});
