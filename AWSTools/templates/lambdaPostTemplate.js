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

    // make sure we have needed params
    var verifyResult = APIParamVerify.verify("{$urlPath}", "post", event);
    if (verifyResult) {
        verifyResult.requestId = context.awsRequestId;
        console.log(verifyResult);
        callback(JSON.stringify(verifyResult));
        return;
    }
}

exports.handler = handler;
