"use strict";

const fs = require("fs");
const AWS = require("aws-sdk");
/*ignore jslint start*/
const AWSConstants = JSON.parse(fs.readFileSync("./AWSConstants.json", "utf8"));
/*ignore jslint end*/
const docClient = new AWS.DynamoDB.DocumentClient();

function getDeviceItem(deviceId, callback) {
    var params = {
        TableName: AWSConstants.DYNAMO_DB.DEVICES.name,
        Key: {}
    };

    params.Key[AWSConstants.DYNAMO_DB.DEVICES.DEVICE_ID] = deviceId;

    docClient.get(params, function (err, data) {
        if (err) {
            callback(err);
            return;
        }
        if (typeof data.Item === "object") {
            callback(null, data.Item);
        } else {
            callback(new Error("No Item field for device: " + deviceId));
        }
    });
}

function updateUserIds(deviceId, userIds, callback) {
    var paramsDevice = {
        TableName: AWSConstants.DYNAMO_DB.DEVICES.name,
        Key: {},
        UpdateExpression: "set " + AWSConstants.DYNAMO_DB.DEVICES.IDS + " = :t",
        ExpressionAttributeValues: {
            ":t": userIds
        }
    };
    paramsDevice.Key[AWSConstants.DYNAMO_DB.DEVICES.DEVICE_ID] = deviceId;
    docClient.update(paramsDevice, callback);
}

function createDeviceItem(deviceId, userId, callback) {
    // Add the email to the email table with provider token
    // login will use this to lookup the identity
    var paramsDevice = {
        TableName: AWSConstants.DYNAMO_DB.DEVICES.name,
        Item: {}
    };
    console.log("device Id: " + deviceId);
    console.log("user Id: " + userId);
    paramsDevice.Item[AWSConstants.DYNAMO_DB.DEVICES.DEVICE_ID] = deviceId;
    paramsDevice.Item[AWSConstants.DYNAMO_DB.DEVICES.IDS] = [userId];

    docClient.put(paramsDevice, function (err, deviceData) {
        callback(err, deviceData);
    });
}

function verifyItemUser(Item, userID) {
    return (Item[AWSConstants.DYNAMO_DB.DEVICES.IDS].indexOf(userID) >= 0);
}

function addItemUser(Item, userID) {
    if (Array.isArray(Item[AWSConstants.DYNAMO_DB.DEVICES.IDS])) {
        Item[AWSConstants.DYNAMO_DB.DEVICES.IDS] = [userID].concat(Item[AWSConstants.DYNAMO_DB.DEVICES.IDS]);
    } else {
        Item[AWSConstants.DYNAMO_DB.DEVICES.IDS] = [userID];
    }
}

function addUserId(deviceId, userId, callback) {
    getDeviceItem(deviceId, function (ignore, Item) {
        if (Item && Item[AWSConstants.DYNAMO_DB.DEVICES.IDS]) {
            if (verifyItemUser(Item, userId)) {
                callback(null);
            } else {
                addItemUser(Item, userId);
                updateUserIds(deviceId, Item[AWSConstants.DYNAMO_DB.DEVICES.IDS], callback);
            }
        } else {
            createDeviceItem(deviceId, userId, callback);
        }
    });
}


function verifyUser(deviceID, userID, callback) {
    getDeviceItem(deviceID, function (ignore, Item) {
        if (Item && Item[AWSConstants.DYNAMO_DB.DEVICES.IDS]) {
            callback(null, verifyItemUser(Item, userID));
        } else {
            callback(null, false);
        }
    });
}

exports.verifyUser = verifyUser;
exports.addUserId = addUserId;
