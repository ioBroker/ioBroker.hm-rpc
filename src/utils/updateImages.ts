/**
 * Regenerates the device-icon set and the TYPE -> file map (src/lib/images.ts)
 * from the authoritative eq-3/occu device database (WebUI/www/config/devdescr/
 * DEVDB.tcl -> `DEV_PATHS`), which maps every CCU device TYPE to its official
 * image. This replaces the previous manual grab that shelled out to an unlisted
 * `fetcher` CLI and the hand-maintained map, so new devices are picked up
 * automatically from the same source all CCU projects use.
 *
 * Homebrew devices (AskSin++) are not in the OCCU database: their CCU add-ons
 * patch `DEV_PATHS` at install time. Their icons are taken from the same add-on
 * sources — jp112sdl/JP-HB-Devices-addon (`devdb.csv`) and the TomMajor
 * HB-TM-Devices-AddOn — so they show the same icon as in the CCU WebUI.
 *
 * Run: `npm run update-images`
 *
 * Only *missing* icon files are downloaded; existing files are left untouched so
 * any local post-processing (background removal) is preserved. Device types that
 * are intentionally not the OCCU default are kept in `MANUAL` below, so a
 * regeneration never silently changes an already-shipped device's icon.
 */
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { maskifyAll } from './iconMask';
import { svgifyAll } from './svgify';

const OCCU_RAW = 'https://raw.githubusercontent.com/eq-3/occu/master';
const DEVDB_URL = `${OCCU_RAW}/WebUI/www/config/devdescr/DEVDB.tcl`;
const WWW_BASE = `${OCCU_RAW}/WebUI/www`; // DEV_PATHS stores paths relative to WebUI/www
const ICON_DIR = 'admin/icons';
const IMAGES_TS = 'src/lib/images.ts';

/** jp112sdl's add-on lists its devices as `TYPE;image` in devdb.csv. */
const JP_HB_RAW = 'https://raw.githubusercontent.com/jp112sdl/JP-HB-Devices-addon/master/src/addon';
const JP_HB_DEVDB_URL = `${JP_HB_RAW}/devdb.csv`;

/**
 * TomMajor's add-on has no device list, only one install script per device, so
 * its devices are listed here (TYPE -> image, as in the `install_*` scripts).
 */
const TM_HB_RAW = 'https://raw.githubusercontent.com/TomMajor/SmartHome/master/HB-TM-Devices-AddOn/CCU_RM/src/addon';
const TM_HB_DEVICES: Record<string, string> = {
    'HB-Sec-WDS-2': 'hb-sec-wds-2',
    'HB-SEN-LJet': 'hb-sen-ljet',
    'HB-UNI-Sensor-Blitz': 'hb-uni-sensor-blitz',
    'HB-UNI-Sensor-Heizung': 'hb-uni-sensor-heizung',
    'HB-UNI-Sensor1': 'hb-uni-sensor1',
    'HB-UNI-Sensor2': 'hb-uni-sensor2',
    'HB-UNI-Sensor3': 'hb-uni-sensor3',
    'HB-UNI-Sensor4': 'hb-uni-sensor4',
    'HB-UNI-Sensor5': 'hb-uni-sensor5',
    'HB-UNI-Sensor6': 'hb-uni-sensor6',
};

/**
 * Device types whose icon is intentionally NOT the current OCCU default:
 * adapter-specific additions (no OCCU entry) or curated choices. Kept verbatim
 * so regenerating never changes an existing device's icon. The commented OCCU
 * value shows the source image that would be used otherwise — drop an entry here
 * to adopt it.
 *
 * These are the shipped `.svg` names, like every other value in the map. The
 * comments name the OCCU `.png`, because that is what would be downloaded.
 */
const MANUAL: Record<string, string> = {
    'HmIP-PSM2': '113_hmip-psm_thumb.svg', // no OCCU entry
    'HmIP-DLD': 'HmIP-DLD.svg', // OCCU: 214_hmip-dld_thumb.png
    'HmIP-KRCK': 'HmIP-KRCK.svg', // OCCU: 84_hm-rc-4-x_thumb.png
    'HmIP-RCV-50': 'CCU3_thumb.svg', // OCCU: CCU3-1-50_thumb.png
    'HmIP-RFUSB': 'CCU3_thumb.svg', // no OCCU entry, radio module like RPI-RF-MOD
    'HmIP-SFD': '212_hmip-sfd-1.svg', // OCCU: 212_hmip-sfd_thumb.png
    'HmIP-STE2-PCB': 'HmIP-STE2-PCB.svg', // OCCU: 210_hmip-ste2-pcb_thumb.png
    'HmIP-eTRV-E': 'HmIP-eTRV-E.svg', // OCCU: 216_hmip-etrv-e_thumb.png
    'HmIP-eTRV-E-S': 'HmIP-eTRV-E.svg', // OCCU: 216_hmip-etrv-e_thumb.png
    'HmIPW-FALMOT-C12': 'HmIPW-FALMOT-C12.svg', // OCCU: 198_hmip-falmot-c12_thumb.png
    'RPI-RF-MOD': 'RPI-RF-MOD.svg', // OCCU: CCU3_thumb.png
};

/**
 * The icon that ships for an OCCU image: `admin/icons` holds one theme-adaptive
 * SVG per downloaded PNG (see svgify.ts), and that SVG is what the adapter puts
 * into `common.icon`. The PNG stays on disk as the source it was built from.
 *
 * @param pngFile the OCCU image file name
 */
function shippedIcon(pngFile: string): string {
    return pngFile.replace(/\.png$/i, '.svg');
}

/** Minimal TCL list tokenizer: top-level words and {brace groups} (nesting-aware). */
function tclTokens(s: string): string[] {
    const out: string[] = [];
    let i = 0;
    const n = s.length;
    while (i < n) {
        while (i < n && ' \t\r\n'.includes(s[i])) {
            i++;
        }
        if (i >= n) {
            break;
        }
        if (s[i] === '{') {
            let depth = 0;
            const start = i;
            for (; i < n; i++) {
                if (s[i] === '{') {
                    depth++;
                } else if (s[i] === '}') {
                    depth--;
                    if (depth === 0) {
                        i++;
                        break;
                    }
                }
            }
            out.push(s.slice(start + 1, i - 1));
        } else {
            const start = i;
            while (i < n && !' \t\r\n{}'.includes(s[i])) {
                i++;
            }
            out.push(s.slice(start, i));
        }
    }
    return out;
}

interface SourceIcon {
    /** image file name, as stored in admin/icons */
    file: string;
    /** where to download it from */
    url: string;
}

/** Parse the `DEV_PATHS` array into { deviceType: {file, url} } using the 50px image. */
function parseDevPaths(tcl: string): Record<string, SourceIcon> {
    const marker = tcl.match(/array set DEV_PATHS\s*\{/);
    if (!marker) {
        throw new Error('DEV_PATHS array not found in DEVDB.tcl — OCCU layout changed?');
    }
    let i = (marker.index as number) + marker[0].length - 1;
    let depth = 0;
    const start = i;
    for (; i < tcl.length; i++) {
        if (tcl[i] === '{') {
            depth++;
        } else if (tcl[i] === '}') {
            depth--;
            if (depth === 0) {
                break;
            }
        }
    }
    const tokens = tclTokens(tcl.slice(start + 1, i));
    const map: Record<string, SourceIcon> = {};
    for (let k = 0; k + 1 < tokens.length; k += 2) {
        const type = tokens[k];
        for (const entry of tclTokens(tokens[k + 1])) {
            const sp = entry.indexOf(' ');
            if (sp === -1) {
                continue;
            }
            if (entry.slice(0, sp) === '50') {
                const p = entry.slice(sp + 1).trim();
                map[type] = { file: path.basename(p), url: `${WWW_BASE}${p}` };
            }
        }
    }
    return map;
}

/**
 * Homebrew add-on devices, as their add-ons register them in `DEV_PATHS`: the
 * 50px image is `/config/img/devices/50/<image>_thumb.png`. Some reuse an
 * OCCU image (e.g. `4_hm-lc-sw1-fm`), which then comes from OCCU, not the add-on.
 */
async function homebrewIcons(): Promise<Record<string, SourceIcon>> {
    const thumb = (raw: string, image: string): SourceIcon => {
        const file = `${image}_thumb.png`;
        return { file, url: `${raw}/www/config/img/devices/50/${file}` };
    };
    const map: Record<string, SourceIcon> = {};
    try {
        const csv = (await axios.get<string>(JP_HB_DEVDB_URL, { responseType: 'text' })).data;
        for (const line of csv.split(/\r?\n/)) {
            const [type, image] = line.split(';').map(part => part?.trim());
            // the add-on's own installer only registers HB-* types
            if (type?.startsWith('HB-') && image) {
                map[type] = thumb(JP_HB_RAW, image);
            }
        }
    } catch (e: unknown) {
        console.warn(`  ! could not read ${JP_HB_DEVDB_URL}: ${(e as Error).message}`);
    }
    for (const [type, image] of Object.entries(TM_HB_DEVICES)) {
        map[type] = thumb(TM_HB_RAW, image);
    }
    return map;
}

/** Quote a map key only when it is not a plain JS identifier (matches the existing file style). */
function tsKey(key: string): string {
    return /^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key.replace(/'/g, "\\'")}'`;
}

async function main(): Promise<void> {
    console.log(`Fetching OCCU device database: ${DEVDB_URL}`);
    const tcl = (await axios.get<string>(DEVDB_URL, { responseType: 'text' })).data;
    const occu = parseDevPaths(tcl);
    console.log(`DEV_PATHS maps ${Object.keys(occu).length} device types.`);

    const homebrew = await homebrewIcons();
    console.log(`Homebrew add-ons map ${Object.keys(homebrew).length} device types.`);

    // Final map: OCCU base, homebrew devices OCCU does not know, MANUAL overrides
    // win. Values are the shipped SVGs.
    const sources: Record<string, SourceIcon> = { ...homebrew, ...occu };
    const map: Record<string, string> = {};
    for (const [type, icon] of Object.entries(sources)) {
        map[type] = shippedIcon(icon.file);
    }
    Object.assign(map, MANUAL);

    // Download missing icon files, then convert the whole set to theme-adaptive
    // masks so every icon renders on any admin theme (idempotent — icons that are
    // already masks are left untouched).
    await fs.promises.mkdir(ICON_DIR, { recursive: true });
    const existing = new Set(await fs.promises.readdir(ICON_DIR));
    // file -> url; OCCU first, so a homebrew device that reuses an OCCU image
    // gets it from OCCU
    const wanted = new Map<string, string>();
    for (const icon of [...Object.values(occu), ...Object.values(homebrew)]) {
        if (!wanted.has(icon.file)) {
            wanted.set(icon.file, icon.url);
        }
    }
    let added = 0;
    for (const [file, url] of wanted) {
        if (existing.has(file)) {
            continue;
        }
        try {
            const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
            await fs.promises.writeFile(path.join(ICON_DIR, file), Buffer.from(res.data));
            existing.add(file);
            added++;
        } catch (e: unknown) {
            console.warn(`  ! could not download ${file}: ${(e as Error).message}`);
        }
    }
    console.log(`Downloaded ${added} new icon file(s).`);

    // Normalise the downloaded images into masks (see iconMask.ts) and wrap each
    // one into the theme-adaptive SVG the adapter actually ships (see svgify.ts).
    await maskifyAll();
    await svgifyAll();

    // Sanity: every mapped file must exist on disk, otherwise the icon is broken.
    const onDisk = new Set(await fs.promises.readdir(ICON_DIR));
    const missingFiles = [...new Set(Object.values(map))].filter(f => !onDisk.has(f));
    if (missingFiles.length) {
        console.warn(`⚠ ${missingFiles.length} mapped icon file(s) missing on disk: ${missingFiles.join(', ')}`);
    }

    // Write src/lib/images.ts (sorted, matching the previous file's style).
    const keys = Object.keys(map).sort();
    const body = keys.map(k => `    ${tsKey(k)}: '${map[k]}',`).join('\n');
    const header =
        '// AUTO-GENERATED by `npm run update-images` from eq-3/occu DEVDB.tcl (DEV_PATHS)\n' +
        '// and the homebrew add-ons (jp112sdl/JP-HB-Devices-addon, TomMajor/SmartHome).\n' +
        '// Do not edit by hand — change the MANUAL overrides in src/utils/updateImages.ts instead.\n';
    await fs.promises.writeFile(IMAGES_TS, `${header}export const images: Record<string, string> = {\n${body}\n};\n`);
    console.log(`Wrote ${IMAGES_TS} with ${keys.length} entries.`);
}

main().catch((e: unknown) => {
    console.error((e as Error).message);
    process.exitCode = 1;
});
