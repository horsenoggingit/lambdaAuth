'use strict';

console.log('Loading function');

const fs = require('fs');
const AWSConstants = JSON.parse(fs.readFileSync('./AWSConstants.json', 'utf8'));

var AWS = require("aws-sdk");

var docClient = new AWS.DynamoDB.DocumentClient();

const PH = require('./PasswordHash');
const UserIdentity = require('./UserIdentity')
const APIParamVerify = require('./APIParamVerify')

/**
* handler signup
* @param  {[type]}   event    [description]
* @param  {[type]}   context  [description]
* @param  {Function} callback [description]
* @return {[type]}            [description]
*
*/
exports.handler = (event, context, callback) => {
  console.log(event);
  // make sure we have needed params
  var verifyResult = APIParamVerify.verify("/login", "post", event);
  if (verifyResult) {
    verifyResult["requestId"] = context.awsRequestId;
    console.log(verifyResult);
    callback(JSON.stringify(verifyResult));
    return;
  }

  // check if the email has already been used
  var params = {
    TableName: AWSConstants.DYNAMO_DB.EMAILS.name,
    Key:{}
  };
  params.Key[AWSConstants.DYNAMO_DB.EMAILS.EMAIL] = event.email;
  docClient.get(params, function (err, data) {
    if (err) {
      callback(err);
    } else {
      // it we get some objects back from the email table then the users has already signed up
      if (typeof data.Item == "object") {
        console.log(data)
        // now lookup in the user table
        params = {
          TableName: AWSConstants.DYNAMO_DB.USERS.name,
          Key:{}
        }
        params.Key[AWSConstants.DYNAMO_DB.USERS.ID] = data.Item.id;

        docClient.get(params,function(err, userData) {
          if (err) {
            callback(err);
          } else {
            if (typeof userData.Item.password == 'string') {
              if (PH.passwordHash(event.password) === userData.Item.password) {
                UserIdentity.getOpenIDToken(AWS, AWSConstants.COGNITO.IDENTITY_POOL.identityPoolId, AWSConstants.COGNITO.IDENTITY_POOL.authProviders.custom.developerProvider, data.Item.id, function (err,OpenIDToken) {
                  if (err) {
                    callback(err);
                  } else {
                    callback(null,OpenIDToken);
                  }
                });
              } else {
                // should be vague about this
                callback(new Error("Incorrect password"));
              }
            } else {
              callback(new Error("Invalid record: " + data.Item.id));
            }
          }
        });

      } else {
        callback(new Error("Account not found"));
      }
    }
  });
};
