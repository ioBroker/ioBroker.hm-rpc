/**
 * The pure parts of the openccu-lite mode: nothing here talks to the system or to ioBroker.
 *
 * openccu-lite is a CCU firmware without ReGaHSS. Its interface processes are reached through lite-rpc
 * (`/api/rpc/v1`): the requests over HTTP(S) with a token, the events as a stream the adapter opens -
 * no callback server, no `init`. The names and rooms of devices and channels are the system's metadata.
 */

import type { Daemon } from './_types';
import { FORBIDDEN_CHARS } from './tools';

/** The interfaces lite-rpc carries (the names of `InterfacesList.xml`, as `GET /api/rpc/v1/interfaces` lists them) */
export const LITE_INTERFACES = ['HmIP-RF', 'BidCos-RF', 'BidCos-Wired', 'VirtualDevices'] as const;

/** The scopes the pairing asks for: paramsets are written (`configure`), the names are read */
export const LITE_ACCESS = { devices: 'configure', names: 'read' } as const;

/** The pairing waits at most this long for the approval (the system lets a request expire after five minutes) */
export const PAIRING_TIMEOUT_MS = 5.5 * 60_000;

/** What the adapter answers the admin when a pairing does not end with a token */
export type PairingErrorCode =
    | 'no-url'
    | 'unreachable'
    | 'not-openccu-lite'
    | 'no-pairing'
    | 'rejected'
    | 'expired'
    | 'timeout'
    | 'busy'
    | 'certificate'
    | 'failed';

/** The state of a pairing, as the instance state `info.pairing` shows it */
export type PairingState =
    | { phase: 'idle' }
    | { phase: 'requesting'; url: string }
    | { phase: 'waiting'; url: string; code: string }
    | { phase: 'approved'; url: string }
    | { phase: 'failed'; url: string; error: PairingErrorCode };

/**
 * The daemon an interface of the system corresponds to. The daemon decides the CCU specific fixes of the
 * paramset descriptions (`fixParamset`) and which devices are filtered on `newDevices`, so the lite mode
 * derives it from the interface instead of asking the user twice.
 *
 * @param iface the interface name, e.g. `HmIP-RF`
 */
export function interfaceDaemon(iface: string): Daemon {
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

/** The fields of the instance configuration that name the system (the same as for a CCU) */
export interface LiteAddress {
    homematicAddress: string;
    homematicPort: string;
    useHttps: boolean;
}

/**
 * The URL of the system from the configuration: `https://<address>:<port>` (`http://` without TLS), the default
 * port of the scheme left out. A scheme or a path the user typed into the address is dropped; blanks are trimmed.
 * An empty address gives an empty URL.
 *
 * @param config the address fields
 */
export function liteUrlOf(config: LiteAddress): string {
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
export function liteUrlParts(url: string): LiteAddress {
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
export function pairingErrorCode(e: unknown): PairingErrorCode {
    const code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : '';
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
        waiting:
            'Pairing code <b style="font-size: 1.6em; letter-spacing: 0.1em">%code%</b> - approve the request on the <a href="%url%" target="_blank" rel="noopener">Status page of the system</a> (the code must match). Waiting …',
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
        waiting:
            'Pairing-Code <b style="font-size: 1.6em; letter-spacing: 0.1em">%code%</b> - die Anfrage auf der <a href="%url%" target="_blank" rel="noopener">Statusseite des Systems</a> bestätigen (der Code muss übereinstimmen). Warte …',
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
} as const;

/**
 * Escapes a value for the HTML the admin renders
 *
 * @param value the text
 */
function escapeHtml(value: string): string {
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
export function pairingHtml(state: PairingState, lang: string): string {
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
export function rpcCallbackError(e: unknown): string {
    const err = e as { code?: unknown; faultCode?: unknown; message?: unknown };
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
export function objectIdOfAddress(address: string): string {
    return address.replace(':', '.').replace(FORBIDDEN_CHARS, '_');
}

/**
 * The reference of a device or channel in the system's metadata, as occulite-client keys it
 *
 * @param iface the interface name
 * @param address the address
 */
export function refOfAddress(iface: string, address: string): string {
    return `${iface}.${address}`;
}

/**
 * The name of a datapoint object: `<channel name>.<DATAPOINT>` when the system names the channel (as hm-rega
 * names them), else the datapoint alone (hm-rpc's own default)
 *
 * @param channelName the channel's name in the system, or undefined
 * @param datapoint the datapoint, e.g. `STATE`
 */
export function datapointName(channelName: string | undefined, datapoint: string): string {
    return channelName ? `${channelName}.${datapoint}` : datapoint;
}

/** The enum kinds of ioBroker the system's taxonomy maps to: the `room` tree to `enum.rooms`, `function` to `enum.functions` */
const ENUM_KINDS: Record<string, string> = { room: 'enum.rooms', function: 'enum.functions' };

/**
 * The id of the ioBroker enum for a node of the system's taxonomy: a room tree is flattened, every node is an
 * enum of its own named by its path (`room/eg/bad` → `enum.rooms.eg_bad`), so two rooms `bad` on two floors
 * stay apart. Undefined for an enum of the system ioBroker has no counterpart for.
 *
 * @param path the node's path, e.g. `room/eg/bad`
 */
export function enumIdOfPath(path: string): string | undefined {
    const slash = path.indexOf('/');
    if (slash < 0) {
        return undefined;
    }
    const kind = ENUM_KINDS[path.slice(0, slash)];
    if (!kind) {
        return undefined;
    }
    const id = path
        .slice(slash + 1)
        .split('/')
        .map(part => part.replace(FORBIDDEN_CHARS, '_').replace(/\./g, '_'))
        .join('_');
    return id ? `${kind}.${id}` : undefined;
}

/** An ioBroker enum an object belongs to directly (one of its innermost nodes) */
export interface EnumMembership {
    /** the enum object's id, e.g. `enum.rooms.eg_bad` */
    id: string;
    /** the node's name in the language asked for */
    name: string;
    /** the node's path in the system, e.g. `room/eg/bad` */
    path: string;
}

/**
 * The ioBroker enums an object belongs to: its direct nodes in the system's taxonomy, each mapped to a flat enum
 * (a channel in `room/eg/bad` is a member of `enum.rooms.eg_bad` and not of `enum.rooms.eg` - the innermost room, as
 * hm-rega handles the CCU's flat rooms)
 *
 * @param nodes the direct nodes of the object (`membership(ref, {inherit: false})` of occulite-client, rooms and functions together)
 */
export function enumsOfNodes(nodes: { path: string; name: string }[]): EnumMembership[] {
    const out: EnumMembership[] = [];
    for (const node of nodes) {
        const id = enumIdOfPath(node.path);
        if (id && !out.some(e => e.id === id)) {
            out.push({ id, name: node.name || node.path.slice(node.path.lastIndexOf('/') + 1), path: node.path });
        }
    }
    return out;
}
