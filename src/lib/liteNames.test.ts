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

    /** path → name of the nodes the tree has besides the direct nodes of the objects (the floors) */
    tree = new Map<string, string>([['room/eg', 'EG']]);

    private all(kind: string, opts: { inherit?: boolean; lang?: string }): { path: string; name: string }[] {
        expect(opts.lang).to.equal('de');
        const out = new Map(this.tree);
        for (const m of this.nodes.values()) {
            for (const n of [...m.rooms, ...m.functions]) {
                out.set(n.path, n.name);
            }
        }
        return [...out].filter(([path]) => path.startsWith(`${kind}/`)).map(([path, name]) => ({ path, name }));
    }

    rooms(opts: { inherit?: boolean; lang?: string }): { path: string; name: string }[] {
        return this.all('room', opts);
    }

    functions(opts: { inherit?: boolean; lang?: string }): { path: string; name: string }[] {
        return this.all('function', opts);
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
        const room = db.getObject('enum.rooms.EG_Wohnzimmer')!;
        expect(room.type).to.equal('enum');
        expect(room.common.name).to.equal('Wohnzimmer');
        expect(membersIn(db, 'enum.rooms.EG_Wohnzimmer')).to.deep.equal([CH1]);
        expect(room.native).to.deep.equal({ hmRpc: { path: 'room/eg/wohnzimmer' } });
        expect(db.getObject('enum.functions.Licht')!.common.name).to.equal('Licht');
        expect(membersIn(db, 'enum.functions.Licht')).to.deep.equal([CH1]);
        // the innermost room only: no enum for the floor
        expect(db.getObject('enum.rooms.EG')).to.be.undefined;
    });

    it('leaves the objects of an address the system no longer lists alone', async () => {
        names = new LiteNames(adapter, meta, IFACE, 'de', { known: address => !address.startsWith(DEVICE) });
        await names.apply();
        expect(db.getObject(DEV)!.common.name).to.equal(DEVICE);
        expect(db.getObject(CH1)!.common.name).to.equal(`${DEVICE}:1`);
        expect(db.getObject(`${CH1}.STATE`)!.common.name).to.equal('STATE');
        expect(db.getObject('enum.rooms.EG_Wohnzimmer')).to.be.undefined;
    });

    it('waits for the cleanup before it reads the objects', async () => {
        let release!: () => void;
        const cleanup = new Promise<void>(res => (release = res));
        names = new LiteNames(adapter, meta, IFACE, 'de', { settled: () => cleanup });
        const pass = names.apply();
        await new Promise(res => setTimeout(res, 50));
        expect(adapter.extendForeignObject.called, 'nothing renamed before the cleanup').to.equal(false);
        // the cleanup removes the device meanwhile: the pass must not bring any of it back
        for (const id of [...db.objects.keys()].filter(k => k.startsWith(DEV))) {
            db.deleteObject(id);
        }
        release();
        await pass;
        expect([...db.objects.keys()].filter(k => k.startsWith(DEV))).to.deep.equal([]);
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
        expect(db.getObject('enum.rooms.EG_Wohnzimmer')).to.be.undefined;
        expect(db.getObject('enum.functions.Licht')).to.be.undefined;
        expect(membersIn(db, 'enum.rooms.og_Bad')).to.deep.equal([CH1]);
    });

    it('manages only the members of its own namespace in an enum', async () => {
        db.publishObject({
            _id: 'enum.rooms.EG_Wohnzimmer',
            type: 'enum',
            common: { name: 'Living', members: ['hue.0.light1', 'hm-rpc.1.ABC.1', `${NS}.OLD.1`] },
            native: {},
        });
        await names.apply();
        const room = db.getObject('enum.rooms.EG_Wohnzimmer')!;
        // the other members stay, the stale one of this instance goes, the new one comes
        expect(membersIn(db, 'enum.rooms.EG_Wohnzimmer')).to.deep.equal(['hue.0.light1', 'hm-rpc.1.ABC.1', CH1]);
        // not this adapter's enum: its name is not touched, it is marked as taken over
        expect(room.common.name).to.equal('Living');
        expect(room.native).to.deep.equal({ hmRpc: { path: 'room/eg/wohnzimmer', adopted: true } });

        // the channel leaves the room: the enum of the user stays, without this instance
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, { rooms: [], functions: [] });
        await names.apply();
        expect(membersIn(db, 'enum.rooms.EG_Wohnzimmer')).to.deep.equal(['hue.0.light1', 'hm-rpc.1.ABC.1']);
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
            _id: 'enum.rooms.EG_Wohnzimmer',
            type: 'enum',
            common: { name: 'Living', members: ['hue.0.light1', `${NS}.OLD.1`] },
            native: {},
        });
        await names.apply();
        expect(membersIn(db, 'enum.rooms.EG_Wohnzimmer')).to.deep.equal(['hue.0.light1', CH1]);
    });

    it('keeps an enum of its own that another instance still uses', async () => {
        await names.apply();
        const room = db.getObject('enum.rooms.EG_Wohnzimmer')!;
        room.common.members = [CH1, 'hm-rpc.1.ABC.1'];
        db.publishObject(room);
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, { rooms: [], functions: [] });
        await names.apply();
        expect(membersIn(db, 'enum.rooms.EG_Wohnzimmer')).to.deep.equal(['hm-rpc.1.ABC.1']);
        expect(db.getObject('enum.rooms.EG_Wohnzimmer')!.native).to.deep.equal({
            hmRpc: { path: 'room/eg/wohnzimmer' },
        });
    });

    it('follows a rename of the node on the system with a new enum, as hm-rega does, and removes its own old one', async () => {
        await names.apply();
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, {
            rooms: [{ path: 'room/eg/wohnzimmer', name: 'Living room' }],
            functions: [{ path: 'function/licht', name: 'Licht' }],
        });
        await names.apply();
        expect(db.getObject('enum.rooms.EG_Wohnzimmer')).to.be.undefined;
        expect(db.getObject('enum.rooms.EG_Living room')!.common.name).to.equal('Living room');
        expect(membersIn(db, 'enum.rooms.EG_Living room')).to.deep.equal([CH1]);
    });

    it('renames an enum of its own when the name changes and the id does not', async () => {
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, { rooms: [{ path: 'room/eg-1', name: 'EG.1' }], functions: [] });
        await names.apply();
        expect(db.getObject('enum.rooms.EG_1')!.common.name).to.equal('EG.1');
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, { rooms: [{ path: 'room/eg-1', name: 'EG_1' }], functions: [] });
        await names.apply();
        expect(db.getObject('enum.rooms.EG_1')!.common.name).to.equal('EG_1');
    });

    it('carries on the enum hm-rega made of a CCU room: same id, its name, icon and other members kept', async () => {
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, {
            rooms: [{ path: 'room/living-room', name: 'Living Room' }],
            functions: [{ path: 'function/licht', name: 'Licht' }],
        });
        db.publishObject({
            _id: 'enum.rooms.Living Room',
            type: 'enum',
            common: { name: 'Living Room', icon: 'sofa.svg', members: ['hue.0.light1', `${NS}.OLD.1`] },
            native: { Name: 'Living Room', TypeName: 'ENUM', EnumInfo: '' },
        });
        await names.apply();
        const room = db.getObject('enum.rooms.Living Room')!;
        expect(membersIn(db, 'enum.rooms.Living Room')).to.deep.equal(['hue.0.light1', CH1]);
        expect(room.common.name).to.equal('Living Room');
        expect(room.common.icon).to.equal('sofa.svg');
        expect(room.native).to.deep.equal({
            Name: 'Living Room',
            TypeName: 'ENUM',
            EnumInfo: '',
            hmRpc: { path: 'room/living-room', adopted: true },
        });
        // no second enum of a slug or lower-cased id
        expect([...db.objects.keys()].filter(k => k.startsWith('enum.rooms.'))).to.deep.equal([
            'enum.rooms.Living Room',
        ]);

        // carried on: the node renamed on the system does not rename the enum, a second pass writes nothing
        adapter.setForeignObject.resetHistory();
        await names.apply();
        expect(adapter.setForeignObject.called).to.equal(false);
    });

    it('takes the enum hm-rega made of a CCU room the import named in German (Wohnzimmer → LivingRoom)', async () => {
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, {
            rooms: [{ path: 'room/wohnzimmer', name: 'Wohnzimmer' }],
            functions: [{ path: 'function/licht', name: 'Licht' }],
        });
        db.publishObject({
            _id: 'enum.rooms.LivingRoom',
            type: 'enum',
            common: { name: { en: 'LivingRoom', de: 'Wohnzimmer' }, members: [`${NS}.OLD.1`] },
            native: { Name: 'roomLivingRoom', TypeName: 'ENUM' },
        });
        db.publishObject({
            _id: 'enum.functions.Light',
            type: 'enum',
            common: { name: { en: 'Light', de: 'Licht' }, members: [] },
            native: { Name: '${funcLight}', TypeName: 'ENUM' },
        });
        await names.apply();
        expect(db.getObject('enum.rooms.Wohnzimmer')).to.be.undefined;
        expect(db.getObject('enum.functions.Licht')).to.be.undefined;
        expect(membersIn(db, 'enum.rooms.LivingRoom')).to.deep.equal([CH1]);
        expect(membersIn(db, 'enum.functions.Light')).to.deep.equal([CH1]);
        expect(db.getObject('enum.rooms.LivingRoom')!.common.name).to.deep.equal({
            en: 'LivingRoom',
            de: 'Wohnzimmer',
        });
        expect(db.getObject('enum.rooms.LivingRoom')!.native.hmRpc).to.deep.equal({
            path: 'room/wohnzimmer',
            adopted: true,
        });

        adapter.setForeignObject.resetHistory();
        await names.apply();
        expect(adapter.setForeignObject.called, 'stable on the next pass').to.equal(false);

        // the room leaves the system: the enum hm-rega made stays, without this instance
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, { rooms: [], functions: [] });
        await names.apply();
        expect(membersIn(db, 'enum.rooms.LivingRoom')).to.deep.equal([]);
        expect(membersIn(db, 'enum.functions.Light')).to.deep.equal([]);
    });

    it('prefers the enum of the name to hm-rega enum of the key, and takes no LivingRoom hm-rega did not make', async () => {
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, {
            rooms: [{ path: 'room/wohnzimmer', name: 'Wohnzimmer' }],
            functions: [{ path: 'function/licht', name: 'Licht' }],
        });
        db.publishObject({
            _id: 'enum.rooms.Wohnzimmer',
            type: 'enum',
            common: { name: 'Wohnzimmer', members: [] },
            native: { Name: 'Wohnzimmer', TypeName: 'ENUM' },
        });
        db.publishObject({
            _id: 'enum.rooms.LivingRoom',
            type: 'enum',
            common: { name: 'LivingRoom', members: [] },
            native: { Name: 'roomLivingRoom' },
        });
        db.publishObject({
            _id: 'enum.functions.Light',
            type: 'enum',
            common: { name: 'Light', members: [] },
            native: {},
        });
        await names.apply();
        expect(membersIn(db, 'enum.rooms.Wohnzimmer')).to.deep.equal([CH1]);
        expect(membersIn(db, 'enum.rooms.LivingRoom')).to.deep.equal([]);
        expect(membersIn(db, 'enum.functions.Licht')).to.deep.equal([CH1]);
        expect(membersIn(db, 'enum.functions.Light')).to.deep.equal([]);
        expect(db.getObject('enum.functions.Light')!.native).to.deep.equal({});
    });

    it('unites the members when a built-in room and a room of the same id land in one enum', async () => {
        meta.nodes.set(`${IFACE}.${DEVICE}:1`, {
            rooms: [{ path: 'room/wohnzimmer', name: 'Wohnzimmer' }],
            functions: [],
        });
        meta.nodes.set(`${IFACE}.${DEVICE}:0`, { rooms: [{ path: 'room/lr', name: 'LivingRoom' }], functions: [] });
        db.publishObject({
            _id: 'enum.rooms.LivingRoom',
            type: 'enum',
            common: { name: 'LivingRoom', members: [] },
            native: { Name: 'roomLivingRoom' },
        });
        await names.apply();
        expect(membersIn(db, 'enum.rooms.LivingRoom')).to.deep.equal([CH0, CH1]);
        expect(db.getObject('enum.rooms.Wohnzimmer')).to.be.undefined;
    });

    it('leaves an enum alone it does not manage, even with members of this instance (made by hand, or in admin)', async () => {
        db.publishObject({
            _id: 'enum.rooms.living_room',
            type: 'enum',
            common: { name: { en: 'Living room', de: 'Wohnzimmer' }, members: [CH1, `${NS}.OLD.1`] },
            native: {},
        });
        await names.apply();
        expect(membersIn(db, 'enum.rooms.living_room')).to.deep.equal([CH1, `${NS}.OLD.1`]);
        expect(db.getObject('enum.rooms.living_room')!.native).to.deep.equal({});
        expect(membersIn(db, 'enum.rooms.EG_Wohnzimmer')).to.deep.equal([CH1]);
    });

    it('removes the enums of an earlier id rule it made itself when they hold nothing else (living-room)', async () => {
        db.publishObject({
            _id: 'enum.rooms.eg_wohnzimmer',
            type: 'enum',
            common: { name: 'Wohnzimmer', members: [CH1] },
            native: { hmRpc: { path: 'room/eg/wohnzimmer' } },
        });
        db.publishObject({
            _id: 'enum.rooms.living-room',
            type: 'enum',
            common: { name: 'Living Room', members: [CH1, 'hue.0.light1'] },
            native: { hmRpc: { path: 'room/living-room' } },
        });
        await names.apply();
        expect(db.getObject('enum.rooms.eg_wohnzimmer')).to.be.undefined;
        // one with a member of another adapter stays, without this instance
        expect(membersIn(db, 'enum.rooms.living-room')).to.deep.equal(['hue.0.light1']);
        expect(membersIn(db, 'enum.rooms.EG_Wohnzimmer')).to.deep.equal([CH1]);
    });

    it('skips objects without an address and enum objects without members', async () => {
        db.publishObject({ _id: `${NS}.odd`, type: 'device', common: { name: 'odd' }, native: {} });
        db.publishObject({ _id: 'enum.rooms.manual', type: 'enum', common: { name: 'Manual' }, native: {} });
        db.publishObject({ _id: 'enum.functions.Licht', type: 'enum', common: { name: 'Licht' }, native: {} });
        await names.apply();
        expect(db.getObject(`${NS}.odd`)!.common.name).to.equal('odd');
        expect(db.getObject('enum.rooms.manual')!.common.name).to.equal('Manual');
        expect(membersIn(db, 'enum.functions.Licht')).to.deep.equal([CH1]);
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
