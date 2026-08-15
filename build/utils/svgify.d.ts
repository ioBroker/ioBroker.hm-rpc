/**
 * Convert an icon mask into a theme-adaptive SVG.
 *
 * @param buffer the PNG mask
 * @param name the icon file name, used to derive the mask id
 */
export declare function toThemeSvg(buffer: Buffer, name: string): string;
/** Write an SVG next to every PNG in admin/icons. Deterministic — safe to re-run. */
export declare function svgifyAll(): Promise<void>;
