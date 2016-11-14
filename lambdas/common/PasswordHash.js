"use strict";
const crypto = require('crypto');

/**
 * passwordHash hash a password
 * @param  {string} data passoword to hash
 * @return {string}      hashed password
 */
exports.passwordHash = function passwordHash(data) {
  for (var index = 0; index < 10; index ++) {
    var hmac = crypto.createHmac('sha256', 'a secret ' + (index * 20));

    hmac.update(data);
    data = hmac.digest('hex')
  }
  return data;
}
