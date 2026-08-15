"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Regenerates the device-icon set and the TYPE -> file map (src/lib/images.ts)
 * from the authoritative eq-3/occu device database (WebUI/www/config/devdescr/
 * DEVDB.tcl -> `DEV_PATHS`), which maps every CCU device TYPE to its official
 * image. This replaces the previous manual grab that shelled out to an unlisted
 * `fetcher` CLI and the hand-maintained map, so new devices are picked up
 * automatically from the same source all CCU projects use.
 *
 * Run: `npm run update-images`
 *
 * Only *missing* icon files are downloaded; existing files are left untouched so
 * any local post-processing (background removal) is preserved. Device types that
 * are intentionally not the OCCU default are kept in `MANUAL` below, so a
 * regeneration never silently changes an already-shipped device's icon.
 */
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const iconMask_1 = require("./iconMask");
const svgify_1 = require("./svgify");
const OCCU_RAW = 'https://raw.githubusercontent.com/eq-3/occu/master';
const DEVDB_URL = `${OCCU_RAW}/WebUI/www/config/devdescr/DEVDB.tcl`;
const WWW_BASE = `${OCCU_RAW}/WebUI/www`; // DEV_PATHS stores paths relative to WebUI/www
const ICON_DIR = 'admin/icons';
const IMAGES_TS = 'src/lib/images.ts';
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
const MANUAL = {
    'HmIP-PSM2': '113_hmip-psm_thumb.svg', // no OCCU entry
    'HmIP-DLD': 'HmIP-DLD.svg', // OCCU: 214_hmip-dld_thumb.png
    'HmIP-KRCK': 'HmIP-KRCK.svg', // OCCU: 84_hm-rc-4-x_thumb.png
    'HmIP-RCV-50': 'CCU3_thumb.svg', // OCCU: CCU3-1-50_thumb.png
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
function shippedIcon(pngFile) {
    return pngFile.replace(/\.png$/i, '.svg');
}
/** Minimal TCL list tokenizer: top-level words and {brace groups} (nesting-aware). */
function tclTokens(s) {
    const out = [];
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
                }
                else if (s[i] === '}') {
                    depth--;
                    if (depth === 0) {
                        i++;
                        break;
                    }
                }
            }
            out.push(s.slice(start + 1, i - 1));
        }
        else {
            const start = i;
            while (i < n && !' \t\r\n{}'.includes(s[i])) {
                i++;
            }
            out.push(s.slice(start, i));
        }
    }
    return out;
}
/** Parse the `DEV_PATHS` array into { deviceType: {file, srcPath} } using the 50px image. */
function parseDevPaths(tcl) {
    const marker = tcl.match(/array set DEV_PATHS\s*\{/);
    if (!marker) {
        throw new Error('DEV_PATHS array not found in DEVDB.tcl — OCCU layout changed?');
    }
    let i = marker.index + marker[0].length - 1;
    let depth = 0;
    const start = i;
    for (; i < tcl.length; i++) {
        if (tcl[i] === '{') {
            depth++;
        }
        else if (tcl[i] === '}') {
            depth--;
            if (depth === 0) {
                break;
            }
        }
    }
    const tokens = tclTokens(tcl.slice(start + 1, i));
    const map = {};
    for (let k = 0; k + 1 < tokens.length; k += 2) {
        const type = tokens[k];
        for (const entry of tclTokens(tokens[k + 1])) {
            const sp = entry.indexOf(' ');
            if (sp === -1) {
                continue;
            }
            if (entry.slice(0, sp) === '50') {
                const p = entry.slice(sp + 1).trim();
                map[type] = { file: path_1.default.basename(p), srcPath: p };
            }
        }
    }
    return map;
}
/** Quote a map key only when it is not a plain JS identifier (matches the existing file style). */
function tsKey(key) {
    return /^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key.replace(/'/g, "\\'")}'`;
}
async function main() {
    console.log(`Fetching OCCU device database: ${DEVDB_URL}`);
    const tcl = (await axios_1.default.get(DEVDB_URL, { responseType: 'text' })).data;
    const occu = parseDevPaths(tcl);
    console.log(`DEV_PATHS maps ${Object.keys(occu).length} device types.`);
    // Final map: OCCU base, MANUAL overrides win. Values are the shipped SVGs.
    const map = {};
    for (const [type, icon] of Object.entries(occu)) {
        map[type] = shippedIcon(icon.file);
    }
    Object.assign(map, MANUAL);
    // Download missing icon files, then convert the whole set to theme-adaptive
    // masks so every icon renders on any admin theme (idempotent — icons that are
    // already masks are left untouched).
    await fs_1.default.promises.mkdir(ICON_DIR, { recursive: true });
    const existing = new Set(await fs_1.default.promises.readdir(ICON_DIR));
    const wanted = new Map(); // file -> srcPath
    for (const icon of Object.values(occu)) {
        if (!wanted.has(icon.file)) {
            wanted.set(icon.file, icon.srcPath);
        }
    }
    let added = 0;
    for (const [file, srcPath] of wanted) {
        if (existing.has(file)) {
            continue;
        }
        try {
            const res = await axios_1.default.get(`${WWW_BASE}${srcPath}`, { responseType: 'arraybuffer' });
            await fs_1.default.promises.writeFile(path_1.default.join(ICON_DIR, file), Buffer.from(res.data));
            existing.add(file);
            added++;
        }
        catch (e) {
            console.warn(`  ! could not download ${file}: ${e.message}`);
        }
    }
    console.log(`Downloaded ${added} new icon file(s).`);
    // Normalise the downloaded images into masks (see iconMask.ts) and wrap each
    // one into the theme-adaptive SVG the adapter actually ships (see svgify.ts).
    await (0, iconMask_1.maskifyAll)();
    await (0, svgify_1.svgifyAll)();
    // Sanity: every mapped file must exist on disk, otherwise the icon is broken.
    const onDisk = new Set(await fs_1.default.promises.readdir(ICON_DIR));
    const missingFiles = [...new Set(Object.values(map))].filter(f => !onDisk.has(f));
    if (missingFiles.length) {
        console.warn(`⚠ ${missingFiles.length} mapped icon file(s) missing on disk: ${missingFiles.join(', ')}`);
    }
    // Write src/lib/images.ts (sorted, matching the previous file's style).
    const keys = Object.keys(map).sort();
    const body = keys.map(k => `    ${tsKey(k)}: '${map[k]}',`).join('\n');
    const header = '// AUTO-GENERATED by `npm run update-images` from eq-3/occu DEVDB.tcl (DEV_PATHS).\n' +
        '// Do not edit by hand — change the MANUAL overrides in src/utils/updateImages.ts instead.\n';
    await fs_1.default.promises.writeFile(IMAGES_TS, `${header}export const images: Record<string, string> = {\n${body}\n};\n`);
    console.log(`Wrote ${IMAGES_TS} with ${keys.length} entries.`);
}
main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
//# sourceMappingURL=updateImages.js.map