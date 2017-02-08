'use strict';

console.log('Loading function');
const fs = require('fs');
const AWSConstants = JSON.parse(fs.readFileSync('./AWSConstants.json', 'utf8'));
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const Photos = require('./Photos');

/**
* handler signup
* @param  {[type]}   event    [description]
* @param  {[type]}   context  [description]
* @param  {Function} callback [description]
*/
function handler(event, context, callback) {

    console.log(JSON.stringify(event));

    if (!Array.isArray(event.Records) || (event.Records.length === 0)) {
        console.log("No event records.");
    }
    var eventRecord = event.Records[0];
    if (eventRecord.eventName === 'ObjectCreated:Put') {
        var putObjectKey = eventRecord.s3.object.key;
        var splitKey = putObjectKey.split("/");
        if (splitKey.length !== 2) {
            console.log("Error parsing object key: expected 2 items.");
            callback(new Error("Error parsing object key: expected 2 items."));
            // should probably delete the item
            return;
        }
        var photoBaseId = splitKey[0];
        var photoId = splitKey[1];
        Photos.getItemForPhotoBaseId(photoBaseId, function (err, item) {
            if (err) {
                console.log(err);
                callback(err);
                return;
            }
            if (item[AWSConstants.DYNAMO_DB.PHOTOS.ID]) {
                // add the id
                Photos.appendPhotoId(photoBaseId, photoId, function (err) {
                    if (err) {
                        console.log(err);
                        callback(err);
                        return;
                    }
                });
                // update user photo count and put the new primary photo Id
                var paramsUser = {
                    TableName: AWSConstants.DYNAMO_DB.USERS.name,
                    Key: {},
                    UpdateExpression: "set " + AWSConstants.DYNAMO_DB.USERS.PHOTO_ID + " = :t, " + AWSConstants.DYNAMO_DB.USERS.PHOTO_COUNT + " = " + AWSConstants.DYNAMO_DB.USERS.PHOTO_COUNT + " + :q",
                    ExpressionAttributeValues: {
                        ":t": photoId,
                        ":q": 1                    
                    }
                };
                paramsUser.Key[AWSConstants.DYNAMO_DB.USERS.ID] = item[AWSConstants.DYNAMO_DB.PHOTOS.ID];
                docClient.update(paramsUser, function (err) {
                    if (err) {
                        console.log(err);
                        callback(err);
                    }
                });

            } else {
                var errString = "User not found for photo base id: '" + photoBaseId + "'";
                console.log(errString);
                callback(errString);
                return;
            }

        });

    } else {
        console.log("Unknown eventName '" + eventRecord.eventName + "'");
        callback(new Error ("Unknown eventName '" + eventRecord.eventName + "'."));
        return;
    }
    callback(null);
}

exports.handler = handler;
