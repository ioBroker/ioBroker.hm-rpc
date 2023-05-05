"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixParamset = exports.combineEPaperCommand = exports.number2hex = exports.replaceSpecialChars = exports.decrypt = exports.FORBIDDEN_CHARS = void 0;
exports.FORBIDDEN_CHARS = /[\][*,;'"`<>\\\s?]/g;
/**
 * decrypts a key with its related value
 *
 * @param key
 * @param value
 */
function decrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}
exports.decrypt = decrypt;
/**
 * replaces special chars by DIN_66003
 *
 * @param text
 */
function replaceSpecialChars(text) {
    const specialChars = {
        ' ': '\x20',
        '!': '\x21',
        '"': '\x22',
        '%': '\x25',
        '&': '\x26',
        '=': '\x27',
        '(': '\x28',
        ')': '\x29',
        '*': '\x2A',
        '+': '\x2B',
        ',': '\x2C',
        '-': '\x2D',
        '.': '\x2E',
        '/': '\x2F',
        Ä: '\x5B',
        Ö: '\x23',
        Ü: '\x24',
        ä: '\x7B',
        ö: '\x7C',
        ü: '\x7D',
        ß: '\x5F',
        ':': '\x3A',
        ';': '\x3B',
        '@': '\x40',
        '>': '\x3E'
    };
    let result = '';
    for (const char of text) {
        result += specialChars[char] || char;
    } // endFor
    return result;
}
exports.replaceSpecialChars = replaceSpecialChars;
// Icons:
//      0x80 AUS
//      0x81 EIN
//      0x82 OFFEN
//      0x83 geschlossen
//      0x84 fehler
//      0x85 alles ok
//      0x86 information
//      0x87 neue nachricht
//      0x88 servicemeldung
// Tonfolgen
//      0xC0 AUS
//      0xC1 LANG LANG
//      0xC2 LANG KURZ
//      0xC3 LANG KURZ KURZ
//      0xC4 KURZ
//      0xC5 KURZ KURZ
//      0xC6 LANG
//      0xC7
//      0xC9
//      0xCA
function number2hex(num) {
    if (typeof num === 'number') {
        num = num.toString(16).toUpperCase();
        if (num.length < 2) {
            num = `0${num}`;
        }
        num = `0x${num}`;
    }
    return num;
}
exports.number2hex = number2hex;
/**
 * Creates an combined EPAPER command which can be sent to the CCU
 *
 * @param lines
 * @param signal 0xF0 AUS; 0xF1 Rotes Blitzen ;0xF2 Grünes Blitzen; 0xF3 Orangenes Blitzen
 * @param ton
 * @param repeats
 * @param offset
 */
function combineEPaperCommand(lines, signal, ton, repeats, offset) {
    signal = number2hex(signal || '0xF0');
    ton = number2hex(ton || '0xC0');
    const substitutions = {
        A: '0x41',
        B: '0x42',
        C: '0x43',
        D: '0x44',
        E: '0x45',
        F: '0x46',
        G: '0x47',
        H: '0x48',
        I: '0x49',
        J: '0x4A',
        K: '0x4B',
        L: '0x4C',
        M: '0x4D',
        N: '0x4E',
        O: '0x4F',
        P: '0x50',
        Q: '0x51',
        R: '0x52',
        S: '0x53',
        T: '0x54',
        U: '0x55',
        V: '0x56',
        W: '0x57',
        X: '0x58',
        Y: '0x59',
        Z: '0x5A',
        a: '0x61',
        b: '0x62',
        c: '0x63',
        d: '0x64',
        e: '0x65',
        f: '0x66',
        g: '0x67',
        h: '0x68',
        i: '0x69',
        j: '0x6A',
        k: '0x6B',
        l: '0x6C',
        m: '0x6D',
        n: '0x6E',
        o: '0x6F',
        p: '0x70',
        q: '0x71',
        r: '0x72',
        s: '0x73',
        t: '0x74',
        u: '0x75',
        v: '0x76',
        w: '0x77',
        x: '0x78',
        y: '0x79',
        z: '0x7A',
        0: '0x30',
        1: '0x31',
        2: '0x32',
        3: '0x33',
        4: '0x34',
        5: '0x35',
        6: '0x36',
        7: '0x37',
        8: '0x38',
        9: '0x39',
        ' ': '0x20',
        '!': '0x21',
        '"': '0x22',
        '%': '0x25',
        '&': '0x26',
        '=': '0x27',
        '(': '0x28',
        ')': '0x29',
        '*': '0x2A',
        '+': '0x2B',
        ',': '0x2C',
        '-': '0x2D',
        '.': '0x2E',
        '/': '0x2F',
        Ä: '0x5B',
        Ö: '0x23',
        Ü: '0x24',
        ä: '0x7B',
        ö: '0x7C',
        ü: '0x7D',
        ß: '0x5F',
        ':': '0x3A',
        ';': '0x3B',
        '@': '0x40',
        '>': '0x3E'
    };
    let command = '0x02,0x0A';
    for (const li of lines) {
        if (li.line) {
            const line = li.line.toString();
            command = `${command},0x12`;
            let i;
            if (line.substring(0, 2) === '0x' && line.length === 4) {
                command = `${command},${line}`;
                i = 12;
            }
            else {
                i = 0;
            }
            while (i < line.length && i < 12) {
                command += `,${substitutions[line[i]]}` || '0x2A';
                i++;
            }
        }
        if (li.icon) {
            command += `,0x13,${number2hex(li.icon)}`;
        }
        command = `${command},0x0A`;
    }
    command = `${command},0x14,${ton},0x1C,`;
    if (repeats < 1) {
        command = `${command}0xDF,0x1D,`;
    }
    else if (repeats < 11) {
        command = `${command}0xD${repeats - 1},0x1D,`;
    }
    else if (repeats === 11) {
        command = `${command}0xDA,0x1D,`;
    }
    else if (repeats === 12) {
        command = `${command}0xDB,0x1D,`;
    }
    else if (repeats === 13) {
        command = `${command}0xDC,0x1D,`;
    }
    else if (repeats === 14) {
        command = `${command}0xDD,0x1D,`;
    }
    else {
        command = `${command}0xDE,0x1D,`;
    }
    if (offset <= 100) {
        command = `${command}0xE${offset / 10 - 1},0x16,`;
    }
    else if (offset <= 110) {
        command = `${command}0xEA,0x16,`;
    }
    else if (offset <= 120) {
        command = `${command}0xEB,0x16,`;
    }
    else if (offset <= 130) {
        command = `${command}0xEC,0x16,`;
    }
    else if (offset <= 140) {
        command = `${command}0xED,0x16,`;
    }
    else if (offset <= 150) {
        command = `${command}0xEE,0x16,`;
    }
    else {
        command = `${command}0xEF,0x16,`;
    }
    command = `${command + signal},0x03`;
    return command;
}
exports.combineEPaperCommand = combineEPaperCommand;
/**
 * Fix different bugs in the CCU metadata
 *
 * @param params relevant parameters
 */
function fixParamset(params) {
    const { key, obj, paramObj } = params;
    // #346: it seems like if devices connect to a HMIP-HAP, RSSI_DEVICE shows 128, eq3 should fix this, but lets workaround
    if (key === 'RSSI_DEVICE') {
        obj.common.max = 128;
    }
    // #617, #584: for the codes there is often a value greater than max set, so we remove the max for now
    if (paramObj.CONTROL === 'MAINTENANCE.CODE_ID') {
        delete obj.common.max;
    }
}
exports.fixParamset = fixParamset;
//# sourceMappingURL=tools.js.map