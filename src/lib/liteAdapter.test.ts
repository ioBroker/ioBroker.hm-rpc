/**
 * The adapter in the openccu-lite mode, end to end: the real HomematicRpc class on the adapter mock of
 * `@iobroker/testing` (its adapter-core replaced through the module loader, as the package's own startMockAdapter did),
 * against occulite-client's FakeBox.
 */

import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import Module from 'node:module';
import path from 'node:path';
import { MockDatabase, type MockAdapter } from '@iobroker/testing';
import type { FakeBox } from 'occulite-client/testing';
import {
    completeAdapterMock,
    DEVICE,
    IFACE,
    liteUrlPartsOf,
    startFakeBox,
    stopTimers,
    TOKEN,
    waitFor,
} from './liteTestUtil';

const NS = 'hm-rpc.0';
const DEV = `${NS}.${DEVICE}`;
const CH1 = `${DEV}.1`;
const CH0 = `${DEV}.0`;

type Adapter = MockAdapter & {
    readyHandler: () => Promise<void>;
    stateChangeHandler: (id: string, state: ioBroker.State | null) => Promise<void>;
    messageHandler: (obj: ioBroker.Message) => Promise<void>;
    unloadHandler: (cb: () => void) => Promise<void>;
    restartCalls: number;
};

/**
 * Loads main.ts afresh with the adapter-core mock and creates the adapter with the configuration; the ready handler
 * is not run yet
 */
function createAdapter(db: MockDatabase, config: Record<string, unknown>): Adapter {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the mock is not exported by the package
    const { mockAdapterCore } = require('@iobroker/testing/build/tests/unit/mocks/mockAdapterCore');
    const core = mockAdapterCore(db, {
        adapterDir: path.join(__dirname, '..', '..'),
        onAdapterCreated: (adapter: MockAdapter) => completeAdapterMock(adapter, db),
    });
    const originalLoad = (Module as any)._load;
    (Module as any)._load = function (request: string, ...rest: unknown[]) {
        return request === '@iobroker/adapter-core' ? core : originalLoad.call(this, request, ...rest);
    };
    try {
        const mainPath = require.resolve('../main');
        delete require.cache[mainPath];
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- main.ts exports its factory for CommonJS
        const create = require(mainPath);
        return create({ config });
    } finally {
        (Module as any)._load = originalLoad;
    }
}

/** A message of the admin to the instance, answered through sendTo */
async function send(
    adapter: Adapter,
    handler: Adapter['messageHandler'],
    command: string,
    message: unknown,
): Promise<any> {
    adapter.sendTo.resetHistory();
    await handler({ command, message, from: 'system.adapter.admin.0', callback: { id: 1 } } as any);
    expect(adapter.sendTo.callCount, 'one answer').to.equal(1);
    const [to, cmd, response] = adapter.sendTo.firstCall.args;
    expect(to).to.equal('system.adapter.admin.0');
    expect(cmd).to.equal(command);
    return response;
}

describe('hm-rpc in the openccu-lite mode', function () {
    this.timeout(20_000);

    let box: FakeBox | undefined;
    let db: MockDatabase;
    let adapter: Adapter | undefined;

    function liteConfig(extra: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            daemon: 'openccu-lite',
            ...liteUrlPartsOf(box!.url),
            liteInterface: IFACE,
            liteToken: TOKEN,
            liteFingerprint: '',
            liteNames: true,
            type: 'xml',
            forceReInit: false,
            dontDelete: false,
            checkInitInterval: 180,
            reconnectInterval: 30,
            ...extra,
        };
    }

    /** the adapter's own message handler: the device manager registers another one at ready */
    let onMessage: Adapter['messageHandler'];

    async function start(config: Record<string, unknown>): Promise<Adapter> {
        adapter = createAdapter(db, config);
        onMessage = adapter.messageHandler;
        await adapter.readyHandler();
        return adapter;
    }

    /** waits until the device snapshot was turned into objects */
    async function created(): Promise<void> {
        await waitFor(() => db.getObject(`${CH1}.LEVEL`) !== undefined, 5000, 'the objects of the snapshot');
    }

    /** waits until the names pass has named the device */
    async function named(): Promise<void> {
        await waitFor(() => db.getObject(DEV)?.common.name === 'Stehlampe', 5000, 'the names');
    }

    beforeEach(() => {
        db = new MockDatabase();
    });

    afterEach(async () => {
        if (adapter) {
            await new Promise<void>(res => void adapter!.unloadHandler(res));
            adapter = undefined;
        }
        stopTimers();
        await box?.stop();
        box = undefined;
    });

    describe('unpaired', () => {
        it('waits for the pairing: creates info.pairing, stays disconnected and does not connect', async () => {
            box = await startFakeBox();
            await start(liteConfig({ liteToken: '' }));
            expect(db.getObject(`${NS}.info.pairing`)?.type).to.equal('state');
            expect(db.getState(`${NS}.info.pairing`)?.val).to.equal('');
            expect(db.getState(`${NS}.info.connection`)?.val).to.equal(false);
            expect(adapter!.log.info.calledWithMatch(/Not paired with an openccu-lite system yet/)).to.equal(true);
            expect(box.streamsOpened).to.equal(0);
        });

        it('keeps English when the system language cannot be read', async () => {
            box = await startFakeBox();
            adapter = createAdapter(db, { daemon: 'HMIP', homematicAddress: '', liteToken: '' });
            adapter.getForeignObjectAsync = (() => Promise.reject(new Error('db gone'))) as any;
            // a CCU instance: the pairing runner is created with the first request of the admin
            expect(await send(adapter, adapter.messageHandler, 'lite:pair', { address: '' })).to.deep.equal({
                error: 'no-url',
            });
            expect(adapter.log.debug.calledWithMatch(/Cannot read the system language: db gone/)).to.equal(true);
            expect(db.getState(`${NS}.info.pairing`)?.val).to.contain('Enter the address');
        });

        it('reads the system language for the pairing texts', async () => {
            box = await startFakeBox();
            db.publishObject({ _id: 'system.config', type: 'config', common: { language: 'de' }, native: {} });
            await start(liteConfig({ liteToken: '' }));
            const response = await send(adapter!, onMessage, 'lite:pair', { address: '', port: '', https: 'true' });
            expect(response).to.deep.equal({ error: 'no-url' });
            expect(db.getState(`${NS}.info.pairing`)?.val).to.contain('Zuerst die Adresse');
        });
    });

    describe('connected', () => {
        it('creates the objects of the device snapshot, connects, names them and seeds the values', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            await created();
            expect(db.getObject(DEV)?.type).to.equal('device');
            expect(db.getObject(DEV)?.native.TYPE).to.equal('HmIP-PS');
            expect(db.getObject(CH1)?.type).to.equal('channel');
            const state = db.getObject(`${CH1}.STATE`)!;
            expect(state.type).to.equal('state');
            expect(state.common.type).to.equal('boolean');
            expect(state.common.write).to.equal(true);
            expect(db.getObject(`${CH1}.LEVEL`)?.common.type).to.equal('number');
            expect(db.getObject(`${CH0}.UNREACH`)?.common.role).to.equal('indicator.unreach');
            // the firmware update state of the device
            expect(db.getState(`${CH0}.FIRMWARE_UPDATE_STATE`)?.val).to.equal('UP_TO_DATE');
            // the paramset descriptions were asked through lite-rpc, listDevices never
            expect(box.calls.filter(c => c.method === 'getParamsetDescription').length).to.equal(2);
            expect(box.calls.some(c => c.method === 'listDevices')).to.equal(false);
            expect(box.calls.some(c => c.method === 'init' || c.method === 'ping')).to.equal(false);
            expect(db.getState(`${NS}.info.connection`)?.val).to.equal(true);
            // the values of the state store: the confirmed ones, through the event path
            expect(db.getState(`${CH1}.STATE`)?.val).to.equal(true);
            expect(db.getState(`${CH1}.STATE`)?.ack).to.equal(true);
            expect(db.getState(`${CH0}.UNREACH`)?.val).to.equal(false);
            expect(db.getState(`${CH0}.LOW_BAT`)).to.be.undefined; // not confirmed since the system started
            // the names of the system
            await named();
            expect(db.getObject(CH1)?.common.name).to.equal('Stehlampe Schalter');
            expect(db.getObject(`${CH1}.STATE`)?.common.name).to.equal('Stehlampe Schalter.STATE');
            expect(db.getObject(CH0)?.common.name).to.equal(`${DEVICE}:0`);
            const room = db.getObject('enum.rooms.eg_wohnzimmer')!;
            expect(room.common.name).to.equal('Living room'); // the system language defaults to English
            expect(Object.values(room.common.members)).to.deep.equal([CH1]);
            expect(Object.values(db.getObject('enum.functions.licht')!.common.members)).to.deep.equal([CH1]);
            // one instance, one interface: the daemon follows the interface
            expect(adapter!.config.daemon).to.equal('HMIP');
            expect(adapter!.log.error.called, JSON.stringify(adapter!.log.error.args)).to.equal(false);
        });

        it('writes the events of the stream into the states, single and as multicall', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            await created();
            box.event(IFACE, `${DEVICE}:1`, 'STATE', false);
            await waitFor(() => db.getState(`${CH1}.STATE`)?.val === false, 3000, 'the event');
            const batch = box.nextSeq();
            box.event(IFACE, `${DEVICE}:0`, 'UNREACH', true, batch);
            box.event(IFACE, `${DEVICE}:1`, 'LEVEL', 0.5, batch);
            await waitFor(() => db.getState(`${CH0}.UNREACH`)?.val === true, 3000, 'the multicall');
            expect(db.getState(`${CH1}.LEVEL`)?.val).to.equal(0.5);
            // an event of a device the instance does not know is discarded
            box.event(IFACE, 'UNKNOWN0001:1', 'STATE', true);
            await new Promise(res => setTimeout(res, 100));
            expect(db.getState(`${NS}.UNKNOWN0001.1.STATE`)).to.be.undefined;
        });

        it('sends a state change as setValue through lite-rpc, a FLOAT as explicit double', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            await created();
            await adapter!.stateChangeHandler(`${CH1}.STATE`, { val: true, ack: false } as ioBroker.State);
            expect(box.calls.at(-1)).to.deep.equal({
                interface: IFACE,
                method: 'setValue',
                params: [`${DEVICE}:1`, 'STATE', true],
            });
            await adapter!.stateChangeHandler(`${CH1}.LEVEL`, { val: 0.25, ack: false } as ioBroker.State);
            expect(box.calls.at(-1)).to.deep.equal({
                interface: IFACE,
                method: 'setValue',
                params: [`${DEVICE}:1`, 'LEVEL', { explicitDouble: 0.25 }],
            });
        });

        it('answers the custom commands of scripts through lite-rpc', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            // the adapter's own description reads first, so the last call is the script's
            await created();
            const response = await send(adapter!, onMessage, 'getParamsetDescription', {
                ID: `${DEVICE}:1`,
                paramType: 'VALUES',
            });
            expect(response.error).to.equal(null);
            expect(response.result.STATE.TYPE).to.equal('BOOL');
            expect(box.calls.at(-1)).to.deep.equal({
                interface: IFACE,
                method: 'getParamsetDescription',
                params: [`${DEVICE}:1`, 'VALUES'],
            });
        });

        it('follows a rename and a room change on the system live', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            await named();
            const meta = box.opts.meta!;
            meta.objects[`${IFACE}.${DEVICE}:1`] = { name: 'Deckenlampe', enums: ['room/og/bad'] };
            meta.revision++;
            box.metaEvent({
                revision: meta.revision,
                kind: 'object.updated',
                ref: `${IFACE}.${DEVICE}:1`,
                value: meta.objects[`${IFACE}.${DEVICE}:1`],
            });
            await waitFor(() => db.getObject(CH1)?.common.name === 'Deckenlampe', 5000, 'the rename');
            await waitFor(
                () => db.getObject(`${CH1}.STATE`)?.common.name === 'Deckenlampe.STATE',
                3000,
                'the datapoint names',
            );
            await waitFor(() => db.getObject('enum.rooms.eg_wohnzimmer') === undefined, 3000, 'the old room gone');
            expect(Object.values(db.getObject('enum.rooms.og_bad')!.common.members)).to.deep.equal([CH1]);
            expect(db.getObject('enum.rooms.og_bad')!.common.name).to.equal('Bad');
            expect(db.getObject('enum.functions.licht')).to.be.undefined;
        });

        it('follows a new room once the snapshot is read again', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            await named();
            const meta = box.opts.meta!;
            const rooms = meta.enums.room as { tree: { children: { id: string; name: string }[] }[] };
            rooms.tree[1].children.push({ id: 'kind', name: 'Kinderzimmer' });
            meta.objects[`${IFACE}.${DEVICE}:1`] = {
                name: 'Stehlampe Schalter',
                enums: ['room/og/kind', 'function/licht'],
            };
            meta.revision++;
            // a created node is no change the copy applies in place: the client reads the snapshot again
            box.metaEvent({ revision: meta.revision, kind: 'node.created', enum: 'room', path: 'og/kind' });
            await waitFor(() => db.getObject('enum.rooms.og_kind') !== undefined, 5000, 'the new room');
            expect(Object.values(db.getObject('enum.rooms.og_kind')!.common.members)).to.deep.equal([CH1]);
            expect(db.getObject('enum.rooms.og_kind')!.common.name).to.equal('Kinderzimmer');
        });

        it('removes stale objects with the snapshot, unless "Don\'t delete devices" is set', async () => {
            box = await startFakeBox();
            db.publishObject({
                _id: `${NS}.OLD0000001`,
                type: 'device',
                common: { name: 'old' },
                native: { ADDRESS: 'OLD0000001', VERSION: 1 },
            });
            db.publishObject({
                _id: `${NS}.OLD0000001.1`,
                type: 'channel',
                common: { name: 'old:1' },
                native: { ADDRESS: 'OLD0000001:1', VERSION: 1 },
            });
            db.publishObject({
                _id: `${NS}.OLD0000001.1.STATE`,
                type: 'state',
                common: { name: 'STATE', type: 'boolean' },
                native: { TYPE: 'BOOL' },
            });
            await start(liteConfig());
            await waitFor(() => db.getObject(`${NS}.OLD0000001`) === undefined, 5000, 'the stale device gone');
            expect(db.getObject(`${NS}.OLD0000001.1`)).to.be.undefined;
            expect(db.getObject(DEV)).not.to.be.undefined;
            await new Promise<void>(res => void adapter!.unloadHandler(res));
            adapter = undefined;

            db = new MockDatabase();
            db.publishObject({
                _id: `${NS}.OLD0000001`,
                type: 'device',
                common: { name: 'old' },
                native: { ADDRESS: 'OLD0000001', VERSION: 1 },
            });
            await start(liteConfig({ dontDelete: true }));
            await created();
            expect(db.getObject(`${NS}.OLD0000001`)).not.to.be.undefined;
        });

        it('keeps the known devices and their names across a reconnect', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            await named();
            const calls = box.calls.length;
            box.dropStreams();
            await waitFor(() => db.getState(`${NS}.info.connection`)?.val === false, 5000, 'disconnected');
            expect(adapter!.log.info.calledWithMatch(/Disconnected \(degraded\)/)).to.equal(true);
            await waitFor(() => db.getState(`${NS}.info.connection`)?.val === true, 8000, 'connected again');
            // the snapshot came again, nothing was created anew
            expect(box.calls.slice(calls).filter(c => c.method === 'getParamsetDescription')).to.deep.equal([]);
            expect(db.getObject(DEV)?.common.name).to.equal('Stehlampe');
        });

        it('seeds the values again after a restart of the system', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            await created();
            box.opts.values![`${IFACE}.${DEVICE}:1.STATE`] = { value: false, confirmed: true };
            box.bootId = 'boot2';
            box.dropStreams();
            await waitFor(() => db.getState(`${CH1}.STATE`)?.val === false, 8000, 'the resync');
        });

        it('deletes and adds devices as the system reports them', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            await created();
            box.push('deleteDevices', { interface: IFACE, addresses: [`${DEVICE}:1`] });
            await waitFor(() => db.getObject(CH1) === undefined, 3000, 'the channel gone');
            expect(db.getObject(DEV)).not.to.be.undefined;

            box.opts.devices![IFACE].push(
                {
                    ADDRESS: 'NEW000000001',
                    TYPE: 'HmIP-SWDO',
                    VERSION: 1,
                    CHILDREN: ['NEW000000001:1'],
                    PARAMSETS: ['MASTER'],
                },
                {
                    ADDRESS: 'NEW000000001:1',
                    TYPE: 'SHUTTER_CONTACT_TRANSCEIVER',
                    PARENT: 'NEW000000001',
                    PARENT_TYPE: 'HmIP-SWDO',
                    VERSION: 1,
                    PARAMSETS: ['MASTER', 'VALUES'],
                },
            );
            box.opts.descriptions!['HmIP-RF.NEW000000001:1'] = { STATE: { TYPE: 'ENUM', OPERATIONS: 5 } };
            box.push('newDevices', { interface: IFACE, addresses: ['NEW000000001', 'NEW000000001:1'] });
            await waitFor(() => db.getObject(`${NS}.NEW000000001.1.STATE`) !== undefined, 5000, 'the new device');
            expect(db.getObject(`${NS}.NEW000000001`)?.type).to.equal('device');
        });

        it('replaces a device', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            await created();
            box.opts.devices![IFACE].push({
                ADDRESS: 'NEW000000002',
                TYPE: 'HmIP-PS',
                VERSION: 1,
                CHILDREN: [],
                PARAMSETS: ['MASTER'],
            });
            box.replaceDevice(IFACE, DEVICE, 'NEW000000002');
            await waitFor(() => db.getObject(DEV) === undefined, 3000, 'the old device gone');
            // the replacement is read with getDeviceDescription, which the fake system does not know: logged, not fatal
            await waitFor(
                () => adapter!.log.error.calledWithMatch(/replacement device "NEW000000002"/),
                3000,
                'the log',
            );
        });

        it('switches the names off', async () => {
            box = await startFakeBox();
            await start(liteConfig({ liteNames: false }));
            await new Promise(res => setTimeout(res, 500));
            expect(db.getObject(DEV)?.common.name).to.equal(DEVICE);
            expect(db.getObject('enum.rooms.eg_wohnzimmer')).to.be.undefined;
        });

        it('stops without an init call and closes the stream', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            await created();
            await new Promise<void>(res => void adapter!.unloadHandler(res));
            adapter = undefined;
            expect(box.calls.some(c => c.method === 'init')).to.equal(false);
            expect(db.getState(`${NS}.info.connection`)?.val).to.equal(false);
        });
    });

    describe('connection failures', () => {
        it('does not retry a refused token, asks for a new pairing', async () => {
            box = await startFakeBox();
            await start(liteConfig({ liteToken: 'olt_wrong' }));
            expect(adapter!.log.error.calledWithMatch(/Pair the instance again/)).to.equal(true);
            expect(adapter!.restartCalls).to.equal(0);
            expect(db.getState(`${NS}.info.connection`)?.val).to.equal(false);
            // a state change finds no connection
            await adapter!.stateChangeHandler(`${CH1}.STATE`, { val: true, ack: false } as ioBroker.State);
            expect(box.calls.some(c => c.method === 'setValue')).to.equal(false);
        });

        it('restarts later when the system is no openccu-lite system', async () => {
            const http = await import('node:http');
            const server = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html>WebUI</html>');
            });
            await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
            const port = (server.address() as { port: number }).port;
            try {
                box = await startFakeBox(); // only for liteConfig's address fields
                await start(
                    liteConfig({ homematicAddress: '127.0.0.1', homematicPort: String(port), useHttps: false }),
                );
                expect(adapter!.log.error.calledWithMatch(/Restarting in 30 seconds/)).to.equal(true);
            } finally {
                await new Promise(res => server.close(res));
            }
        });
    });

    describe('the messages of the instance settings', () => {
        it('pairs: shows the code, stores the token and the address the system answered', async () => {
            box = await startFakeBox();
            await start(liteConfig({ liteToken: '' }));
            const parts = liteUrlPartsOf(box.url);
            const pending = send(adapter!, onMessage, 'lite:pair', {
                address: parts.homematicAddress,
                port: parts.homematicPort,
                https: 'false',
            });
            // the code with the link to the system, live in info.pairing
            await waitFor(
                () => /Pairing code <b[^>]*>\d{6}<\/b>/.test(String(db.getState(`${NS}.info.pairing`)?.val)),
                5000,
                'the code',
            );
            expect(db.getState(`${NS}.info.pairing`)?.val).to.contain(`<a href="${box.url}" target="_blank"`);
            const [id] = [...box.pairings.keys()];
            expect(db.getState(`${NS}.info.pairing`)?.val).to.contain(box.pairingCode(id));
            box.approve(id);
            const response = await pending;
            expect(db.getState(`${NS}.info.pairing`)?.val).to.contain('Paired with');
            expect(response.saveConfig).to.equal(true);
            expect(response.native.daemon).to.equal('openccu-lite');
            expect(response.native.type).to.equal('xml');
            expect(response.native.homematicAddress).to.equal(parts.homematicAddress);
            expect(response.native.homematicPort).to.equal(parts.homematicPort);
            expect(response.native.useHttps).to.equal(false);
            expect(response.native.liteToken).to.match(/^olt_/);
            expect(response.native.liteFingerprint).to.equal('');
        });

        it('reports a rejected request, and a second request while one runs', async () => {
            box = await startFakeBox();
            await start(liteConfig({ liteToken: '' }));
            const parts = liteUrlPartsOf(box.url);
            const message = { address: parts.homematicAddress, port: parts.homematicPort, https: 'false' };
            adapter!.sendTo.resetHistory();
            const first = onMessage({ command: 'lite:pair', message, from: 'admin', callback: { id: 1 } } as any);
            await waitFor(
                () => String(db.getState(`${NS}.info.pairing`)?.val).includes('Pairing code'),
                5000,
                'the code',
            );
            await onMessage({ command: 'lite:pair', message, from: 'admin', callback: { id: 2 } } as any);
            box.pairings.get([...box.pairings.keys()][0])!.state = 'rejected';
            await first;
            const answers = (adapter!.sendTo.args as unknown[][]).map(a => a[2]);
            expect(answers).to.deep.include({ error: 'busy' });
            expect(answers).to.deep.include({ error: 'rejected' });
            expect(db.getState(`${NS}.info.pairing`)?.val).to.contain('rejected');
        });

        it('lists the interfaces of the system, or the ones lite-rpc carries without a token', async () => {
            box = await startFakeBox({ interfaces: [IFACE, { name: 'BidCos-RF', running: false }] });
            await start(liteConfig());
            const parts = liteUrlPartsOf(box.url);
            const list = await send(adapter!, onMessage, 'lite:interfaces', {
                address: parts.homematicAddress,
                port: parts.homematicPort,
                https: 'false',
                token: TOKEN,
                fingerprint: '',
            });
            expect(list).to.deep.equal([
                { value: 'BidCos-RF', label: 'BidCos-RF', description: 'not running' },
                { value: IFACE, label: IFACE, description: 'running' },
            ]);
            const fallback = await send(adapter!, onMessage, 'lite:interfaces', {
                address: parts.homematicAddress,
                token: '',
            });
            expect(fallback.map((i: { value: string }) => i.value)).to.deep.equal([
                'HmIP-RF',
                'BidCos-RF',
                'BidCos-Wired',
                'VirtualDevices',
            ]);
            const refused = await send(adapter!, onMessage, 'lite:interfaces', {
                ...parts,
                address: parts.homematicAddress,
                port: parts.homematicPort,
                https: 'false',
                token: 'olt_wrong',
            });
            expect(refused.length).to.equal(4);
            expect(adapter!.log.warn.calledWithMatch(/Cannot read the interfaces/)).to.equal(true);
        });

        it('answers an unknown lite command with an error', async () => {
            box = await startFakeBox();
            await start(liteConfig());
            expect(await send(adapter!, onMessage, 'lite:nothing', {})).to.deep.equal({ error: 'Unknown command' });
        });
    });
});
