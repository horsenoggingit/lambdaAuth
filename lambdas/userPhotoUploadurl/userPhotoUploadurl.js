'use strict';

console.log('Loading function');

const fs = require('fs');
const AWSConstants = JSON.parse(fs.readFileSync('./AWSConstants.json', 'utf8'));
const APIParamVerify = require('./APIParamVerify');
const AWS = require("aws-sdk");
const Photos = require('./Photos');
const UUID = require('node-uuid');
const s3 = new AWS.S3();

/**
* handler signup
* @param  {[type]}   event    [description]
* @param  {[type]}   context  [description]
* @param  {Function} callback [description]
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
    var verifyResult = APIParamVerify.verify("/user/photo/uploadurl", "get", event);
    if (verifyResult) {
        verifyResult.requestId = context.awsRequestId;
        console.log(verifyResult);
        callback(JSON.stringify(verifyResult));
        return;
    }

    Photos.checkForPhotoBaseID(event.awsParams.identity_id, context.awsRequestId, function (err, userData) {
        if (err) {
            callback(JSON.stringify(err));
            return;
        }
        var photoId = UUID.v4();
        var key = userData.Item[AWSConstants.DYNAMO_DB.USERS.PHOTO_BASE_ID] + "/" + photoId;

        const params = {
            Bucket: AWSConstants.S3.PHOTOBUCKET.name,
            Key: key,
            Expires: 900,
            ContentType: "image/jpeg",
            ACL: 'public-read',
        };

        s3.getSignedUrl('putObject', params, function (err, data) {
            if (err) {
                console.log(err);
                var errorObject = {
                    requestId: context.awsRequestId,
                    errorType: "InternalServerError",
                    httpStatus: 500,
                    message: "Get signed url failed."
                };
                callback(JSON.stringify(errorObject));
                return;
            }
            // successful result should terminate with callback(null, [resopnseObject]);
            callback(null, {upload_url: data, photo_id: photoId, photo_base_id: userData.Item[AWSConstants.DYNAMO_DB.USERS.PHOTO_BASE_ID]});
            return;
        });
    });
}

exports.handler = handler;
