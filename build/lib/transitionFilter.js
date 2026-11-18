"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransitionFilter = void 0;
const tools_1 = require("./tools");
/**
 * Suppresses the interim LEVEL values of moving channels.
 *
 * A dimmer or blind acknowledges a command immediately with the level at the start of the ramp and `WORKING = true`
 * (`PROCESS = NOT_STABLE` on Homematic IP); the final level follows with the next status message and `WORKING = false`.
 * The CCU sends the values of one status message as separate events within a few milliseconds, LEVEL first.
 * Therefore, a LEVEL of a channel with such a flag is held back until the flag of the same message arrives:
 * it is dropped if the channel is moving, otherwise it is written. Without a flag it is written after `waitMs`.
 */
class TransitionFilter {
    constructor(options) {
        this.options = options;
        this.pending = new Map();
        this.lastFlag = new Map();
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
    handle(channelId, datapoint, val) {
        if (tools_1.TRANSITION_FLAGS.includes(datapoint)) {
            const moving = (0, tools_1.isTransitionFlag)(datapoint, val);
            this.lastFlag.set(channelId, { moving, ts: this.now() });
            this.resolve(channelId, moving);
            // the flag itself is always written
            return false;
        }
        if (!tools_1.TRANSITIONAL_DATAPOINTS.includes(datapoint) || !this.options.hasFlag(channelId)) {
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
    clear() {
        for (const pending of this.pending.values()) {
            this.options.clearTimeout(pending.timer);
        }
        this.pending.clear();
        this.lastFlag.clear();
    }
    resolve(channelId, moving) {
        const pending = this.pending.get(channelId);
        if (!pending) {
            return;
        }
        this.pending.delete(channelId);
        this.options.clearTimeout(pending.timer);
        for (const [datapoint, val] of pending.values) {
            if (moving) {
                this.options.log?.(`${channelId}.${datapoint}: interim value ${val} skipped, channel is moving`);
            }
            else {
                this.options.write(`${channelId}.${datapoint}`, val);
            }
        }
    }
}
exports.TransitionFilter = TransitionFilter;
//# sourceMappingURL=transitionFilter.js.map