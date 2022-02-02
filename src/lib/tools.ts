'use strict';

/**
 * decrypts a key with its related value
 *
 * @param key
 * @param value
 */

export function decrypt(key: string, value: string): string {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

/**
 * replaces special chars by DIN_66003
 *
 * @param text
 */
export function replaceSpecialChars(text: string): string {
    const specialChars: Record<string, string> = {
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
