import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';
import type { FakeBox } from 'occulite-client/testing';
import {
    LiteConnection,
    listLiteInterfaces,
    loadOcculite,
    tierAwareTransport,
    type LiteModules,
} from './liteConnection';
import { DEVICE, IFACE, startFakeBox, TOKEN, waitFor } from './liteTestUtil';

type Call = { method: string; params: unknown[] };

function log(lines: string[] = []): Pick<Console, 'debug' | 'info' | 'warn' | 'error'> {
    const push = (level: string) => (m: string) => void lines.push(`${level} ${m}`);
    return { debug: push('debug'), info: push('info'), warn: push('warn'), error: push('error') };
}

describe('LiteConnection', function () {
    this.timeout(15_000);
    let box: FakeBox | undefined;
    let conn: LiteConnection | undefined;

    afterEach(async () => {
        conn?.close();
        conn = undefined;
        await box?.stop();
        box = undefined;
    });

    /** a connection to the fake box, its callbacks recorded */
    async function connect(
        opts: {
            token?: string;
            fingerprint?: string;
            loader?: () => Promise<LiteModules>;
            onResync?: () => void;
            lines?: string[];
        } = {},
    ): Promise<{ calls: Call[]; statuses: string[] }> {
        const calls: Call[] = [];
        const statuses: string[] = [];
        conn = new LiteConnection({
            url: box!.url,
            token: opts.token ?? TOKEN,
            fingerprint: opts.fingerprint,
            iface: IFACE,
            initId: 'hm-rpc.0',
            log: log(opts.lines),
            onStatus: s => statuses.push(s),
            onResync: opts.onResync,
            loader: opts.loader,
        });
        await conn.start(server => {
            for (const method of [
                'event',
                'system.multicall',
                'newDevices',
                'deleteDevices',
                'updateDevice',
                'replaceDevice',
                'readdedDevice',
            ]) {
                server.on(method, (err, params, cb) => {
                    calls.push({ method, params });
                    cb(null, '');
                });
            }
        });
        return { calls, statuses };
    }

    it('connects, delivers the device snapshot as newDevices and follows the status', async () => {
        box = await startFakeBox();
        const { calls, statuses } = await connect();
        expect(statuses).to.deep.equal(['connecting', 'ready']);
        expect(conn!.state).to.equal('ready');
        const snapshot = calls.find(c => c.method === 'newDevices')!;
        expect(snapshot.params[0]).to.equal('hm-rpc.0');
        expect((snapshot.params[1] as { ADDRESS: string }[]).map(d => d.ADDRESS)).to.deep.equal([
            DEVICE,
            `${DEVICE}:0`,
            `${DEVICE}:1`,
        ]);
        expect(conn!.meta!.name(`${IFACE}.${DEVICE}`)).to.equal('Stehlampe');
        expect(conn!.values!.get(`${IFACE}.${DEVICE}:1.STATE`)!.value).to.equal(true);
    });

    it('turns the events of the stream into the callback methods with the interface id of the adapter', async () => {
        box = await startFakeBox();
        const { calls } = await connect();
        box.event(IFACE, `${DEVICE}:1`, 'STATE', false);
        await waitFor(() => calls.some(c => c.method === 'event'));
        expect(calls.find(c => c.method === 'event')!.params).to.deep.equal([
            'hm-rpc.0',
            `${DEVICE}:1`,
            'STATE',
            false,
        ]);

        // a multicall: the events of one batch together
        const batch = box.nextSeq();
        box.event(IFACE, `${DEVICE}:0`, 'UNREACH', true, batch);
        box.event(IFACE, `${DEVICE}:0`, 'LOW_BAT', true, batch);
        await waitFor(() => calls.some(c => c.method === 'system.multicall'));
        const multicall = calls.find(c => c.method === 'system.multicall')!;
        expect(multicall.params[0]).to.deep.equal([
            { methodName: 'event', params: ['hm-rpc.0', `${DEVICE}:0`, 'UNREACH', true] },
            { methodName: 'event', params: ['hm-rpc.0', `${DEVICE}:0`, 'LOW_BAT', true] },
        ]);

        box.push('deleteDevices', { interface: IFACE, addresses: [`${DEVICE}:1`] });
        box.updateDevice(IFACE, DEVICE, 2);
        box.replaceDevice(IFACE, DEVICE, 'NEW000000001');
        box.push('readdedDevice', { interface: IFACE, addresses: [DEVICE] });
        await waitFor(() => calls.some(c => c.method === 'readdedDevice'));
        expect(calls.find(c => c.method === 'deleteDevices')!.params).to.deep.equal(['hm-rpc.0', [`${DEVICE}:1`]]);
        expect(calls.find(c => c.method === 'updateDevice')!.params).to.deep.equal(['hm-rpc.0', DEVICE, 2]);
        expect(calls.find(c => c.method === 'replaceDevice')!.params).to.deep.equal([
            'hm-rpc.0',
            DEVICE,
            'NEW000000001',
        ]);
        expect(calls.find(c => c.method === 'readdedDevice')!.params).to.deep.equal(['hm-rpc.0', [DEVICE]]);
    });

    it('calls the interface process through lite-rpc in the callback shape of the RPC clients', async () => {
        box = await startFakeBox();
        await connect();
        const result = await new Promise((res, rej) =>
            conn!.client.methodCall('setValue', [`${DEVICE}:1`, 'STATE', true], (err, r) =>
                err ? rej(new Error(err as string)) : res(r),
            ),
        );
        expect(result).to.equal('');
        expect(box.calls.at(-1)).to.deep.equal({
            interface: IFACE,
            method: 'setValue',
            params: [`${DEVICE}:1`, 'STATE', true],
        });

        const list = await new Promise((res, rej) =>
            conn!.methodCall('listDevices', [], (err, r) => (err ? rej(new Error(err as string)) : res(r))),
        );
        expect((list as unknown[]).length).to.equal(3);
        // a null result (getValue of an unknown datapoint) is '' as the RPC clients give it
        const nothing = await new Promise((res, rej) =>
            conn!.methodCall('getValue', ['NOPE:1', 'STATE'], (err, r) =>
                err ? rej(new Error(err as string)) : res(r),
            ),
        );
        expect(nothing).to.equal('');
    });

    it('hands a fault of the process over as its fault string, a client error with its code', async () => {
        box = await startFakeBox({ failing: [`${IFACE}.${DEVICE}:1`] });
        await connect();
        const fault = await new Promise(res =>
            conn!.methodCall('getParamset', [`${DEVICE}:1`, 'VALUES'], err => res(err)),
        );
        expect(fault).to.equal('Failure');
        // an unknown method is a fault of the process too (JSON-RPC -32601)
        const unknown = await new Promise(res => conn!.methodCall('noSuchMethod', [], err => res(err)));
        expect(unknown).to.equal('unknown method noSuchMethod');
        // a system that is gone: the client's code names the kind
        await box.stop();
        box = undefined;
        const gone = await new Promise(res => conn!.methodCall('ping', [], err => res(err)));
        expect(gone).to.match(/^unreachable: /);
    });

    it('answers "not connected" before start and after close', async () => {
        box = await startFakeBox();
        const early = new LiteConnection({
            url: box.url,
            token: TOKEN,
            iface: IFACE,
            initId: 'hm-rpc.0',
            log: log(),
            onStatus: () => undefined,
        });
        expect(early.meta).to.be.undefined;
        expect(early.values).to.be.undefined;
        expect(typeof early.on('meta', () => undefined)).to.equal('function');
        expect(await new Promise(res => early.methodCall('ping', [], err => res(err)))).to.equal('not connected');

        const { statuses } = await connect();
        conn!.close();
        expect(await new Promise(res => conn!.client.methodCall('ping', [], err => res(err)))).to.equal(
            'not connected',
        );
        // the closed status is not reported: the adapter is shutting down
        expect(statuses).to.deep.equal(['connecting', 'ready']);
        conn!.client.close(); // a second close is harmless
    });

    it('reports a lost stream as degraded and the reconnect as ready, a restart of the system as resync', async () => {
        box = await startFakeBox();
        let resyncs = 0;
        const lines: string[] = [];
        const { statuses } = await connect({ onResync: () => resyncs++, lines });
        box.dropStreams();
        await waitFor(() => statuses.includes('degraded'));
        await waitFor(() => statuses.at(-1) === 'ready', 5000, 'the reconnect');
        expect(box.streamsOpened).to.be.greaterThan(1);

        box.bootId = 'boot2';
        box.dropStreams();
        await waitFor(() => resyncs > 0, 5000, 'the resync');
        expect(lines.some(l => l.startsWith('info lite-rpc <- resync (boot)'))).to.equal(true);

        box.setInterface(IFACE, false);
        await waitFor(() => lines.some(l => l === `info lite-rpc <- interface ${IFACE} down`));
    });

    it('goes offline when the token is refused, with the error logged', async () => {
        box = await startFakeBox();
        const lines: string[] = [];
        const { statuses } = await connect({ lines });
        box.opts.token = 'olt_another';
        box.dropStreams();
        await waitFor(() => statuses.includes('offline'), 5000, 'offline');
        expect(lines.some(l => l.startsWith('warn lite-rpc: '))).to.equal(true);
    });

    it('pins the certificate of the pairing (no effect over plain HTTP)', async () => {
        box = await startFakeBox();
        const { statuses } = await connect({ fingerprint: 'AB:CD:EF' });
        expect(statuses).to.deep.equal(['connecting', 'ready']);
    });

    it('rejects start() with the reason when the credential is wrong', async () => {
        box = await startFakeBox();
        let code: string | undefined;
        try {
            await connect({ token: 'olt_wrong' });
        } catch (e) {
            code = (e as { code?: string }).code;
        }
        expect(code).to.equal('unauthenticated');
    });

    it('takes a loader of its own and logs through the adapter', async () => {
        box = await startFakeBox({ interfacesRoute: false });
        const lines: string[] = [];
        let loads = 0;
        const loader = async (): Promise<LiteModules> => {
            loads++;
            return loadOcculite();
        };
        await connect({ loader, lines });
        expect(loads).to.equal(1);
        // the client's own log lines go to the adapter's log
        expect(lines.some(l => l.startsWith('warn occulite-client: the interfaces list is not available'))).to.equal(
            true,
        );
    });
});

describe('listLiteInterfaces', () => {
    let box: FakeBox | undefined;

    afterEach(async () => {
        await box?.stop();
        box = undefined;
    });

    it('lists the interfaces of the system with their state', async () => {
        box = await startFakeBox({ interfaces: [IFACE, { name: 'BidCos-RF', running: false }] });
        expect(await listLiteInterfaces({ url: box.url, token: TOKEN })).to.deep.equal([
            { name: 'BidCos-RF', running: false },
            { name: IFACE, running: true },
        ]);
    });

    it('rejects with the reason for a wrong token', async () => {
        box = await startFakeBox();
        let code: string | undefined;
        try {
            await listLiteInterfaces({
                url: box.url,
                token: 'olt_wrong',
                fingerprint: 'AB:CD:EF',
                loader: loadOcculite,
            });
        } catch (e) {
            code = (e as { code?: string }).code;
        }
        expect(code).to.equal('unauthenticated');
    });
});

describe('tierAwareTransport', () => {
    const answers = (status: number, body: string): { calls: string[]; tx: ReturnType<typeof tierAwareTransport> } => {
        const calls: string[] = [];
        const inner = {
            request: (method: string, url: string) => {
                calls.push(`${method} ${url}`);
                return Promise.resolve({ status, headers: {}, body });
            },
            stream: (url: string) => {
                calls.push(`stream ${url}`);
                return Promise.resolve({ status: 200, chunks: (async function* () {})() });
            },
        };
        return { calls, tx: tierAwareTransport(inner) };
    };
    const STATE = 'https://box/api/auth/v1/state';

    it('spells rpc:read out where a higher tier implies it', async () => {
        const { tx } = answers(200, JSON.stringify({ authenticated: true, scopes: ['meta:read', 'rpc:configure'] }));
        const r = await tx.request('GET', STATE, {});
        expect(JSON.parse(r.body)).to.deep.equal({
            authenticated: true,
            scopes: ['meta:read', 'rpc:configure', 'rpc:read'],
        });
    });

    it('leaves every other answer alone', async () => {
        for (const [status, body, url] of [
            [200, JSON.stringify({ scopes: ['rpc:read', 'rpc:admin'] }), STATE],
            [200, JSON.stringify({ scopes: ['meta:read'] }), STATE],
            [200, JSON.stringify({ scopes: ['*'] }), STATE],
            [200, JSON.stringify({}), STATE],
            [200, 'not json', STATE],
            [401, JSON.stringify({ scopes: ['rpc:admin'] }), STATE],
            [200, JSON.stringify({ scopes: ['rpc:admin'] }), 'https://box/api/auth/v1/tokens'],
        ] as [number, string, string][]) {
            const { tx } = answers(status, body);
            const r = await tx.request('GET', url, {});
            expect(r.body, `${status} ${url} ${body}`).to.equal(body);
        }
    });

    it('passes the stream through', async () => {
        const { tx, calls } = answers(200, '');
        await tx.stream('https://box/api/rpc/v1/events', {}, new AbortController().signal);
        expect(calls).to.deep.equal(['stream https://box/api/rpc/v1/events']);
    });
});
