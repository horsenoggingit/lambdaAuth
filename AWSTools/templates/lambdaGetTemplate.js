'use strict';

console.log('Loading function');

const fs = require('fs');
const AWSConstants = JSON.parse(fs.readFileSync('./AWSConstants.json', 'utf8'));
const APIParamVerify = require('./APIParamVerify');
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

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
    var verifyResult = APIParamVerify.verify("{$urlPath}", "get", event);
    if (verifyResult) {
        verifyResult.requestId = context.awsRequestId;
        console.log(verifyResult);
        callback(JSON.stringify(verifyResult));
        return;
    }
    // successful result should terminate with callback(null, [resopnseObject]);
    callback(null,{});
}

exports.handler = handler;
