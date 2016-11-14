"use strict";

const USE_UUID_AS_USERID = true;

const UUID = require('node-uuid');

/**
* getAutoIncId auto increment the table id to generate a new unique user id
* @param {string} tableName
* @param {DocumentClient} docClient
* @param {function (err: Error, newID: string)} callback a new string id
*/
function getUniqueId(tableName, docClient, callback) {
  if (USE_UUID_AS_USERID) {
    process.nextTick(function () {
        callback(null,UUID.v4());
    });
    return;
  }
  var params = {
    TableName: tableName,
    Key: {
      "id" : "0"
    },
    UpdateExpression: "SET autoIncId = autoIncId + :incr",
    ExpressionAttributeValues: {
      ":incr": 1
    },
    ReturnValues: "ALL_NEW"
  };
  docClient.update(params, function (err, data) {
    if (err) {
      callback(err)
    } else {
      callback(null, data.Attributes.autoIncId.toString())
    }
  });
}

exports.getUniqueId = getUniqueId;
