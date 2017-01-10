"use strict";

/**
* getOpenIDToken get a cognito OPEN ID token for user ID
* @param  {AWS}      AWS      AWS instance
* @param  {string}   poolID   cognito pool id
* @param  {string}   userID   user ID
* @param  {Function(err: Error, object: data)} callback cognito Open ID Token
*/
function getOpenIDToken(AWS, poolID, developerProvider, userID, callback) {
    var cognitoidentity = new AWS.CognitoIdentity();
    var params = {
        IdentityPoolId: poolID,
        Logins: {}
    };
    params.Logins[developerProvider] = userID;
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
