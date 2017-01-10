"use strict";

console.log("Loading function");

const fs = require("fs");
/*ignore jslint start*/
const AWSConstants = JSON.parse(fs.readFileSync("./AWSConstants.json", "utf8"));
/*ignore jslint end*/
const AWS = require("aws-sdk");
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
    var verifyResult = APIParamVerify.verify("/token", "post", event);
    if (verifyResult) {
        verifyResult.requestId = context.awsRequestId;
        console.log(verifyResult);
        callback(JSON.stringify(verifyResult));
        return;
    }

    var getIdentityIDAndToken = function (id, event, awsRequestId, callback) {
        UserIdentity.getOpenIDToken(AWS, AWSConstants.COGNITO.IDENTITY_POOL.identityPoolId, AWSConstants.COGNITO.IDENTITY_POOL.authProviders.custom.developerProvider, id, function (err, OpenIDToken) {
            if (err) {
                console.log(err);
                console.log("Could not get user identity from cognito for request: " + context.awsRequestId);
                var errorObject = {
                    requestId: awsRequestId,
                    errorType: "InternalServerError",
                    httpStatus: 500,
                    message: "Could not get user identity."
                };
                callback(JSON.stringify(errorObject));
            } else {
                // check to make sure that the device id matches from a login or signup request.
                Devices.verifyUser(event.device_id, OpenIDToken.IdentityId, function (err, verified) {
                    if (err) {
                        console.log("Issue verifying user device.");
                        console.log(err);
                        callback(JSON.stringify({
                            requestId: awsRequestId,
                            errorType: "InternalServerError",
                            httpStatus: 500,
                            message: "Could not get user device."
                        }));
                        return;
                    }
                    if (verified) {
                        callback(null, OpenIDToken);
                    } else {
                        console.log("Device miss-match for request: " + context.awsRequestId);
                        callback(JSON.stringify({
                            requestId: awsRequestId,
                            errorType: "Unauthorized",
                            httpStatus: 401,
                            message: "No matching device information."
                        }));
                    }
                });
            }
        });
    };

    if (event.id && event.provider_name) {
        getIdentityIDAndToken(event.id, event, context.awsRequestId, callback);
        return;
    }
}

exports.handler = handler;
