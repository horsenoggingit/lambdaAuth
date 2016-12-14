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

  var errorObject = {
    requestId: context.awsRequestId,
    errorType : "BadRequest",
    httpStatus : 400,
  };
  // want either email & password or provider-name & id
  if (event.email) {
    if (!event.password) {
      errorObject['message'] = "Validation error: missing required parameter \"password\".";
      callback(JSON.stringify(errorObject));
      return;
    }
  }
  if (event.password) {
    if (!event.email) {
      errorObject['message'] = "Validation error: missing required parameter \"email\".";
      callback(JSON.stringify(errorObject));
      return;
    }
  }
  if (event['provider-name']) {
    if (!event.id) {
      errorObject['message'] = "Validation error: missing required parameter \"id\".";
      callback(JSON.stringify(errorObject));
      return;
    }
  }
  if (event.id) {
    if (!event['provider-name']) {
      errorObject['message'] = "Validation error: missing required parameter \"provider-name\".";
      callback(JSON.stringify(errorObject));
      return;
    }
  }

  var getIdentityIDAndToken = function(id, event, awsRequestId, callback) {
    UserIdentity.getOpenIDToken(AWS, AWSConstants.COGNITO.IDENTITY_POOL.identityPoolId, AWSConstants.COGNITO.IDENTITY_POOL.authProviders.custom.developerProvider, id, function (err,OpenIDToken) {
      if (err) {
        console.log(err);
        console.log("Could not get user identity from cognito for request: " + context.awsRequestId);
        var errorObject = {
          requestId: awsRequestId,
          errorType : "InternalServerError",
          httpStatus : 500,
          message : "Could not get user identity."
        };
        callback(JSON.stringify(errorObject));
      } else {
        // if we are just refreshing the credentials just return the IdentityId and Token
        if (event.id) {
          callback(null,OpenIDToken);
          return;
        }
        // now lookup in the user table
        params = {
          TableName: AWSConstants.DYNAMO_DB.USERS.name,
          Key:{}
        }
        params.Key[AWSConstants.DYNAMO_DB.USERS.ID] = OpenIDToken.IdentityId;

        docClient.get(params,function(err, userData) {
          if (err) {
            console.log(err);
            console.log("Could not get user info from db for request: " + context.awsRequestId);
            var errorObject = {
              requestId: awsRequestId,
              errorType : "InternalServerError",
              httpStatus : 500,
              message : "Could not get user info."
            };
            callback(errorObject)
          } else {
            if (typeof userData.Item.password == 'string') {
              if (PH.passwordHash(event.password) === userData.Item.password) {
                callback(null,OpenIDToken);
              } else {
                console.log("Password missmatch for request: " + context.awsRequestId);
                var errorObject = {
                  requestId: awsRequestId,
                  errorType : "Unauthorized",
                  httpStatus : 401,
                  message : "No matching login informaiton."
                };
                callback(JSON.stringify(errorObject));
              }
            } else {
              console.log("user does not have a valid password data for request: " + context.awsRequestId);
              var errorObject = {
                requestId: awsRequestId,
                errorType : "InternalServerError",
                httpStatus : 500,
                message : "Could not get user info."
              };
              callback(JSON.stringify(errorObject));
            }
          }
        });
      }
    });
  }

  if (event.id && event['provider-name']) {
    getIdentityIDAndToken(event.id, event,context.awsRequestId, callback);
    return;
  }

  // check if the email exists
  var params = {
    TableName: AWSConstants.DYNAMO_DB.EMAILS.name,
    Key:{}
  };
  params.Key[AWSConstants.DYNAMO_DB.EMAILS.EMAIL] = event.email;
  docClient.get(params, function (err, data) {
    if (err) {
      console.log(err);
      console.log("Could not get user identity from email db for request: " + context.awsRequestId);
      var errorObject = {
        requestId: context.awsRequestId,
        errorType : "Unauthorized",
        httpStatus : 401,
        message : "No matching login informaiton."
      };
      callback(JSON.stringify(errorObject));
    } else {
      // it we get some objects back from the email table then the users has already signed up
      if (typeof data.Item == "object") {
        // go to cognito and pull up the identity
        getIdentityIDAndToken(data.Item.id, event, context.awsRequestId, function (err, data) {
          if (err || !data || !data.IdentityId || !data.Token) {
            console.log("Could not get user identity from cognito for request: " + context.awsRequestId);
            var errorObject = {
              requestId: context.awsRequestId,
              errorType : "Unauthorized",
              httpStatus : 401,
              message : "No matching login informaiton."
            };
            callback(JSON.stringify(errorObject));
          } else {
            // have user data
            // update login timestamp
            var paramsUser = {
              TableName: AWSConstants.DYNAMO_DB.USERS.name,
              Key : {},
              UpdateExpression: "set " + AWSConstants.DYNAMO_DB.USERS.LAST_LOGIN_TIMESTAMP + " = :t",
              ExpressionAttributeValues: {
                  ":t": Date.now()
                }
            }
            paramsUser.Key[AWSConstants.DYNAMO_DB.USERS.ID] = data.IdentityId;
            docClient.update(paramsUser, function (err, updateData) {
              if (err) {
                console.log("unable to update login timestamp for request: " + context.awsRequestId);
                var errorObject = {
                  requestId: context.awsRequestId,
                  errorType : "InternalServerError",
                  httpStatus : 500,
                  message : "Could not set user info."
                };
                callback(JSON.stringify(errorObject));
              } else {
                callback(null, data);
              }
            });
          }
        });
      } else {
        console.log("Could not get user info from db for request: " + context.awsRequestId);
        var errorObject = {
          requestId: context.awsRequestId,
          errorType : "Unauthorized",
          httpStatus : 401,
          message : "No matching login informaiton."
        };
        callback(JSON.stringify(errorObject));
      }
    }
  });
};
