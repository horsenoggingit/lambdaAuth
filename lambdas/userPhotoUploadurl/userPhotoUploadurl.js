'use strict';

console.log('Loading function');

const fs = require('fs');
const AWSConstants = JSON.parse(fs.readFileSync('./AWSConstants.json', 'utf8'));
const APIParamVerify = require('./APIParamVerify');
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const UUID = require('node-uuid');
const s3 = new AWS.S3();

/**
* handler signup
* @param  {[type]}   event    [description]
* @param  {[type]}   context  [description]
* @param  {Function} callback [description]
*/
function handler(event, context, callback) {

    // make sure we have needed params
    var verifyResult = APIParamVerify.verify("/user/photo/uploadurl", "get", event);
    if (verifyResult) {
        verifyResult.requestId = context.awsRequestId;
        console.log(verifyResult);
        callback(JSON.stringify(verifyResult));
        return;
    }

    checkForPhotoBaseID(event.awsParams.identity_id, context.awsRequestId, function (err, userData) {
        if (err) {
            callback(JSON.stringify(err));
            return;
        }

        var key = userData.Item[AWSConstants.DYNAMO_DB.USERS.PHOTO_BASE_ID] + "/" + UUID.v4();

        const params = {
            Bucket: AWSConstants.S3.PHOTOBUCKET.name,
            Key: key,
            Expires: 900,
            ContentType: "image/jpeg",
            ACL: 'public-read'
        };

        s3.getSignedUrl('putObject', params, function (err, data) {
            if (err) {
                console.log(err);
                var errorObject = {
                    requestId: context.awsRequestId,
                    errorType: "InternalServerError",
                    httpStatus: 500,
                    message: "Get signed url falied."
                };
                callback(JSON.stringify(errorObject));
                return;
            }
            // successful result should terminate with callback(null, [resopnseObject]);
            callback(null, {upload_url: data, photo_id: key});
            return;
        });
    });
}

exports.handler = handler;

function checkForPhotoBaseID(userID, awsRequestId, callback) {
    var userGetParams = {
        TableName: AWSConstants.DYNAMO_DB.USERS.name,
        Key: {}
    };
    userGetParams.Key[AWSConstants.DYNAMO_DB.USERS.ID] = userID;
    // get the user
    docClient.get(userGetParams, function (err, userData) {
        if (err) {
            console.log(err);
            console.log("Could not get user info from db for request: " + awsRequestId);
            var errorObject = {
                requestId: awsRequestId,
                errorType: "InternalServerError",
                httpStatus: 500,
                message: "Could not get user info."
            };
            callback(errorObject);
        } else {
            // if the user doesn't have a photo_id base then assign one and save the user object
            if (!userData.Item[AWSConstants.DYNAMO_DB.USERS.PHOTO_BASE_ID]) {
                var photoBaseId = UUID.v4();
                var paramsUser = {
                    TableName: AWSConstants.DYNAMO_DB.USERS.name,
                    Key: {},
                    UpdateExpression: "set " + AWSConstants.DYNAMO_DB.USERS.PHOTO_BASE_ID + " = :t",
                    ExpressionAttributeValues: {
                        ":t": photoBaseId
                    }
                };
                paramsUser.Key[AWSConstants.DYNAMO_DB.USERS.ID] = userID;
                docClient.update(paramsUser, function (err) {
                    if (err) {
                        console.log("unable to update photo id base for request: " + awsRequestId);
                        var errorObject = {
                             requestId: awsRequestId,
                             errorType: "InternalServerError",
                             httpStatus: 500,
                             message: "Could not set user info."
                         };
                         callback(errorObject);
                         return;
                    }
                    userData.Item[AWSConstants.DYNAMO_DB.USERS.PHOTO_BASE_ID] = photoBaseId;
                    callback(null, userData);
                });
            } else {
                callback(null, userData);
                return;
            }
        }
    });
}
