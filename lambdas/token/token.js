"use strict";

console.log("Loading function");

const fs = require("fs");
/*ignore jslint start*/
const AWSConstants = JSON.parse(fs.readFileSync("./AWSConstants.json", "utf8"));
/*ignore jslint end*/
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
    var verifyResult = APIParamVerify.verify("/token", "post", event);
    if (verifyResult) {
        verifyResult.requestId = context.awsRequestId;
        console.log(verifyResult);
        callback(JSON.stringify(verifyResult));
        return;
    }

    var getIdentityIDAndToken = function (identityID, id, event, awsRequestId, callback) {
        UserIdentity.getOpenIDToken(AWSConstants.COGNITO.IDENTITY_POOL.identityPoolId, identityID, AWSConstants.COGNITO.IDENTITY_POOL.authProviders.custom.developerProvider, id, function (err, OpenIDToken) {
            if (err) {
                // likely this is the case, there are other error reasons and it may be worth while
                // checking and perhaps returning a 500 error.
                console.log("Could not get user identity from cognito for request: " + context.awsRequestId);
                console.log(err);
                var errorObject = {
                    requestId: awsRequestId,
                    errorType: "Unauthorized",
                    httpStatus: 401,
                    message: "Could not get user identity."
                };
                callback(JSON.stringify(errorObject));
                return;
            }

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
        });
    };

    if (event.provider_name === AWSConstants.COGNITO.IDENTITY_POOL.authProviders.custom.developerProvider) {

        UserIdentity.lookupIdentity(AWSConstants.COGNITO.IDENTITY_POOL.identityPoolId, event.id, function (err, identityID) {
            if (err) {
                callback(JSON.stringify({
                    requestId: context.awsRequestId,
                    errorType: "Unauthorized",
                    httpStatus: 401,
                    message: "No matching identity."
                }));
                return;
           }

           getIdentityIDAndToken(identityID, event.id, event, context.awsRequestId, callback);

        });

    } else {
        console.log("Provider name miss-match for request: " + context.awsRequestId);
        callback(JSON.stringify({
            requestId: context.awsRequestId,
            errorType: "Unauthorized",
            httpStatus: 401,
            message: "No matching provider."
        }));
    }
}

exports.handler = handler;
