export interface TransitionFilterOptions {
    /** Writes the value of a data point, `id` is relative to the namespace, e.g. `MEQ0632459.1.LEVEL` */
    write: (id: string, val: any) => void;
    /** True if the channel has a data point which tells whether it is moving (`WORKING` or `PROCESS`) */
    hasFlag: (channelId: string) => boolean;
    setTimeout: (cb: () => void, ms: number) => unknown;
    clearTimeout: (timer: unknown) => void;
    /** How long a LEVEL waits for the flag of the same status message (ms) */
    waitMs?: number;
    /** A flag which arrived at most this long before the LEVEL belongs to the same status message (ms) */
    sameMessageMs?: number;
    now?: () => number;
    log?: (msg: string) => void;
}
/**
 * Suppresses the interim LEVEL values of moving channels.
 *
 * A dimmer or blind acknowledges a command immediately with the level at the start of the ramp and `WORKING = true`
 * (`PROCESS = NOT_STABLE` on Homematic IP); the final level follows with the next status message and `WORKING = false`.
 * The CCU sends the values of one status message as separate events within a few milliseconds, LEVEL first.
 * Therefore, a LEVEL of a channel with such a flag is held back until the flag of the same message arrives:
 * it is dropped if the channel is moving, otherwise it is written. Without a flag it is written after `waitMs`.
 */
export declare class TransitionFilter {
    private readonly options;
    private readonly pending;
    private readonly lastFlag;
    private readonly waitMs;
    private readonly sameMessageMs;
    private readonly now;
    constructor(options: TransitionFilterOptions);
    /**
     * Handles one event. Returns true if the value must not be written now (it is held back or dropped)
     *
     * @param channelId channel relative to the namespace, e.g. `MEQ0632459.1`
     * @param datapoint name of the data point, e.g. `LEVEL`
     * @param val the converted value of the event
     */
    handle(channelId: string, datapoint: string, val: any): boolean;
    /** Clears all timers, e.g. on unload */
    clear(): void;
    private resolve;
}
