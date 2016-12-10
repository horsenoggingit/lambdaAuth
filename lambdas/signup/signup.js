'use strict';

console.log('Loading function');

const fs = require('fs');
const AWSConstants = JSON.parse(fs.readFileSync('./AWSConstants.json', 'utf8'));

var AWS = require("aws-sdk");

var docClient = new AWS.DynamoDB.DocumentClient();

const PH = require('./PasswordHash');
const UniqueID = require('./UniqueID');
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
  var verifyResult = APIParamVerify.verify("/signup", "post", event);
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
  params.Key[AWSConstants.DYNAMO_DB.EMAILS.EMAIL] =  event.email;
  docClient.get(params, function (err, data) {
    if (err) {
      console.log(err);
      console.log("Could not validate for email for request: " + context.awsRequestId);
      var errorObject = {
        requestId: context.awsRequestId,
        errorType : "InternalServerError",
        httpStatus : 500,
        message : "Could not validate email."
      };
      callback(JSON.stringify(errorObject));
    } else {
      // it we get some objects back from the email table then the users has already signed up
      if (typeof data.Item == "object") {
        console.log(data)
        var errorObject = {
          requestId: context.awsRequestId,
          errorType : "Conflict",
          httpStatus : 409,
          message : "Item exists"
        };
        console.log(errorObject);
        callback(JSON.stringify(errorObject));
      } else {
        // generate a unique id for the user as the developer provier id
        UniqueID.getUniqueId(AWSConstants.DYNAMO_DB.USERS.name, docClient, function(err, newID) {
          if (err) {
            console.log(err);
            console.log("Could not generate new id for request: " + context.awsRequestId);
            var errorObject = {
              requestId: context.awsRequestId,
              errorType : "InternalServerError",
              httpStatus : 500,
              message : "Could not generate new id."
            };
            callback(JSON.stringify(errorObject));
          } else {

            // now create a cognito identity with ths id and custome provider
            UserIdentity.getOpenIDToken(AWS, AWSConstants.COGNITO.IDENTITY_POOL.identityPoolId, AWSConstants.COGNITO.IDENTITY_POOL.authProviders.custom.developerProvider, newID ,function (err,OpenIDToken) {
              if (err) {
                console.log(err);
                console.log("Could not generate open id token for request: " + context.awsRequestId);
                var errorObject = {
                  requestId: context.awsRequestId,
                  errorType : "InternalServerError",
                  httpStatus : 500,
                  message : "Could not generate open id token."
                };
                callback(JSON.stringify(errorObject));
              } else {

                // Add the email to the email table with provier token
                // login will use this to lookup the identity
                var paramsEmail = {
                  TableName: AWSConstants.DYNAMO_DB.EMAILS.name,
                  Item: {}
                }

                paramsEmail.Item[AWSConstants.DYNAMO_DB.EMAILS.EMAIL] = event.email;
                paramsEmail.Item[AWSConstants.DYNAMO_DB.EMAILS.ID] = newID;

                docClient.put(paramsEmail, function (err, emailData) {
                  if (err) {
                    console.log(err);
                    console.log("Could not put email and id to emails db for request: " + context.awsRequestId);
                    var errorObject = {
                      requestId: context.awsRequestId,
                      errorType : "InternalServerError",
                      httpStatus : 500,
                      message : "Could not put email and id."
                    };
                    callback(JSON.stringify(errorObject));
                  }
                })
                var now = Date.now();
                // Add the user to the user table
                var paramsUser = {
                  TableName: AWSConstants.DYNAMO_DB.USERS.name,
                  Item: {}
                }

                paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.ID] = OpenIDToken.IdentityId;
                paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.PASSWORD] = PH.passwordHash(event.password);
                paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.EMAIL] = event.email;
                paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.SIGNUP_TIMESTAMP] = now;
                paramsUser.Item[AWSConstants.DYNAMO_DB.USERS.LAST_LOGIN_TIMESTAMP] = -1;

                docClient.put(paramsUser, function (err, userData) {
                  if (err) {
                    console.log(err);
                    console.log("Could not put user info to db for request: " + context.awsRequestId);
                    var errorObject = {
                      requestId: context.awsRequestId,
                      errorType : "InternalServerError",
                      httpStatus : 500,
                      message : "Could not put user info."
                    };
                    callback(JSON.stringify(errorObject));
                  } else {
                    callback(null,OpenIDToken);
                  }
                });
              }
            });
          }
        });
      }
    }
  });
};
