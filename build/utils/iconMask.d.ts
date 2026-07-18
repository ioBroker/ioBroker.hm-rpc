/** Returns the icon as a theme mask, or null if it already is one. */
export declare function toThemeMask(buffer: Buffer): Buffer | null;
/** Convert every PNG in admin/icons to a theme mask in place. Idempotent. */
export declare function maskifyAll(): Promise<void>;
