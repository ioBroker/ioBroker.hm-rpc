"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toThemeMask = toThemeMask;
exports.maskifyAll = maskifyAll;
/**
 * Converts the device icons into theme-adaptive black + alpha masks.
 *
 * The admin renders object icons with a theme-dependent filter (it inverts them
 * on the dark theme). An icon therefore only looks right on *both* themes when it
 * is a pure black mask whose shape lives in the alpha channel: black on the light
 * theme, white on the dark theme. Photo-like icons with a light fill or colour do
 * not survive the inversion and turn dark/negative on the dark theme.
 *
 * This transform makes every icon such a mask: `rgb -> black`, and
 * `alpha = alpha * (255 - luminance) / 255`, so dark parts stay opaque and light
 * parts become transparent. It is idempotent — an icon that is already a black
 * mask is returned unchanged — so it can run on the whole set on every update.
 *
 * Pure JS (pngjs), cross-platform. Replaces the previous background-removal, which
 * only stripped the background and left the (non-adaptive) colours in place.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pngjs_1 = require("pngjs");
const ICON_DIR = 'admin/icons';
/** Returns the icon as a theme mask, or null if it already is one. */
function toThemeMask(buffer) {
    const src = pngjs_1.PNG.sync.read(buffer);
    const out = new pngjs_1.PNG({ width: src.width, height: src.height }); // always RGBA
    const s = src.data;
    const d = out.data;
    let changed = false;
    for (let i = 0; i < s.length; i += 4) {
        const luminance = 0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2];
        const alpha = Math.round((s[i + 3] * (255 - luminance)) / 255);
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = alpha;
        if (s[i] !== 0 || s[i + 1] !== 0 || s[i + 2] !== 0 || s[i + 3] !== alpha) {
            changed = true;
        }
    }
    return changed ? pngjs_1.PNG.sync.write(out) : null;
}
/** Convert every PNG in admin/icons to a theme mask in place. Idempotent. */
async function maskifyAll() {
    const files = (await fs_1.default.promises.readdir(ICON_DIR)).filter(name => name.toLowerCase().endsWith('.png'));
    let masked = 0;
    for (const name of files) {
        const file = path_1.default.join(ICON_DIR, name);
        let result;
        try {
            result = toThemeMask(await fs_1.default.promises.readFile(file));
        }
        catch (e) {
            console.warn(`  ! skip ${name}: ${e.message}`);
            continue;
        }
        if (result) {
            await fs_1.default.promises.writeFile(file, result);
            masked++;
        }
    }
    console.log(`Converted ${masked}/${files.length} icon(s) to theme masks.`);
}
//# sourceMappingURL=iconMask.js.map