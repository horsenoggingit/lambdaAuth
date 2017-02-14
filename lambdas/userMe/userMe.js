'use strict';

console.log('Loading function');

const fs = require('fs');
/*ignore jslint start*/
const AWSConstants = JSON.parse(fs.readFileSync('./AWSConstants.json', 'utf8'));
/*ignore jslint end*/
const APIParamVerify = require('./APIParamVerify');
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

/**
* handler signup
* @param  {[type]}   event    [description]
* @param  {[type]}   context  [description]
* @param  {Function} callback [description]
* @return {[type]}            [description]
*
*/
function handler(event, context, callback) {
    process.on("uncaughtException", ( err ) => {
        console.log(err);
        callback(JSON.stringify({
            requestId: context.awsRequestId,
            errorType: "InternalServerError",
            httpStatus: 500,
            message: "Internal Error."
        }));
    });
    // make sure we have needed params
    var verifyResult = APIParamVerify.verify("/user/me", "get", event);
    if (verifyResult) {
        verifyResult.requestId = context.awsRequestId;
        console.log(verifyResult);
        callback(JSON.stringify(verifyResult));
        return;
    }
    console.log(event);
    // event contains the identity_id that is filled in by API GATEWAY by payload mapping to this lambda
    // lookup in the user table
    var params = {
        TableName: AWSConstants.DYNAMO_DB.USERS.name,
        Key: {}
    };
    params.Key[AWSConstants.DYNAMO_DB.USERS.ID] = event.identity_id;

    docClient.get(params, function (err, userData) {
        if (err) {
            console.log(err);
            console.log("Could not get user info from db for request: " + context.awsRequestId);
            var errorObject = {
                requestId: context.awsRequestId,
                errorType: "InternalServerError",
                httpStatus: 500,
                message: "Could not get user info."
            };
            callback(JSON.stringify(errorObject));
        } else {
            var userParams = {email: userData.Item[AWSConstants.DYNAMO_DB.USERS.EMAIL]};
            if (userData.Item[AWSConstants.DYNAMO_DB.USERS.NAME]) {
                userParams.name = userData.Item[AWSConstants.DYNAMO_DB.USERS.NAME];
            }
            if (userData.Item[AWSConstants.DYNAMO_DB.USERS.DOB]) {
                userParams.dob = userData.Item[AWSConstants.DYNAMO_DB.USERS.DOB];
            }
            if (userData.Item[AWSConstants.DYNAMO_DB.USERS.LAST_LOGIN_TIMESTAMP] && userData.Item[AWSConstants.DYNAMO_DB.USERS.LAST_LOGIN_TIMESTAMP] > 0) {
                userParams.last_login_timestamp = userData.Item[AWSConstants.DYNAMO_DB.USERS.LAST_LOGIN_TIMESTAMP];
            }
            if (userData.Item[AWSConstants.DYNAMO_DB.USERS.SIGNUP_TIMESTAMP]) {
                userParams.signup_timestamp = userData.Item[AWSConstants.DYNAMO_DB.USERS.SIGNUP_TIMESTAMP];
            }
            if (typeof userData.Item[AWSConstants.DYNAMO_DB.USERS.PHOTO_COUNT] === 'number') {
                userParams.photo_count = userData.Item[AWSConstants.DYNAMO_DB.USERS.PHOTO_COUNT];
            }
            if (userData.Item[AWSConstants.DYNAMO_DB.USERS.PHOTO_ID]) {
                userParams.photo_id = userData.Item[AWSConstants.DYNAMO_DB.USERS.PHOTO_ID];
            }
            if (userData.Item[AWSConstants.DYNAMO_DB.USERS.PHOTO_BASE_ID]) {
                userParams.photo_base_id = userData.Item[AWSConstants.DYNAMO_DB.USERS.PHOTO_BASE_ID];
            }
            if (AWSConstants.S3.PHOTOBUCKET.pathUrl) {
                userParams.photo_path_url = AWSConstants.S3.PHOTOBUCKET.pathUrl;
            }

            userParams.logins = {};
            var providerSplit = event.auth_provider.split(',');
            if (providerSplit.length > 1) {
                var providerName = providerSplit[0];
                userParams.provider_name = providerName;
                var providerIDSplit = providerSplit[1].split(':');

                if (providerIDSplit.length >= 4) {
                    var providerID = providerIDSplit[3];
                    userParams.logins[providerName] = providerID;
                    callback(null, userParams);
                    return;
                }
            }
            callback(JSON.stringify({
                requestId: context.awsRequestId,
                errorType: "InternalServerError",
                httpStatus: 500,
                message: "Could not get provider info."
            }));
        }
    });
}

exports.handler = handler;
