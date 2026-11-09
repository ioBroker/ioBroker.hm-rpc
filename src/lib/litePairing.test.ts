import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FakeBox } from 'occulite-client/testing';
import type { PairingState } from './lite';
import { loadOcculite, type LiteModules } from './liteConnection';
import { LitePairing, PairingError } from './litePairing';
import { startFakeBox, waitFor } from './liteTestUtil';

function log(): Pick<Console, 'debug' | 'info' | 'warn' | 'error'> {
    return { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
}

describe('LitePairing', () => {
    let box: FakeBox | undefined;
    let server: http.Server | undefined;
    const states: PairingState[] = [];

    function pairing(opts: { timeout?: number; loader?: () => Promise<LiteModules> } = {}): LitePairing {
        states.length = 0;
        return new LitePairing({
            app: 'ioBroker.hm-rpc',
            appVersion: '4.3.0',
            instance: 'hm-rpc.0 on test',
            log: log(),
            onState: s => states.push(s),
            ...opts,
        });
    }

    async function failure(p: Promise<unknown>): Promise<PairingError> {
        try {
            await p;
        } catch (e) {
            expect(e).to.be.instanceOf(PairingError);
            return e as PairingError;
        }
        throw new Error('the pairing did not fail');
    }

    afterEach(async () => {
        await box?.stop();
        box = undefined;
        if (server) {
            await new Promise(res => server!.close(res));
            server = undefined;
        }
    });

    it('pairs: requests the code, shows it, gets the token when the administrator approves', async () => {
        box = await startFakeBox({ autoApprove: true });
        const result = await pairing().pair(box.url);
        expect(result.url).to.equal(box.url);
        expect(result.token).to.match(/^olt_/);
        expect(result.fingerprint).to.equal(''); // plain HTTP
        expect(states.map(s => s.phase)).to.deep.equal(['requesting', 'waiting', 'approved']);
        const waiting = states[1] as Extract<PairingState, { phase: 'waiting' }>;
        expect(waiting.code).to.match(/^\d{6}$/);
        expect(waiting.url).to.equal(box.url);
    });

    it('shows the code the system shows', async () => {
        box = await startFakeBox();
        const p = pairing();
        const promise = p.pair(box.url);
        await waitFor(() => states.some(s => s.phase === 'waiting'), 3000, 'the code');
        const [id] = [...box.pairings.keys()];
        expect((states.at(-1) as Extract<PairingState, { phase: 'waiting' }>).code).to.equal(box.pairingCode(id));
        expect(p.busy).to.equal(true);
        box.approve(id);
        await promise;
        expect(p.busy).to.equal(false);
    });

    it('is rejected when the administrator rejects', async () => {
        box = await startFakeBox();
        const promise = pairing().pair(box.url);
        await waitFor(() => states.some(s => s.phase === 'waiting'));
        box.pairings.get([...box.pairings.keys()][0])!.state = 'rejected';
        const e = await failure(promise);
        expect(e.code).to.equal('rejected');
        expect(states.at(-1)).to.deep.equal({ phase: 'failed', url: box.url, error: 'rejected' });
    });

    it('expires when nobody approves', async () => {
        box = await startFakeBox();
        const promise = pairing().pair(box.url);
        await waitFor(() => states.some(s => s.phase === 'waiting'));
        box.pairings.get([...box.pairings.keys()][0])!.state = 'expired';
        expect((await failure(promise)).code).to.equal('expired');
    });

    it('gives up after its own timeout and withdraws the request', async () => {
        box = await startFakeBox();
        const e = await failure(pairing({ timeout: 400 }).pair(box.url));
        expect(e.code).to.equal('timeout');
        await waitFor(() => box!.pairings.size === 0, 2000, 'the withdrawal');
    });

    it('refuses a second pairing while one runs', async () => {
        box = await startFakeBox();
        const p = pairing();
        const first = p.pair(box.url);
        await waitFor(() => states.some(s => s.phase === 'waiting'));
        expect((await failure(p.pair(box.url))).code).to.equal('busy');
        box.approve([...box.pairings.keys()][0]);
        await first;
    });

    it('needs an address', async () => {
        const e = await failure(pairing().pair(''));
        expect(e.code).to.equal('no-url');
        expect(states).to.deep.equal([{ phase: 'failed', url: '', error: 'no-url' }]);
    });

    it('reports a system that does not answer', async () => {
        const closed = http.createServer();
        await new Promise<void>(res => closed.listen(0, '127.0.0.1', res));
        const port = (closed.address() as AddressInfo).port;
        await new Promise(res => closed.close(res));
        const e = await failure(pairing().pair(`http://127.0.0.1:${port}`));
        expect(e.code).to.equal('unreachable');
        expect(e.message).to.contain('refused');
    });

    it('reports a web server that is not openccu-lite (a CCU)', async () => {
        server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html>WebUI</html>');
        });
        await new Promise<void>(res => server!.listen(0, '127.0.0.1', res));
        const e = await failure(pairing().pair(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
        expect(e.code).to.equal('not-openccu-lite');
    });

    it('reports a system without pairing', async () => {
        server = http.createServer((req, res) => {
            if (req.url === '/api/meta/v1/version') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ api: 'meta', version: 1, format: 1, revision: 0, capabilities: {} }));
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'not_found', message: 'no route' }));
        });
        await new Promise<void>(res => server!.listen(0, '127.0.0.1', res));
        const e = await failure(pairing().pair(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
        expect(e.code).to.equal('no-pairing');
    });

    it('reports a certificate the probe refused', async () => {
        const real = await loadOcculite();
        const loader = (): Promise<LiteModules> =>
            Promise.resolve({
                ...real,
                probe: (url: string) =>
                    Promise.resolve({ kind: 'unreachable' as const, reachable: true, reason: 'certificate', url }),
            });
        const e = await failure(pairing({ loader }).pair('https://192.0.2.1'));
        expect(e.code).to.equal('certificate');
    });

    it('stores the URL the system answered, after its redirect', async () => {
        box = await startFakeBox({ autoApprove: true });
        const target = box.url;
        server = http.createServer((req, res) => {
            res.writeHead(302, { Location: `${target}${req.url}` });
            res.end();
        });
        await new Promise<void>(res => server!.listen(0, '127.0.0.1', res));
        const result = await pairing().pair(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
        expect(result.url).to.equal(target);
    });

    it('reports anything else as failed', async () => {
        const loader = (): Promise<LiteModules> => Promise.reject(new Error('cannot load'));
        const e = await failure(pairing({ loader }).pair('http://192.0.2.1'));
        expect(e.code).to.equal('failed');
        expect(e.message).to.equal('cannot load');
        expect(states.at(-1)).to.deep.equal({ phase: 'failed', url: 'http://192.0.2.1', error: 'failed' });
    });
});
