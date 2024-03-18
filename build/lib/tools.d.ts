import { FixParamsetParams, FixEventParams } from './_types';
export declare const FORBIDDEN_CHARS: RegExp;
/**
 * replaces special chars by DIN_66003
 *
 * @param text
 */
export declare function replaceSpecialChars(text: string): string;
export declare function number2hex(num: number | string): string;
interface Line {
    line: string | number;
    icon: string | number;
}
/**
 * Creates an combined EPAPER command which can be sent to the CCU
 *
 * @param lines
 * @param signal 0xF0 AUS; 0xF1 Rotes Blitzen ;0xF2 Grünes Blitzen; 0xF3 Orangenes Blitzen
 * @param ton
 * @param repeats
 * @param offset
 */
export declare function combineEPaperCommand(lines: Line[], signal: string | number, ton: any, repeats: any, offset: any): string;
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
export declare function fixEvent(params: FixEventParams): any;
export {};
