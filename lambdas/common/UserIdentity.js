"use strict";

const AWS = require("aws-sdk");
const cognitoidentity = new AWS.CognitoIdentity();

/**
* getOpenIDToken get a cognito OPEN ID token for user ID
* @param  {AWS}      AWS      AWS instance
* @param  {string}   poolID   cognito pool id
* @param  {string}   userID   user ID
* @param  {Function(err: Error, object: data)} callback cognito Open ID Token
*/
function getOpenIDToken(poolID, identityId, developerProvider, userID, callback) {
    var params = {
        IdentityPoolId: poolID,
        Logins: {}
    };
    params.Logins[developerProvider] = userID;
    if (identityId) {
        params.IdentityId = identityId;
    }
    cognitoidentity.getOpenIdTokenForDeveloperIdentity(params, function (err, data) {
        if (err) {
            console.log(err);
            callback(err);
        } else {
            console.log(data); // so you can see your result server side
            callback(null, data);
        }
    });
}

exports.getOpenIDToken = getOpenIDToken;

function lookupIdentity(poolId, userID, callback) {
    var params = {
        IdentityPoolId: poolId,
        DeveloperUserIdentifier: userID,
        MaxResults: 1,
    };
    cognitoidentity.lookupDeveloperIdentity(params, function(err, data) {
        if (err) {
            console.log(err);
            callback(err);
            return;
        }
        console.log(data);
        callback(null, data.IdentityId);
    });
}

exports.lookupIdentity = lookupIdentity;
