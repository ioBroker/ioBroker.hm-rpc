"use strict";
/**
 * The pure parts of the openccu-lite mode: nothing here talks to the system or to ioBroker.
 *
 * openccu-lite is a CCU firmware without ReGaHSS. Its interface processes are reached through lite-rpc
 * (`/api/rpc/v1`): the requests over HTTP(S) with a token, the events as a stream the adapter opens -
 * no callback server, no `init`. The names and rooms of devices and channels are the system's metadata.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAIRING_TIMEOUT_MS = exports.LITE_ACCESS = exports.LITE_INTERFACES = void 0;
exports.interfaceDaemon = interfaceDaemon;
exports.liteUrlOf = liteUrlOf;
exports.liteUrlParts = liteUrlParts;
exports.pairingErrorCode = pairingErrorCode;
exports.pairingHtml = pairingHtml;
exports.rpcCallbackError = rpcCallbackError;
exports.objectIdOfAddress = objectIdOfAddress;
exports.refOfAddress = refOfAddress;
exports.datapointName = datapointName;
exports.enumIdPart = enumIdPart;
exports.enumIdOfPath = enumIdOfPath;
exports.builtinEnumOf = builtinEnumOf;
exports.isHmRegaEnumOf = isHmRegaEnumOf;
exports.enumsOfNodes = enumsOfNodes;
const tools_1 = require("./tools");
/** The interfaces lite-rpc carries (the names of `InterfacesList.xml`, as `GET /api/rpc/v1/interfaces` lists them) */
exports.LITE_INTERFACES = ['HmIP-RF', 'BidCos-RF', 'BidCos-Wired', 'VirtualDevices'];
/** The scopes the pairing asks for: paramsets are written (`configure`), the names are read */
exports.LITE_ACCESS = { devices: 'configure', names: 'read' };
/** The pairing waits at most this long for the approval (the system lets a request expire after five minutes) */
exports.PAIRING_TIMEOUT_MS = 5.5 * 60_000;
/**
 * The daemon an interface of the system corresponds to. The daemon decides the CCU specific fixes of the
 * paramset descriptions (`fixParamset`) and which devices are filtered on `newDevices`, so the lite mode
 * derives it from the interface instead of asking the user twice.
 *
 * @param iface the interface name, e.g. `HmIP-RF`
 */
function interfaceDaemon(iface) {
    switch (iface) {
        case 'HmIP-RF':
            return 'HMIP';
        case 'BidCos-Wired':
            return 'hs485d';
        case 'VirtualDevices':
            return 'virtual-devices';
        default:
            return 'rfd';
    }
}
/**
 * The URL of the system from the configuration: `https://<address>:<port>` (`http://` without TLS), the default
 * port of the scheme left out. A scheme or a path the user typed into the address is dropped; blanks are trimmed.
 * An empty address gives an empty URL.
 *
 * @param config the address fields
 */
function liteUrlOf(config) {
    const host = String(config.homematicAddress ?? '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/[/?#].*$/, '');
    if (!host) {
        return '';
    }
    const scheme = config.useHttps === false ? 'http' : 'https';
    const port = parseInt(String(config.homematicPort ?? ''), 10);
    const defaultPort = scheme === 'https' ? 443 : 80;
    const withPort = port > 0 && port !== defaultPort ? `${host}:${port}` : host;
    return `${scheme}://${withPort}`;
}
/**
 * The address fields for a URL of the system (the one the pairing stored, after the system's redirect)
 *
 * @param url the system's URL, e.g. `https://192.168.1.20`
 */
function liteUrlParts(url) {
    const parsed = new URL(url);
    const useHttps = parsed.protocol === 'https:';
    return {
        homematicAddress: parsed.hostname.replace(/^\[(.*)\]$/, '$1'),
        homematicPort: parsed.port || (useHttps ? '443' : '80'),
        useHttps,
    };
}
/**
 * The code the admin shows for an error of the pairing. occulite-client reports its errors as
 * `OccuLiteError` with a `code`; everything else is `failed`.
 *
 * @param e the error
 */
function pairingErrorCode(e) {
    const code = typeof e?.code === 'string' ? e.code : '';
    switch (code) {
        case 'rejected':
        case 'expired':
        case 'timeout':
        case 'certificate':
        case 'unreachable':
            return code;
        case 'not-found':
        case 'unsupported':
            // the system has no pairing (an older openccu-lite, or pairing is switched off)
            return 'no-pairing';
        default:
            return 'failed';
    }
}
const PAIRING_TEXTS = {
    en: {
        requesting: 'Requesting a pairing code from %url% …',
        waiting: 'Pairing code <b style="font-size: 1.6em; letter-spacing: 0.1em">%code%</b> - approve the request on the <a href="%url%" target="_blank" rel="noopener">Status page of the system</a> (the code must match). Waiting …',
        approved: 'Paired with %url%. Save the configuration to start the instance with the new token.',
        failed: {
            'no-url': 'Enter the address of the system first.',
            unreachable: 'The system %url% is not reachable.',
            'not-openccu-lite': '%url% does not answer as an openccu-lite system (a CCU?).',
            'no-pairing': 'The system %url% offers no pairing (too old, or pairing is switched off).',
            rejected: 'The administrator rejected the request on %url%.',
            expired: 'Nobody approved the request on %url% within five minutes.',
            timeout: 'The pairing with %url% timed out.',
            busy: 'A pairing is already running.',
            certificate: 'The certificate of %url% was not accepted.',
            failed: 'The pairing with %url% failed, see the log.',
        },
    },
    de: {
        requesting: 'Pairing-Code wird von %url% angefordert …',
        waiting: 'Pairing-Code <b style="font-size: 1.6em; letter-spacing: 0.1em">%code%</b> - die Anfrage auf der <a href="%url%" target="_blank" rel="noopener">Statusseite des Systems</a> bestätigen (der Code muss übereinstimmen). Warte …',
        approved: 'Mit %url% gekoppelt. Die Konfiguration speichern, damit die Instanz mit dem neuen Token startet.',
        failed: {
            'no-url': 'Zuerst die Adresse des Systems eingeben.',
            unreachable: 'Das System %url% ist nicht erreichbar.',
            'not-openccu-lite': '%url% antwortet nicht als openccu-lite-System (eine CCU?).',
            'no-pairing': 'Das System %url% bietet kein Pairing an (zu alt, oder das Pairing ist ausgeschaltet).',
            rejected: 'Der Administrator hat die Anfrage auf %url% abgelehnt.',
            expired: 'Niemand hat die Anfrage auf %url% innerhalb von fünf Minuten bestätigt.',
            timeout: 'Das Pairing mit %url% hat zu lange gedauert.',
            busy: 'Es läuft bereits ein Pairing.',
            certificate: 'Das Zertifikat von %url% wurde nicht akzeptiert.',
            failed: 'Das Pairing mit %url% ist fehlgeschlagen, siehe Log.',
        },
    },
};
/**
 * Escapes a value for the HTML the admin renders
 *
 * @param value the text
 */
function escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/**
 * The text of the instance state `info.pairing`, which the admin shows live while a pairing runs: the code
 * with a link to the system's Status page, then the result. HTML, in German or English (English for every
 * other language of the system).
 *
 * @param state the pairing's state
 * @param lang the system language of ioBroker
 */
function pairingHtml(state, lang) {
    const texts = lang === 'de' ? PAIRING_TEXTS.de : PAIRING_TEXTS.en;
    if (state.phase === 'idle') {
        return '';
    }
    const url = escapeHtml(state.url);
    switch (state.phase) {
        case 'requesting':
            return texts.requesting.replace('%url%', url);
        case 'waiting':
            return texts.waiting.replace('%code%', escapeHtml(state.code)).replaceAll('%url%', url);
        case 'approved':
            return texts.approved.replace('%url%', url);
        case 'failed':
            return texts.failed[state.error].replace('%url%', url);
    }
}
/**
 * The error string of a failed lite-rpc call for the callback of `methodCall`, in the shape hm-rpc's retry
 * expects: a fault of the interface process is its fault string (`Failure`, `… (UNREACH)`), everything else
 * names the client's error code.
 *
 * @param e the error occulite-client threw
 */
function rpcCallbackError(e) {
    const err = e;
    const message = typeof err?.message === 'string' ? err.message : String(e);
    if (err?.code === 'rpc-fault' && err.faultCode !== undefined) {
        return message;
    }
    return typeof err?.code === 'string' ? `${err.code}: ${message}` : message;
}
/**
 * The id of a device or channel object in ioBroker (relative to the namespace) for a CCU address
 *
 * @param address the address, e.g. `000A1B2C3D4E5F:1`
 */
function objectIdOfAddress(address) {
    return address.replace(':', '.').replace(tools_1.FORBIDDEN_CHARS, '_');
}
/**
 * The reference of a device or channel in the system's metadata, as occulite-client keys it
 *
 * @param iface the interface name
 * @param address the address
 */
function refOfAddress(iface, address) {
    return `${iface}.${address}`;
}
/**
 * The name of a datapoint object: `<channel name>.<DATAPOINT>` when the system names the channel (as hm-rega
 * names them), else the datapoint alone (hm-rpc's own default)
 *
 * @param channelName the channel's name in the system, or undefined
 * @param datapoint the datapoint, e.g. `STATE`
 */
function datapointName(channelName, datapoint) {
    return channelName ? `${channelName}.${datapoint}` : datapoint;
}
/**
 * The characters the controller does not keep in an object id: it stores a `_` for each run of them (its own
 * `FORBIDDEN_CHARS`). Unlike hm-rpc's rule for addresses it allows a space, as ioBroker.hm-rega's room ids have.
 */
const ID_FORBIDDEN_CHARS = /[^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+/gu;
/** The enum kinds of ioBroker the system's taxonomy maps to: the `room` tree to `enum.rooms`, `function` to `enum.functions` */
const ENUM_KINDS = { room: 'enum.rooms', function: 'enum.functions' };
/**
 * The rooms and functions a CCU creates on its own, as ioBroker.hm-rega named their enums: the translation key
 * ReGa keeps as the name of a room or function the user never renamed, the name openccu-lite's import gives such a
 * room (German, the CCU WebUI's own word), and the id hm-rega made of the key (the English word of its table,
 * spaces as `_`; `Climate_сontrol` is spelled with a Cyrillic `с` there).
 */
const BUILTIN_ENUMS = [
    { key: 'roomLivingRoom', name: 'Wohnzimmer', id: 'enum.rooms.LivingRoom' },
    { key: 'roomKitchen', name: 'Küche', id: 'enum.rooms.Kitchen' },
    { key: 'roomBedroom', name: 'Schlafzimmer', id: 'enum.rooms.Bedroom' },
    { key: 'roomChildrensRoom1', name: 'Kinderzimmer 1', id: 'enum.rooms.Childrens_room_1' },
    { key: 'roomChildrensRoom2', name: 'Kinderzimmer 2', id: 'enum.rooms.Childrens_room_2' },
    { key: 'roomOffice', name: 'Büro', id: 'enum.rooms.Office' },
    { key: 'roomBathroom', name: 'Badezimmer', id: 'enum.rooms.Bathroom' },
    { key: 'roomGarage', name: 'Garage', id: 'enum.rooms.Garage' },
    { key: 'roomHWR', name: 'Hauswirtschaftsraum', id: 'enum.rooms.HWR' },
    { key: 'roomGarden', name: 'Garten', id: 'enum.rooms.Garden' },
    { key: 'roomTerrace', name: 'Terrasse', id: 'enum.rooms.Terrace' },
    { key: 'funcLight', name: 'Licht', id: 'enum.functions.Light' },
    { key: 'funcHeating', name: 'Heizung', id: 'enum.functions.Heating' },
    { key: 'funcClimateControl', name: 'Klima', id: 'enum.functions.Climate_сontrol' },
    { key: 'funcWeather', name: 'Wetter', id: 'enum.functions.Weather' },
    { key: 'funcEnvironment', name: 'Umwelt', id: 'enum.functions.Environment' },
    { key: 'funcSecurity', name: 'Sicherheit', id: 'enum.functions.Security' },
    { key: 'funcLock', name: 'Verschluss', id: 'enum.functions.Lock' },
    { key: 'funcButton', name: 'Taster', id: 'enum.functions.Button' },
    { key: 'funcCentral', name: 'Zentrale', id: 'enum.functions.Central' },
    { key: 'funcEnergy', name: 'Energiemanagement', id: 'enum.functions.Energy' },
];
/**
 * The part of an enum id a name gives, as ioBroker.hm-rega makes it of a CCU room: the name as it is (case,
 * spaces and umlauts kept), a dot as `_`; a character an object id cannot hold becomes `_` as well, as the
 * controller stores it
 *
 * @param name the room's or function's name
 */
function enumIdPart(name) {
    return name.replace(/\./g, '_').replace(ID_FORBIDDEN_CHARS, '_');
}
/**
 * The id of the ioBroker enum for a node of the system's taxonomy, as ioBroker.hm-rega names the enum of a CCU
 * room: `enum.rooms.<name>` (`Living Room` → `enum.rooms.Living Room`), so the enums hm-rega made are carried on.
 * A room tree is flattened: a nested node is named by the names along its path (`EG` / `Bad` → `enum.rooms.EG_Bad`),
 * so two rooms `Bad` on two floors stay apart. Undefined for an enum of the system ioBroker has no counterpart for.
 *
 * @param path the node's path, e.g. `room/eg/bad`
 * @param nameOf the name of a node by its path, in the language asked for; a node without one is named by its id
 */
function enumIdOfPath(path, nameOf) {
    const segments = path.split('/');
    const kind = ENUM_KINDS[segments[0]];
    if (!kind || segments.length < 2 || segments.some(s => !s)) {
        return undefined;
    }
    const parts = [];
    for (let i = 1; i < segments.length; i++) {
        parts.push(enumIdPart(nameOf(segments.slice(0, i + 1).join('/')) || segments[i]));
    }
    return `${kind}.${parts.join('_')}`;
}
/**
 * The enum ioBroker.hm-rega made for one of the CCU's own rooms or functions, which openccu-lite's import named
 * in German: `Wohnzimmer` at the top of the room tree → `enum.rooms.LivingRoom`, made from the key
 * `roomLivingRoom`. Undefined for any other node.
 *
 * @param path the node's path
 * @param name the node's name
 */
function builtinEnumOf(path, name) {
    const segments = path.split('/');
    if (segments.length !== 2) {
        return undefined;
    }
    const prefix = segments[0] === 'room' ? 'room' : segments[0] === 'function' ? 'func' : undefined;
    const entry = BUILTIN_ENUMS.find(b => prefix !== undefined &&
        b.key.startsWith(prefix) &&
        (b.name === name || b.key === name || `\${${b.key}}` === name));
    return entry && { id: entry.id, key: entry.key };
}
/**
 * Whether an enum object is the one ioBroker.hm-rega made for a CCU room or function of the given translation
 * key (it keeps the CCU's name, `roomLivingRoom` or `${roomLivingRoom}`, in `native.Name`)
 *
 * @param obj the enum object
 * @param key the translation key, e.g. `roomLivingRoom`
 */
function isHmRegaEnumOf(obj, key) {
    const name = obj?.native?.Name;
    return name === key || name === `\${${key}}`;
}
/**
 * The ioBroker enums an object belongs to: its direct nodes in the system's taxonomy, each mapped to a flat enum
 * (a channel in `room/eg/bad` is a member of `enum.rooms.EG_Bad` and not of `enum.rooms.EG` - the innermost room,
 * as hm-rega handles the CCU's flat rooms)
 *
 * @param nodes the direct nodes of the object (`membership(ref, {inherit: false})` of occulite-client, rooms and functions together)
 * @param nameOf the name of any node by its path (for the names along a nested node's path)
 */
function enumsOfNodes(nodes, nameOf = () => undefined) {
    const out = [];
    for (const node of nodes) {
        const name = node.name || nameOf(node.path) || node.path.slice(node.path.lastIndexOf('/') + 1);
        const id = enumIdOfPath(node.path, p => (p === node.path ? name : nameOf(p)));
        if (id && !out.some(e => e.id === id)) {
            const builtin = builtinEnumOf(node.path, name);
            out.push({ id, name, path: node.path, ...(builtin ? { builtin } : {}) });
        }
    }
    return out;
}
//# sourceMappingURL=lite.js.map