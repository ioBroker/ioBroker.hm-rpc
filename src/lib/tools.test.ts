import { expect } from 'chai';
import { describe, it } from 'mocha';
import { combineEPaperCommand } from './tools';

/** returns the repetition and interval codes of an EPAPER command */
function timing(command: string): { repeats: string; interval: string } {
    const parts = command.split(',');
    return {
        repeats: parts[parts.indexOf('0x1C') + 1],
        interval: parts[parts.indexOf('0x1D') + 1],
    };
}

describe('combineEPaperCommand', () => {
    const lines = [
        { line: 'AB', icon: '0x80' },
        { line: '', icon: '' },
        { line: '', icon: '' },
    ];

    it('builds a complete command', () => {
        expect(combineEPaperCommand(lines, '0xF1', '0xC4', 2, 20)).to.equal(
            '0x02,0x0A,0x12,0x41,0x42,0x13,0x80,0x0A,0x0A,0x0A,0x14,0xC4,0x1C,0xD1,0x1D,0xE1,0x16,0xF1,0x03',
        );
    });

    it('uses a valid interval if no offset is given (only lines written)', () => {
        const command = combineEPaperCommand(lines, '0xF0', '0xC0', undefined, undefined);
        expect(command).not.to.contain('0xE-');
        expect(timing(command)).to.deep.equal({ repeats: '0xDF', interval: '0xE0' });
    });

    it('uses a valid interval for invalid offsets', () => {
        for (const offset of [0, NaN, -30, 5]) {
            expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 1, offset)).interval).to.equal('0xE0');
        }
    });

    it('maps the interval of 10 - 160 seconds to 0xE0 - 0xEF', () => {
        expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 1, 10)).interval).to.equal('0xE0');
        expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 1, 100)).interval).to.equal('0xE9');
        expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 1, 105)).interval).to.equal('0xEA');
        expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 1, 160)).interval).to.equal('0xEF');
        expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 1, 500)).interval).to.equal('0xEF');
    });

    it('maps the repetitions of 1 - 15 to 0xD0 - 0xDE and 0 to unlimited', () => {
        expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 0, 10)).repeats).to.equal('0xDF');
        expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 1, 10)).repeats).to.equal('0xD0');
        expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 10, 10)).repeats).to.equal('0xD9');
        expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 11, 10)).repeats).to.equal('0xDA');
        expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 15, 10)).repeats).to.equal('0xDE');
        expect(timing(combineEPaperCommand(lines, '0xF0', '0xC0', 20, 10)).repeats).to.equal('0xDE');
    });
});
