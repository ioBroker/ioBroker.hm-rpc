import { isTransitionFlag, TRANSITION_FLAGS, TRANSITIONAL_DATAPOINTS } from './tools';

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

interface PendingLevel {
    values: Map<string, any>;
    timer: unknown;
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
export class TransitionFilter {
    private readonly pending = new Map<string, PendingLevel>();
    private readonly lastFlag = new Map<string, { moving: boolean; ts: number }>();
    private readonly waitMs: number;
    private readonly sameMessageMs: number;
    private readonly now: () => number;

    constructor(private readonly options: TransitionFilterOptions) {
        this.waitMs = options.waitMs ?? 300;
        this.sameMessageMs = options.sameMessageMs ?? 50;
        this.now = options.now ?? Date.now;
    }

    /**
     * Handles one event. Returns true if the value must not be written now (it is held back or dropped)
     *
     * @param channelId channel relative to the namespace, e.g. `MEQ0632459.1`
     * @param datapoint name of the data point, e.g. `LEVEL`
     * @param val the converted value of the event
     */
    handle(channelId: string, datapoint: string, val: any): boolean {
        if (TRANSITION_FLAGS.includes(datapoint)) {
            const moving = isTransitionFlag(datapoint, val);
            this.lastFlag.set(channelId, { moving, ts: this.now() });
            this.resolve(channelId, moving);
            // the flag itself is always written
            return false;
        }

        if (!TRANSITIONAL_DATAPOINTS.includes(datapoint) || !this.options.hasFlag(channelId)) {
            return false;
        }

        // the flag of this message arrived already (other order of the events)
        const last = this.lastFlag.get(channelId);
        if (last && this.now() - last.ts <= this.sameMessageMs) {
            if (last.moving) {
                this.options.log?.(`${channelId}.${datapoint}: interim value ${val} skipped, channel is moving`);
                return true;
            }
            return false;
        }

        let pending = this.pending.get(channelId);
        if (!pending) {
            pending = {
                values: new Map(),
                timer: this.options.setTimeout(() => this.resolve(channelId, false), this.waitMs),
            };
            this.pending.set(channelId, pending);
        }
        pending.values.set(datapoint, val);
        return true;
    }

    /** Clears all timers, e.g. on unload */
    clear(): void {
        for (const pending of this.pending.values()) {
            this.options.clearTimeout(pending.timer);
        }
        this.pending.clear();
        this.lastFlag.clear();
    }

    private resolve(channelId: string, moving: boolean): void {
        const pending = this.pending.get(channelId);
        if (!pending) {
            return;
        }
        this.pending.delete(channelId);
        this.options.clearTimeout(pending.timer);

        for (const [datapoint, val] of pending.values) {
            if (moving) {
                this.options.log?.(`${channelId}.${datapoint}: interim value ${val} skipped, channel is moving`);
            } else {
                this.options.write(`${channelId}.${datapoint}`, val);
            }
        }
    }
}
