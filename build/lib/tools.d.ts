import type { FixParamsetParams, FixEventParams } from './_types';
export declare const FORBIDDEN_CHARS: RegExp;
/**
 * replaces special chars by DIN_66003
 */
export declare function replaceSpecialChars(text: string): string;
export declare function number2hex(num: number | string): string;
export interface Line {
    line: string | number;
    icon: string | number;
}
/**
 * Creates a combined EPAPER command which can be sent to the CCU
 *
 * @param lines array of lines to be displayed on the EPAPER display
 * @param signal 0xF0 AUS; 0xF1 Rotes Blitzen ;0xF2 Grünes Blitzen; 0xF3 Orangenes Blitzen
 * @param ton 0xC0 AUS; 0xC1 LANG LANG; 0xC2 LANG KURZ; 0xC3 LANG KURZ KURZ; 0xC4 KURZ; 0xC5 KURZ KURZ; 0xC6 LANG
 * @param repeats 0xD0 - 0xDE: 1 - 15 repetitions, 0xDF: unlimited (repeats 0 or not set)
 * @param offset 0xE0 - 0xEF: interval of 10 - 160 seconds. Without a valid offset (e.g. only the lines were written) use 10 seconds, otherwise an invalid "0xE-1" is sent and the CCU rejects the whole command (#1450, #1454, #1461)
 * @returns the combined EPAPER command as string
 */
export declare function combineEPaperCommand(lines: Line[], signal: string | number, ton: number | string, repeats: number | undefined, offset: number | undefined): string;
/**
 * Returns the role for a read-only datapoint. level.* and switch.* are writable by definition,
 * so other adapters (e.g. matter) try to control them (#1343, #1344, #1354)
 *
 * @param role role of the datapoint
 * @returns the role to use, if the datapoint is not writable
 */
export declare function readOnlyRole(role: string): string;
/**
 * Fix different bugs in the CCU metadata
 *
 * @param params relevant parameters
 */
export declare function fixParamset(params: FixParamsetParams): void;
/**
 * Fix different bugs in CCU which needs to be fixed on event level
 *
 * @param params relevant parameters
 */
export declare function fixEvent(params: FixEventParams): null | string | number;
