import { expect } from 'chai';
import { describe, it } from 'mocha';
import {
    datapointName,
    enumIdOfPath,
    enumsOfNodes,
    interfaceDaemon,
    liteUrlOf,
    liteUrlParts,
    objectIdOfAddress,
    pairingErrorCode,
    pairingHtml,
    refOfAddress,
    rpcCallbackError,
    type PairingErrorCode,
} from './lite';

describe('interfaceDaemon', () => {
    it('maps the interfaces of the system to the daemons of a CCU', () => {
        expect(interfaceDaemon('HmIP-RF')).to.equal('HMIP');
        expect(interfaceDaemon('BidCos-RF')).to.equal('rfd');
        expect(interfaceDaemon('BidCos-Wired')).to.equal('hs485d');
        expect(interfaceDaemon('VirtualDevices')).to.equal('virtual-devices');
    });

    it('treats an unknown interface like rfd', () => {
        expect(interfaceDaemon('Homegear')).to.equal('rfd');
        expect(interfaceDaemon('')).to.equal('rfd');
    });
});

describe('liteUrlOf', () => {
    it('builds https with the default port left out', () => {
        expect(liteUrlOf({ homematicAddress: '192.168.1.20', homematicPort: '443', useHttps: true })).to.equal(
            'https://192.168.1.20',
        );
        expect(liteUrlOf({ homematicAddress: 'ccu.local', homematicPort: '', useHttps: true })).to.equal(
            'https://ccu.local',
        );
        expect(
            liteUrlOf({ homematicAddress: 'ccu.local', homematicPort: undefined as unknown as string, useHttps: true }),
        ).to.equal('https://ccu.local');
    });

    it('builds http with its default port left out', () => {
        expect(liteUrlOf({ homematicAddress: '192.168.1.20', homematicPort: '80', useHttps: false })).to.equal(
            'http://192.168.1.20',
        );
    });

    it('keeps another port', () => {
        expect(liteUrlOf({ homematicAddress: '192.168.1.20', homematicPort: '8443', useHttps: true })).to.equal(
            'https://192.168.1.20:8443',
        );
        expect(liteUrlOf({ homematicAddress: '192.168.1.20', homematicPort: '443', useHttps: false })).to.equal(
            'http://192.168.1.20:443',
        );
    });

    it('drops a scheme, a path and blanks the user typed into the address', () => {
        expect(
            liteUrlOf({ homematicAddress: ' http://192.168.1.20/ ', homematicPort: '443', useHttps: true }),
        ).to.equal('https://192.168.1.20');
        expect(liteUrlOf({ homematicAddress: 'ccu.local/api?x=1#y', homematicPort: '0', useHttps: true })).to.equal(
            'https://ccu.local',
        );
    });

    it('is empty without an address', () => {
        expect(liteUrlOf({ homematicAddress: '', homematicPort: '443', useHttps: true })).to.equal('');
        expect(liteUrlOf({ homematicAddress: '   ', homematicPort: '443', useHttps: true })).to.equal('');
        expect(
            liteUrlOf({
                homematicAddress: undefined as unknown as string,
                homematicPort: undefined as unknown as string,
                useHttps: true,
            }),
        ).to.equal('');
    });
});

describe('liteUrlParts', () => {
    it('splits the URL the system answered into the address fields', () => {
        expect(liteUrlParts('https://192.168.1.20')).to.deep.equal({
            homematicAddress: '192.168.1.20',
            homematicPort: '443',
            useHttps: true,
        });
        expect(liteUrlParts('http://ccu.local')).to.deep.equal({
            homematicAddress: 'ccu.local',
            homematicPort: '80',
            useHttps: false,
        });
        expect(liteUrlParts('https://ccu.local:8443/')).to.deep.equal({
            homematicAddress: 'ccu.local',
            homematicPort: '8443',
            useHttps: true,
        });
    });

    it('strips the brackets of an IPv6 address', () => {
        expect(liteUrlParts('https://[fd00::20]:8443').homematicAddress).to.equal('fd00::20');
    });

    it('round-trips with liteUrlOf', () => {
        for (const url of [
            'https://192.168.1.20',
            'http://192.168.1.20',
            'https://ccu.local:8443',
            'http://ccu.local:8080',
        ]) {
            expect(liteUrlOf(liteUrlParts(url))).to.equal(url);
        }
    });
});

describe('pairingErrorCode', () => {
    it('keeps the codes of occulite-client the admin knows', () => {
        for (const code of ['rejected', 'expired', 'timeout', 'certificate', 'unreachable']) {
            expect(pairingErrorCode({ code })).to.equal(code);
        }
    });

    it('reads a system without pairing from not-found and unsupported', () => {
        expect(pairingErrorCode({ code: 'not-found' })).to.equal('no-pairing');
        expect(pairingErrorCode({ code: 'unsupported' })).to.equal('no-pairing');
    });

    it('is failed for everything else', () => {
        expect(pairingErrorCode({ code: 'http-500' })).to.equal('failed');
        expect(pairingErrorCode(new Error('boom'))).to.equal('failed');
        expect(pairingErrorCode(undefined)).to.equal('failed');
        expect(pairingErrorCode({ code: 42 })).to.equal('failed');
    });
});

describe('pairingHtml', () => {
    const url = 'https://192.168.1.20';

    it('is empty while idle', () => {
        expect(pairingHtml({ phase: 'idle' }, 'de')).to.equal('');
    });

    it('names the system while requesting', () => {
        expect(pairingHtml({ phase: 'requesting', url }, 'en')).to.contain(url);
        expect(pairingHtml({ phase: 'requesting', url }, 'de')).to.contain('angefordert');
    });

    it('shows the code and links the Status page while waiting', () => {
        const html = pairingHtml({ phase: 'waiting', url, code: '123456' }, 'en');
        expect(html).to.contain('<b');
        expect(html).to.contain('123456');
        expect(html).to.contain(`<a href="${url}" target="_blank"`);
        expect(html).to.contain('Waiting');
        expect(pairingHtml({ phase: 'waiting', url, code: '123456' }, 'de')).to.contain('bestätigen');
    });

    it('escapes what goes into the HTML', () => {
        const html = pairingHtml({ phase: 'waiting', url: 'https://a<b>&"c', code: '<1>' }, 'en');
        expect(html).not.to.contain('<b>&"c');
        expect(html).to.contain('a&lt;b&gt;&amp;&quot;c');
        expect(html).to.contain('&lt;1&gt;');
    });

    it('says paired when approved', () => {
        expect(pairingHtml({ phase: 'approved', url }, 'en')).to.contain('Paired with');
        expect(pairingHtml({ phase: 'approved', url }, 'de')).to.contain('gekoppelt');
    });

    it('has a text for every error, in both languages', () => {
        const codes: PairingErrorCode[] = [
            'no-url',
            'unreachable',
            'not-openccu-lite',
            'no-pairing',
            'rejected',
            'expired',
            'timeout',
            'busy',
            'certificate',
            'failed',
        ];
        for (const error of codes) {
            const en = pairingHtml({ phase: 'failed', url, error }, 'en');
            const de = pairingHtml({ phase: 'failed', url, error }, 'de');
            expect(en, error).to.have.length.greaterThan(10);
            expect(de, error).to.have.length.greaterThan(10);
            expect(en, error).not.to.equal(de);
        }
    });

    it('falls back to English for every other language', () => {
        expect(pairingHtml({ phase: 'approved', url }, 'fr')).to.equal(pairingHtml({ phase: 'approved', url }, 'en'));
    });
});

describe('rpcCallbackError', () => {
    it('hands a fault of the interface process over as its fault string', () => {
        expect(
            rpcCallbackError({ name: 'OccuLiteError', code: 'rpc-fault', faultCode: -1, message: 'Failure' }),
        ).to.equal('Failure');
    });

    it('names the code of a client error', () => {
        expect(rpcCallbackError({ code: 'timeout', message: 'the request timed out' })).to.equal(
            'timeout: the request timed out',
        );
        // a code without a fault code is not a fault
        expect(rpcCallbackError({ code: 'rpc-fault', message: 'odd' })).to.equal('rpc-fault: odd');
    });

    it('takes a plain error or anything else as text', () => {
        expect(rpcCallbackError(new Error('boom'))).to.equal('boom');
        expect(rpcCallbackError('not connected')).to.equal('not connected');
        expect(rpcCallbackError(undefined)).to.equal('undefined');
    });
});

describe('addresses and names', () => {
    it('objectIdOfAddress turns a channel address into an object id', () => {
        expect(objectIdOfAddress('0001D8A99B0815:1')).to.equal('0001D8A99B0815.1');
        expect(objectIdOfAddress('INT0000001')).to.equal('INT0000001');
        expect(objectIdOfAddress('a b;c')).to.equal('a_b_c');
    });

    it('refOfAddress keys the metadata', () => {
        expect(refOfAddress('HmIP-RF', '0001D8A99B0815:1')).to.equal('HmIP-RF.0001D8A99B0815:1');
    });

    it('datapointName prefixes the channel name when the system has one', () => {
        expect(datapointName('Stehlampe Schalter', 'STATE')).to.equal('Stehlampe Schalter.STATE');
        expect(datapointName(undefined, 'STATE')).to.equal('STATE');
        expect(datapointName('', 'STATE')).to.equal('STATE');
    });
});

describe('enumIdOfPath', () => {
    it('flattens a room tree into one enum per node, named by the path', () => {
        expect(enumIdOfPath('room/eg/wohnzimmer')).to.equal('enum.rooms.eg_wohnzimmer');
        expect(enumIdOfPath('room/og/bad')).to.equal('enum.rooms.og_bad');
        expect(enumIdOfPath('room/keller')).to.equal('enum.rooms.keller');
        expect(enumIdOfPath('function/licht')).to.equal('enum.functions.licht');
    });

    it('is undefined for the root of an enum and for enums ioBroker has no counterpart for', () => {
        expect(enumIdOfPath('room')).to.be.undefined;
        expect(enumIdOfPath('room/')).to.be.undefined;
        expect(enumIdOfPath('floor/eg')).to.be.undefined;
    });

    it('replaces characters an object id cannot hold', () => {
        expect(enumIdOfPath('room/eg/wohn zimmer')).to.equal('enum.rooms.eg_wohn_zimmer');
        expect(enumIdOfPath('room/1.og/bad')).to.equal('enum.rooms.1_og_bad');
    });
});

describe('enumsOfNodes', () => {
    it('maps the direct nodes to enums, each once, with their names', () => {
        expect(
            enumsOfNodes([
                { path: 'room/eg/wohnzimmer', name: 'Wohnzimmer' },
                { path: 'function/licht', name: 'Licht' },
                { path: 'room/eg/wohnzimmer', name: 'Wohnzimmer' },
            ]),
        ).to.deep.equal([
            { id: 'enum.rooms.eg_wohnzimmer', name: 'Wohnzimmer', path: 'room/eg/wohnzimmer' },
            { id: 'enum.functions.licht', name: 'Licht', path: 'function/licht' },
        ]);
    });

    it('names a node by its id when the system has no name for it, and skips other enums', () => {
        expect(
            enumsOfNodes([
                { path: 'room/og/bad', name: '' },
                { path: 'floor/og', name: 'OG' },
            ]),
        ).to.deep.equal([{ id: 'enum.rooms.og_bad', name: 'bad', path: 'room/og/bad' }]);
    });
});
