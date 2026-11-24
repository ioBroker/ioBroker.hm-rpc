import { expect } from 'chai';
import { describe, it } from 'mocha';
import {
    datapointName,
    builtinEnumOf,
    enumIdOfPath,
    enumIdPart,
    enumsOfNodes,
    isHmRegaEnumOf,
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
    const names: Record<string, string> = {
        'room/eg': 'EG',
        'room/eg/wohnzimmer': 'Wohnzimmer',
        'room/living-room': 'Living Room',
        'room/kueche': 'Küche',
        'room/1-og': '1.OG',
        'room/1-og/bad': 'Bad',
        'room/bobs': "Bob's Room",
        'room/odd': 'A,B [x]*?',
        'function/licht': 'Licht',
    };
    const nameOf = (path: string): string | undefined => names[path];

    it('is the name as ioBroker.hm-rega makes the id of a CCU room: case, spaces and umlauts kept', () => {
        expect(enumIdOfPath('room/living-room', nameOf)).to.equal('enum.rooms.Living Room');
        expect(enumIdOfPath('room/kueche', nameOf)).to.equal('enum.rooms.Küche');
        expect(enumIdOfPath('function/licht', nameOf)).to.equal('enum.functions.Licht');
    });

    it('replaces a dot, and what the controller does not keep in an id, by _', () => {
        expect(enumIdOfPath('room/1-og', nameOf)).to.equal('enum.rooms.1_OG');
        expect(enumIdOfPath('room/bobs', nameOf)).to.equal('enum.rooms.Bob_s Room');
        expect(enumIdOfPath('room/odd', nameOf)).to.equal('enum.rooms.A_B _x_');
    });

    it('names a nested node by the names along its path', () => {
        expect(enumIdOfPath('room/eg/wohnzimmer', nameOf)).to.equal('enum.rooms.EG_Wohnzimmer');
        expect(enumIdOfPath('room/1-og/bad', nameOf)).to.equal('enum.rooms.1_OG_Bad');
    });

    it('takes the id of a node without a name', () => {
        expect(enumIdOfPath('room/keller', nameOf)).to.equal('enum.rooms.keller');
        expect(enumIdOfPath('room/eg/flur', nameOf)).to.equal('enum.rooms.EG_flur');
    });

    it('is undefined for the root of an enum and for enums ioBroker has no counterpart for', () => {
        expect(enumIdOfPath('room', nameOf)).to.be.undefined;
        expect(enumIdOfPath('room/', nameOf)).to.be.undefined;
        expect(enumIdOfPath('room/eg//bad', nameOf)).to.be.undefined;
        expect(enumIdOfPath('floor/eg', nameOf)).to.be.undefined;
    });
});

describe('enumIdPart', () => {
    it('keeps everything an id can hold', () => {
        expect(enumIdPart('Wohn-Zimmer (Süd) #2')).to.equal('Wohn-Zimmer (Süd) #2');
        expect(enumIdPart('a.b.c')).to.equal('a_b_c');
        expect(enumIdPart('x"y`z')).to.equal('x_y_z');
    });
});

describe('builtinEnumOf / isHmRegaEnumOf', () => {
    it('maps the German names the import gives the CCU own rooms and functions to the enums hm-rega made', () => {
        expect(builtinEnumOf('room/wohnzimmer', 'Wohnzimmer')).to.deep.equal({
            id: 'enum.rooms.LivingRoom',
            key: 'roomLivingRoom',
        });
        expect(builtinEnumOf('room/kinderzimmer-1', 'Kinderzimmer 1')).to.deep.equal({
            id: 'enum.rooms.Childrens_room_1',
            key: 'roomChildrensRoom1',
        });
        expect(builtinEnumOf('function/klima', 'Klima')).to.deep.equal({
            id: 'enum.functions.Climate_сontrol',
            key: 'funcClimateControl',
        });
        expect(builtinEnumOf('function/licht', 'Licht')!.id).to.equal('enum.functions.Light');
    });

    it('knows the key itself, in both of the forms ReGa stores it', () => {
        expect(builtinEnumOf('room/x', 'roomKitchen')!.id).to.equal('enum.rooms.Kitchen');
        expect(builtinEnumOf('room/x', '${roomKitchen}')!.id).to.equal('enum.rooms.Kitchen');
    });

    it('is undefined for any other node: another name, a nested node, a room name in the function tree', () => {
        expect(builtinEnumOf('room/wohnzimmer', 'Wohnzimmer 2')).to.be.undefined;
        expect(builtinEnumOf('room/eg/wohnzimmer', 'Wohnzimmer')).to.be.undefined;
        expect(builtinEnumOf('function/wohnzimmer', 'Wohnzimmer')).to.be.undefined;
        expect(builtinEnumOf('room/licht', 'Licht')).to.be.undefined;
        expect(builtinEnumOf('floor/wohnzimmer', 'Wohnzimmer')).to.be.undefined;
    });

    it('recognises the enum hm-rega made of a key by its native.Name', () => {
        const obj = (Name: unknown): ioBroker.Object =>
            ({ _id: 'enum.rooms.LivingRoom', type: 'enum', common: { name: 'x' }, native: { Name } }) as any;
        expect(isHmRegaEnumOf(obj('roomLivingRoom'), 'roomLivingRoom')).to.equal(true);
        expect(isHmRegaEnumOf(obj('${roomLivingRoom}'), 'roomLivingRoom')).to.equal(true);
        expect(isHmRegaEnumOf(obj('LivingRoom'), 'roomLivingRoom')).to.equal(false);
        expect(isHmRegaEnumOf(obj(undefined), 'roomLivingRoom')).to.equal(false);
        expect(isHmRegaEnumOf(undefined, 'roomLivingRoom')).to.equal(false);
    });
});

describe('enumsOfNodes', () => {
    it('maps the direct nodes to enums, each once, with their names', () => {
        expect(
            enumsOfNodes(
                [
                    { path: 'room/eg/wohnzimmer', name: 'Wohnzimmer' },
                    { path: 'function/licht', name: 'Licht' },
                    { path: 'room/eg/wohnzimmer', name: 'Wohnzimmer' },
                    { path: 'room/living-room', name: 'Living Room' },
                ],
                path => ({ 'room/eg': 'EG' })[path],
            ),
        ).to.deep.equal([
            { id: 'enum.rooms.EG_Wohnzimmer', name: 'Wohnzimmer', path: 'room/eg/wohnzimmer' },
            {
                id: 'enum.functions.Licht',
                name: 'Licht',
                path: 'function/licht',
                builtin: { id: 'enum.functions.Light', key: 'funcLight' },
            },
            { id: 'enum.rooms.Living Room', name: 'Living Room', path: 'room/living-room' },
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

    it('takes a direct node name from the tree when the membership has none', () => {
        expect(enumsOfNodes([{ path: 'room/bad', name: '' }], path => ({ 'room/bad': 'Bad' })[path])).to.deep.equal([
            { id: 'enum.rooms.Bad', name: 'Bad', path: 'room/bad' },
        ]);
    });

    it('unites two nodes of one name in one enum, as hm-rega has one id for them', () => {
        expect(
            enumsOfNodes([
                { path: 'room/bad', name: 'Bad' },
                { path: 'room/bad-2', name: 'Bad' },
            ]).map(e => e.id),
        ).to.deep.equal(['enum.rooms.Bad']);
    });
});
