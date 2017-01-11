"use strict";

console.log("Loading function");

const fs = require("fs");

const AWSConstants = JSON.parse(fs.readFileSync("./AWSConstants.json", "utf8"));
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const PH = require("./PasswordHash");
const UniqueID = require("./UniqueID");
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
    console.log(event);

    // make sure we have needed params
    var verifyResult = APIParamVerify.verify("/signup", "post", event);
    if (verifyResult) {
        verifyResult.requestId = context.awsRequestId;
        console.log(verifyResult);
        callback(JSON.stringify(verifyResult));
        return;
    }

    // check if the email has already been used
    var params = {
        TableName: AWSConstants.DYNAMO_DB.EMAILS.name,
        Key: {}
    };
    params.Key[AWSConstants.DYNAMO_DB.EMAILS.EMAIL] = event.email;
    docClient.get(params, function (err, data) {
        if (err) {
            console.log(err);
            console.log("Could not validate for email for request: " + context.awsRequestId);
            callback(JSON.stringify({
                requestId: context.awsRequestId,
                errorType: "InternalServerError",
                httpStatus: 500,
                message: "Could not validate email."
            }));
        } else {
            // it we get some objects back from the email table then the users has already signed up
            if (typeof data.Item === "object") {
                console.log(data);
                var errorObject = {
                    requestId: context.awsRequestId,
                    errorType: "Conflict",
                    httpStatus: 409,
                    message: "Item exists"
                };
                console.log(errorObject);
                callback(JSON.stringify(errorObject));
            } else {
                // generate a unique id for the user as the developer provier id
                UniqueID.getUniqueId(AWSConstants.DYNAMO_DB.USERS.name, docClient, function (err, newID) {
                    if (err) {
                        console.log(err);
                        console.log("Could not generate new id for request: " + context.awsRequestId);
                        callback(JSON.stringify({
                            requestId: context.awsRequestId,
                            errorType: "InternalServerError",
                            httpStatus: 500,
                            message: "Could not generate new id."
                        }));
                    } else {

                        // now create a cognito identity with ths id and custome provider
                        UserIdentity.getOpenIDToken(AWS, AWSConstants.COGNITO.IDENTITY_POOL.identityPoolId, AWSConstants.COGNITO.IDENTITY_POOL.authProviders.custom.developerProvider, newID, function (err, OpenIDToken) {
                            if (err) {
                                console.log(err);
                                console.log("Could not generate open id token for request: " + context.awsRequestId);
                                callback(JSON.stringify({
                                    requestId: context.awsRequestId,
                                    errorType: "InternalServerError",
                                    httpStatus: 500,
                                    message: "Could not generate open id token."
                                }));
                            } else {

                                // Add the email to the email table with provier token
                                // login will use this to lookup the identity
                                var paramsEmail = {
                                    TableName: AWSConstants.DYNAMO_DB.EMAILS.name,
                                    Item: {}
                                };

                                paramsEmail.Item[AWSConstants.DYNAMO_DB.EMAILS.EMAIL] = event.email;
                                paramsEmail.Item[AWSConstants.DYNAMO_DB.EMAILS.ID] = newID;

                                docClient.put(paramsEmail, function (err) {
                                    if (err) {
                                        console.log(err);
                                        console.log("Could not put email and id to emails db for request: " + context.awsRequestId);
                                        callback(JSON.stringify({
                                            requestId: context.awsRequestId,
                                            errorType: "InternalServerError",
                                            httpStatus: 500,
                                            message: "Could not put email and id."
                                        }));
                                    }
                                });
                                var now = Date.now();
                                // Add the user to the user table
                                var paramsUser = {
                                    TableName: AWSConstants.DYNAMO_DB.USERS.name,
                                    Item: {}
                                };
                                paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.ID] = OpenIDToken.IdentityId;
                                paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.PASSWORD] = PH.passwordHash(event.password);
                                paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.EMAIL] = event.email;
                                paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.SIGNUP_TIMESTAMP] = now;
                                paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.LAST_LOGIN_TIMESTAMP] = -1;
                                if (event.name) {
                                    paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.NAME] = event.name;
                                }
                                if (event.dob) {
                                    paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.DOB] = event.dob;
                                }

                                docClient.put(paramsUser, function (err) {
                                    if (err) {
                                        console.log(err);
                                        console.log("Could not put user info to db for request: " + context.awsRequestId);
                                        callback(JSON.stringify({
                                            requestId: context.awsRequestId,
                                            errorType: "InternalServerError",
                                            httpStatus: 500,
                                            message: "Could not put user info."
                                        }));
                                    } else {
                                        Devices.addUserId(event.device_id, OpenIDToken.IdentityId, function (err) {
                                            if (err) {
                                                console.log("Error creating device token.");
                                                console.log(err);
                                                callback(JSON.stringify({
                                                    requestId: context.awsRequestId,
                                                    errorType: "InternalServerError",
                                                    httpStatus: 500,
                                                    message: "Could not store user device."
                                                }));
                                            } else {
                                                callback(null, OpenIDToken);
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        }
    });
}

exports.handler = handler;
