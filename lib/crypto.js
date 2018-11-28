'use strict';

/**
 * encrypts a key with its related value
 *
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */

function encrypt(key, value) {
    var result = '';
    for (var i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

/**
 * decrypts a key with its related value
 *
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */

function decrypt(key, value) {
    var result = '';
    for (var i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

exports.decrypt = decrypt;
exports.encrypt = encrypt;
