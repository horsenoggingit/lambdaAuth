"use strict";

console.log("Loading function");

const fs = require("fs");
/*ignore jslint start*/
const AWSConstants = JSON.parse(fs.readFileSync("./AWSConstants.json", "utf8"));
/*ignore jslint end*/
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const PH = require("./PasswordHash");
const UserIdentity = require("./UserIdentity");
const APIParamVerify = require("./APIParamVerify");
const Devices = require("./Devices");

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

    console.log(event);
    // make sure we have needed params
    var verifyResult = APIParamVerify.verify("/login", "post", event);
    if (verifyResult) {
        verifyResult.requestId = context.awsRequestId;
        console.log(verifyResult);
        callback(JSON.stringify(verifyResult));
        return;
    }

    var getIdentityIDAndToken = function (identityId, id, event, awsRequestId, callback) {
        UserIdentity.getOpenIDToken(AWSConstants.COGNITO.IDENTITY_POOL.identityPoolId, identityId, AWSConstants.COGNITO.IDENTITY_POOL.authProviders.custom.developerProvider, id, function (err, OpenIDToken) {
            if (err) {
                console.log(err);
                console.log("Could not get user identity from cognito for request: " + context.awsRequestId);
                callback(JSON.stringify({
                    requestId: awsRequestId,
                    errorType: "InternalServerError",
                    httpStatus: 500,
                    message: "Could not get user identity."
                }));
                return;
            }
            // now lookup in the user table
            var params = {
                TableName: AWSConstants.DYNAMO_DB.USERS.name,
                Key: {}
            };
            params.Key[AWSConstants.DYNAMO_DB.USERS.ID] = OpenIDToken.IdentityId;

            docClient.get(params, function (err, userData) {
                if (err) {
                    console.log(err);
                    console.log("Could not get user info from db for request: " + context.awsRequestId);
                    callback(JSON.stringify({
                        requestId: awsRequestId,
                        errorType: "InternalServerError",
                        httpStatus: 500,
                        message: "Could not get user info."
                    }));
                    return;
                }
                if (typeof userData.Item.password === 'string') {
                    if (PH.passwordHash(event.password) === userData.Item.password) {
                        // add the device to the device table
                        Devices.addUserId(event.device_id, OpenIDToken.IdentityId, function (err) {
                            if (err) {
                                console.log("Error storing device token.");
                                console.log(err);
                                callback(JSON.stringify({
                                    requestId: awsRequestId,
                                    errorType: "InternalServerError",
                                    httpStatus: 500,
                                    message: "Could not store user device."
                                }));
                                return;
                            }
                            callback(null, OpenIDToken);
                        });
                    } else {
                        console.log("Password missmatch for request: " + context.awsRequestId);
                        callback(JSON.stringify({
                            requestId: awsRequestId,
                            errorType: "Unauthorized",
                            httpStatus: 401,
                            message: "No matching login informaiton."
                        }));
                        return;
                    }
                } else {
                    console.log("user does not have a valid password data for request: " + context.awsRequestId);
                    callback(JSON.stringify({
                        requestId: awsRequestId,
                        errorType: "InternalServerError",
                        httpStatus: 500,
                        message: "Could not get user info."
                    }));
                    return;
                }
            });
        });
    };

    // check if the email exists
    var params = {
        TableName: AWSConstants.DYNAMO_DB.EMAILS.name,
        Key: {}
    };

    params.Key[AWSConstants.DYNAMO_DB.EMAILS.EMAIL] = event.email;

    docClient.get(params, function (err, data) {
        if (err) {
            console.log(err);
            console.log("Could not get user identity from email db for request: " + context.awsRequestId);
            callback(JSON.stringify({
                requestId: context.awsRequestId,
                errorType: "Unauthorized",
                httpStatus: 401,
                message: "No matching login information."
            }));
            return;
        }
        // it we get some objects back from the email table then the users has already signed up
        if (typeof data.Item === "object") {
            UserIdentity.lookupIdentity(AWSConstants.COGNITO.IDENTITY_POOL.identityPoolId, data.Item.id, function (err, identityID) {
                if (err) {
                    callback(JSON.stringify({
                        requestId: context.awsRequestId,
                        errorType: "Unauthorized",
                        httpStatus: 401,
                        message: "No matching identity."
                    }));
                    return;
               }

               console.log("start get Identity");
               getIdentityIDAndToken(identityID, data.Item.id, event, context.awsRequestId, function (err, OpenIDToken) {
                   console.log("end get Identity");
                   if (err || !OpenIDToken || !OpenIDToken.IdentityId || !OpenIDToken.Token) {
                       console.log("Could not get user identity from cognito for request: " + context.awsRequestId);
                       callback(JSON.stringify({
                           requestId: context.awsRequestId,
                           errorType: "Unauthorized",
                           httpStatus: 401,
                           message: "No matching login information."
                       }));
                       return;
                   }
                   // have Tokens
                   // update login timestamp
                   var paramsUser = {
                       TableName: AWSConstants.DYNAMO_DB.USERS.name,
                       Key: {},
                       UpdateExpression: "set " + AWSConstants.DYNAMO_DB.USERS.LAST_LOGIN_TIMESTAMP + " = :t",
                       ExpressionAttributeValues: {
                           ":t": Date.now()
                       }
                   };
                   paramsUser.Key[AWSConstants.DYNAMO_DB.USERS.ID] = OpenIDToken.IdentityId;
                   docClient.update(paramsUser, function (err) {
                       if (err) {
                           console.log("unable to update login timestamp for request: " + context.awsRequestId);
                           callback(JSON.stringify({
                               requestId: context.awsRequestId,
                               errorType: "InternalServerError",
                               httpStatus: 500,
                               message: "Could not set user info."
                           }));
                           return;
                       }
                       callback(null, OpenIDToken);
                   });
               });

            });
        } else {
            console.log("Could not get user info from db for request: " + context.awsRequestId);
            callback(JSON.stringify({
                requestId: context.awsRequestId,
                errorType: "Unauthorized",
                httpStatus: 401,
                message: "No matching login informaiton."
            }));
        }
    });
}

exports.handler = handler;
