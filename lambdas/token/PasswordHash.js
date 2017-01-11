"use strict";
const crypto = require("crypto");

/**
* passwordHash hash a password
* @param  {string} data password to hash
* @return {string}      hashed password
**/

function passwordHash(data) {
    var index;
    var hmac;
    for (index = 0; index < 10; index += 1) {
        hmac = crypto.createHmac('sha256', 'a secret ' + (index * 20));
        hmac.update(data);
        data = hmac.digest('hex');
    }
    return data;
}

exports.passwordHash = passwordHash;
