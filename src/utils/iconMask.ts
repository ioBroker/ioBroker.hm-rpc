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
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const ICON_DIR = 'admin/icons';

/** Returns the icon as a theme mask, or null if it already is one. */
export function toThemeMask(buffer: Buffer): Buffer | null {
    const src = PNG.sync.read(buffer);
    const out = new PNG({ width: src.width, height: src.height }); // always RGBA
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
    return changed ? PNG.sync.write(out) : null;
}

/** Convert every PNG in admin/icons to a theme mask in place. Idempotent. */
export async function maskifyAll(): Promise<void> {
    const files = (await fs.promises.readdir(ICON_DIR)).filter(name => name.toLowerCase().endsWith('.png'));
    let masked = 0;
    for (const name of files) {
        const file = path.join(ICON_DIR, name);
        let result: Buffer | null;
        try {
            result = toThemeMask(await fs.promises.readFile(file));
        } catch (e: unknown) {
            console.warn(`  ! skip ${name}: ${(e as Error).message}`);
            continue;
        }
        if (result) {
            await fs.promises.writeFile(file, result);
            masked++;
        }
    }
    console.log(`Converted ${masked}/${files.length} icon(s) to theme masks.`);
}
