'use strict';

console.log('Loading function');

const fs = require('fs');
const AWSConstants = JSON.parse(fs.readFileSync('./AWSConstants.json', 'utf8'));
const APIParamVerify = require('./APIParamVerify');

var AWS = require("aws-sdk");

var docClient = new AWS.DynamoDB.DocumentClient();
/**
* handler signup
* @param  {[type]}   event    [description]
* @param  {[type]}   context  [description]
* @param  {Function} callback [description]
* @return {[type]}            [description]
*
*/
exports.handler = (event, context, callback) => {

  // make sure we have needed params
  var verifyResult = APIParamVerify.verify("/user/me", "get", event);
  if (verifyResult) {
    verifyResult["requestId"] = context.awsRequestId;
    console.log(verifyResult);
    callback(JSON.stringify(verifyResult));
    return;
  }

  // event containes the identity_id that is filled in by API GATEWAY by payload mapping to this lambda
  // lookup in the user table
  var params = {
    TableName: AWSConstants.DYNAMO_DB.USERS.name,
    Key:{}
  }
  params.Key[AWSConstants.DYNAMO_DB.USERS.ID] = event.identity_id;

  docClient.get(params,function(err, userData) {
    if (err) {
      console.log(err);
      console.log("Could not get user info from db for request: " + context.awsRequestId);
      var errorObject = {
        requestId: context.awsRequestId,
        errorType : "InternalServerError",
        httpStatus : 500,
        message : "Could not get user info."
      };
      callback(JSON.stringify(errorObject));
    } else {
      console.log(userData);
      callback(null, {email: userData.Item[AWSConstants.DYNAMO_DB.USERS.EMAIL]});
    }
  });

}
