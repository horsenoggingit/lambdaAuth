'use strict';

const fs = require('fs');
const AWSConstants = JSON.parse(fs.readFileSync('./AWSConstants.json', 'utf8'));
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const UUID = require('node-uuid');

function getItemForPhotoBaseId(photoBaseId, callback) {
    var photoBaseGetParams = {
        TableName: AWSConstants.DYNAMO_DB.PHOTOS.name,
        Key: {}
    };
    photoBaseGetParams.Key[AWSConstants.DYNAMO_DB.PHOTOS.PHOTO_BASE_ID] = photoBaseId;
    docClient.get(photoBaseGetParams, function (err, photoData) {
        if (err) {
            callback(err);
            return;
        }
        callback(null, photoData.Item);
    });
}

exports.getItemForPhotoBaseId = getItemForPhotoBaseId;

function appendPhotoId(photoBaseId, photoId, callback) {
    var paramsDevice = {
        TableName: AWSConstants.DYNAMO_DB.PHOTOS.name,
        Key: {},
        UpdateExpression: "set " + AWSConstants.DYNAMO_DB.PHOTOS.PHOTO_IDS + " = list_append( " + AWSConstants.DYNAMO_DB.PHOTOS.PHOTO_IDS + ", :t)",
        ExpressionAttributeValues: {
            ":t": [photoId]
        }
    };
    paramsDevice.Key[AWSConstants.DYNAMO_DB.PHOTOS.PHOTO_BASE_ID] = photoBaseId;
    docClient.update(paramsDevice, callback);
}

exports.appendPhotoId = appendPhotoId;

function setPhotoIds(photoBaseId, photoIds, callback) {
    var paramsDevice = {
        TableName: AWSConstants.DYNAMO_DB.PHOTOS.name,
        Key: {},
        UpdateExpression: "set " + AWSConstants.DYNAMO_DB.PHOTOS.PHOTO_IDS + " = :t",
        ExpressionAttributeValues: {
            ":t": photoIds
        }
    };
    paramsDevice.Key[AWSConstants.DYNAMO_DB.PHOTOS.PHOTO_BASE_ID] = photoBaseId;
    docClient.update(paramsDevice, callback);
}

exports.setPhotoIds = setPhotoIds;

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

                // Add the email to the email table with provider token
                // login will use this to lookup the identity
                var paramsPhoto = {
                    TableName: AWSConstants.DYNAMO_DB.PHOTOS.name,
                    Item: {}
                };

                paramsPhoto.Item[AWSConstants.DYNAMO_DB.PHOTOS.PHOTO_BASE_ID] = photoBaseId;
                paramsPhoto.Item[AWSConstants.DYNAMO_DB.PHOTOS.ID] = userID;

                docClient.put(paramsPhoto, function (err) {

                    if (err) {
                        console.log("unable to update photo id base for request: " + awsRequestId);
                        var errorObject = {
                             requestId: awsRequestId,
                             errorType: "InternalServerError",
                             httpStatus: 500,
                             message: "Could not set photo info."
                         };
                         callback(errorObject);
                         return;
                    }

                    var paramsUser = {
                        TableName: AWSConstants.DYNAMO_DB.USERS.name,
                        Key: {},
                        UpdateExpression: "set " + AWSConstants.DYNAMO_DB.USERS.PHOTO_BASE_ID + " = :t, " + AWSConstants.DYNAMO_DB.USERS.PHOTO_COUNT + " = :q",
                        ExpressionAttributeValues: {
                            ":t": photoBaseId,
                            ":q": 0
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
                        setPhotoIds(photoBaseId, [], function (err) {
                            if (err) {
                                var errorObject = {
                                     requestId: awsRequestId,
                                     errorType: "InternalServerError",
                                     httpStatus: 500,
                                     message: "Could not set photo info."
                                 };
                                 callback(errorObject);
                                 return;
                            }
                            callback(null, userData);
                        });
                    });
               });
            } else {
                callback(null, userData);
                return;
            }
        }
    });
}

exports.checkForPhotoBaseID = checkForPhotoBaseID;
