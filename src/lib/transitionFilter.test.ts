import { expect } from 'chai';
import { describe, it } from 'mocha';
import { TransitionFilter } from './transitionFilter';
import { isTransitionFlag } from './tools';

/** filter with a manual clock and timers; `written` collects what reaches the states */
function setup(hasFlag = true): {
    filter: TransitionFilter;
    written: [string, any][];
    /** delivers an event like hm-rpc does: written immediately unless the filter takes it */
    event: (dp: string, val: any) => void;
    advance: (ms: number) => void;
} {
    let now = 0;
    let timers: { at: number; cb: () => void; id: number }[] = [];
    let nextId = 1;
    const written: [string, any][] = [];
    const filter = new TransitionFilter({
        write: (id, val) => written.push([id, val]),
        hasFlag: () => hasFlag,
        setTimeout: (cb, ms) => {
            const id = nextId++;
            timers.push({ at: now + ms, cb, id });
            return id;
        },
        clearTimeout: id => (timers = timers.filter(t => t.id !== id)),
        now: () => now,
    });
    const channel = 'MEQ0632459.1';
    return {
        filter,
        written,
        event: (dp, val) => {
            if (!filter.handle(channel, dp, val)) {
                written.push([`${channel}.${dp}`, val]);
            }
        },
        advance: ms => {
            now += ms;
            const due = timers.filter(t => t.at <= now);
            timers = timers.filter(t => t.at > now);
            due.forEach(t => t.cb());
        },
    };
}

describe('isTransitionFlag', () => {
    it('detects WORKING and PROCESS', () => {
        expect(isTransitionFlag('WORKING', true)).to.equal(true);
        expect(isTransitionFlag('WORKING', false)).to.equal(false);
        expect(isTransitionFlag('PROCESS', 1)).to.equal(true);
        expect(isTransitionFlag('PROCESS', 0)).to.equal(false);
        expect(isTransitionFlag('DIRECTION', 1)).to.equal(false);
    });
});

describe('TransitionFilter', () => {
    // sequence recorded on a HM-LC-Dim1T-FM-LF (CCU 3.89.11): command 100 % -> ACK -> status message ~3 s later
    it('drops the interim LEVEL of the acknowledgement and writes the final one', () => {
        const t = setup();
        t.event('LEVEL', 0.5);
        t.advance(7);
        t.event('WORKING', true);
        t.event('DIRECTION', 1);
        t.advance(3000);
        t.event('LEVEL', 100);
        t.advance(6);
        t.event('WORKING', false);
        t.event('DIRECTION', 0);

        const levels = t.written.filter(([id]) => id.endsWith('.LEVEL'));
        expect(levels).to.deep.equal([['MEQ0632459.1.LEVEL', 100]]);
        // the final LEVEL is written before the WORKING flag of its message
        expect(t.written.map(([id]) => id.split('.').pop())).to.deep.equal([
            'WORKING',
            'DIRECTION',
            'LEVEL',
            'WORKING',
            'DIRECTION',
        ]);
    });

    it('also works if the flag arrives before the LEVEL', () => {
        const t = setup();
        t.event('WORKING', true);
        t.advance(5);
        t.event('LEVEL', 4.5);
        t.advance(3000);
        t.event('WORKING', false);
        t.advance(5);
        t.event('LEVEL', 100);
        expect(t.written.filter(([id]) => id.endsWith('.LEVEL'))).to.deep.equal([['MEQ0632459.1.LEVEL', 100]]);
    });

    it('writes a held back LEVEL after the timeout if no flag follows', () => {
        const t = setup();
        t.event('LEVEL', 42);
        expect(t.written).to.deep.equal([]);
        t.advance(299);
        expect(t.written).to.deep.equal([]);
        t.advance(1);
        expect(t.written).to.deep.equal([['MEQ0632459.1.LEVEL', 42]]);
    });

    it('does not use an old flag of a previous message', () => {
        const t = setup();
        t.event('WORKING', true);
        t.advance(1000);
        t.event('LEVEL', 60);
        t.advance(5);
        t.event('WORKING', false);
        expect(t.written.filter(([id]) => id.endsWith('.LEVEL'))).to.deep.equal([['MEQ0632459.1.LEVEL', 60]]);
    });

    it('holds back LEVEL and LEVEL_2 of the same message (Homematic IP, PROCESS)', () => {
        const t = setup();
        t.event('LEVEL', 0.2);
        t.event('LEVEL_2', 0.4);
        t.event('PROCESS', 1);
        t.advance(1000);
        t.event('LEVEL', 0.8);
        t.event('LEVEL_2', 0.5);
        t.event('PROCESS', 0);
        expect(t.written.filter(([id]) => !id.endsWith('PROCESS'))).to.deep.equal([
            ['MEQ0632459.1.LEVEL', 0.8],
            ['MEQ0632459.1.LEVEL_2', 0.5],
        ]);
    });

    it('does not touch channels without a flag', () => {
        const t = setup(false);
        t.event('LEVEL', 0.3);
        expect(t.written).to.deep.equal([['MEQ0632459.1.LEVEL', 0.3]]);
    });

    it('clears its timers', () => {
        const t = setup();
        t.event('LEVEL', 10);
        t.filter.clear();
        t.advance(1000);
        expect(t.written).to.deep.equal([]);
    });
});
