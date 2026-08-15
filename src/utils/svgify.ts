/**
 * Wraps the device icon masks (see iconMask.ts) into theme-adaptive SVGs.
 *
 * The masks solve half the problem: they carry the shape in the alpha channel,
 * but their ink is black, so on the dark admin theme they are drawn black on a
 * dark background. An SVG can paint that same shape with `fill="currentColor"`
 * instead, which the admin resolves against the active theme — but only when the
 * icon reaches it as a data URI: `ObjectBrowser/utils.tsx` renders
 * `data:image/svg…` through react-inlinesvg (the markup lands in the DOM and
 * inherits `color`), while a file path ends up in an `<img>`, where nothing is
 * inherited. `main.ts` therefore inlines these files rather than linking them.
 *
 * The shape is kept as a raster mask rather than traced into paths. These
 * drawings are 50px shaded sketches, not clean line art — their thin strokes and
 * grey fills sit below one pixel, and every threshold that keeps the outlines
 * also welds the shading into blobs. Carrying the alpha channel over into an SVG
 * `<mask>` reproduces the icon pixel for pixel (verified: identical on all 2450
 * pixels of 102_hm-es-tx-wm) and still follows the theme, at a smaller payload
 * than a trace.
 *
 * The mask image is an 8-bit grayscale PNG whose luminance *is* the former alpha
 * channel, which is a quarter of the RGBA data and compresses well because the
 * ink is a constant.
 */
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const ICON_DIR = 'admin/icons';

/**
 * Icons are drawn at 28px in the object browser; 128px is generous headroom for
 * any other use and keeps the handful of 250px OCCU images from bloating the
 * device objects they end up in.
 */
const MAX_EDGE = 128;

/**
 * Box-filter the alpha channel down to at most MAX_EDGE and return it as an
 * 8-bit grayscale PNG, where luminance carries what used to be the alpha.
 *
 * @param src the decoded icon mask
 */
function alphaToGrayPng(src: PNG): { png: Buffer; width: number; height: number } {
    const scale = Math.min(1, MAX_EDGE / Math.max(src.width, src.height));
    const width = Math.max(1, Math.round(src.width * scale));
    const height = Math.max(1, Math.round(src.height * scale));
    const out = new PNG({ width, height });

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const x0 = Math.floor(x / scale);
            const x1 = Math.min(src.width, Math.max(x0 + 1, Math.floor((x + 1) / scale)));
            const y0 = Math.floor(y / scale);
            const y1 = Math.min(src.height, Math.max(y0 + 1, Math.floor((y + 1) / scale)));
            let sum = 0;
            let count = 0;
            for (let sy = y0; sy < y1; sy++) {
                for (let sx = x0; sx < x1; sx++) {
                    sum += src.data[((sy * src.width + sx) << 2) + 3];
                    count++;
                }
            }
            const alpha = Math.round(count ? sum / count : 0);
            const i = (y * width + x) << 2;
            out.data[i] = alpha;
            out.data[i + 1] = alpha;
            out.data[i + 2] = alpha;
            out.data[i + 3] = 255;
        }
    }
    return { png: PNG.sync.write(out, { colorType: 0 }), width, height };
}

/** Derive a mask id that is unique per icon — several icons are inlined into the same DOM. */
function maskId(name: string): string {
    return `hmi_${name.replace(/\.[^.]+$/, '').replace(/\W/g, '_')}`;
}

/**
 * Convert an icon mask into a theme-adaptive SVG.
 *
 * @param buffer the PNG mask
 * @param name the icon file name, used to derive the mask id
 */
export function toThemeSvg(buffer: Buffer, name: string): string {
    const { png, width, height } = alphaToGrayPng(PNG.sync.read(buffer));
    const id = maskId(name);
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
        `<mask id="${id}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString('base64')}"/></mask>` +
        `<rect width="${width}" height="${height}" fill="currentColor" mask="url(#${id})"/>` +
        `</svg>\n`
    );
}

/** Write an SVG next to every PNG in admin/icons. Deterministic — safe to re-run. */
export async function svgifyAll(): Promise<void> {
    const files = (await fs.promises.readdir(ICON_DIR)).filter(name => name.toLowerCase().endsWith('.png'));
    let written = 0;
    for (const name of files) {
        const target = path.join(ICON_DIR, name.replace(/\.png$/i, '.svg'));
        try {
            const svg = toThemeSvg(await fs.promises.readFile(path.join(ICON_DIR, name)), name);
            await fs.promises.writeFile(target, svg);
            written++;
        } catch (e: unknown) {
            console.warn(`  ! could not convert ${name}: ${(e as Error).message}`);
        }
    }
    console.log(`Wrapped ${written}/${files.length} icon(s) into theme-adaptive SVGs.`);
}
