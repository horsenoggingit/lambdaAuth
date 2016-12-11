'use strict';

var awsAPIClientsModule = angular.module("awsAPIClients", ['ngCookies']);

awsAPIClientsModule.value('idendityIdTokenAuthedClient',{IdentityId:null,Token:null,AuthedClient:null,ProviderName:null,ProviderId:null});

awsAPIClientsModule.factory('apiUnauthedClientFactory', function () {
  return apigClientFactory.newClient();
})

awsAPIClientsModule.service('authService', function(apiUnauthedClientFactory, idendityIdTokenAuthedClient, $cookies) {
  var ctrl = this;

  ctrl.sessionExpired = function () {
    if (AWS.config.credentials && AWS.config.credentials.expireTime) {
      console.log("session will expire in " + ((AWS.config.credentials.expireTime.getTime() - (new Date()).getTime())/1000.0/60.0) + " minutes.");
    }

    if (!AWS.config.credentials ||
      !AWS.config.credentials.accessKeyId ||
      !AWS.config.credentials.secretAccessKey ||
      !AWS.config.credentials.sessionToken ||
      !AWS.config.credentials.expireTime ||
      AWS.config.credentials.expireTime < new Date()) {
        return true;
      } else {
        return false;
      }
  };

  ctrl.updateAuthedClient = function (callback) {
    console.log('attempting to update authed client')
    var updateClient = function (){
      idendityIdTokenAuthedClient['AuthedClient'] = apigClientFactory.newClient({
          accessKey: AWS.config.credentials.accessKeyId,
          secretKey: AWS.config.credentials.secretAccessKey,
          sessionToken: AWS.config.credentials.sessionToken,
      });
    }

    if (!ctrl.sessionExpired()) {
      console.log("session isn't expired, returning authed client")
      updateClient();
      callback(idendityIdTokenAuthedClient['AuthedClient']);
    } else {
      console.log("session expired, returning 'no valid session credentials'.")
      idendityIdTokenAuthedClient['AuthedClient'] = null;
      callback(null, new Error('no valid session credentials'));
    }
  };

  ctrl.clearSession = function () {
    AWS.config.credentials = null;
    $cookies.remove('sessionCredentials');
  }

  ctrl.retrieveStoredSession = function () {
    console.log("retrieving stored session")
    // try to get an authed client.
    var sessionObject = $cookies.getObject('sessionCredentials');
    if (typeof sessionObject == 'object') {
      if (typeof sessionObject.expireTimeJSONDate == 'string') {
        sessionObject['expireTime'] = new Date(sessionObject.expireTimeJSONDate);
        delete sessionObject.expireTimeJSONDate;
        console.log('retrieved parsable session');
        ctrl.retrieveIdentityAndToken();
        if (ctrl.hasIdentityAndToken()) {
          AWS.config.credentials = new AWS.CognitoIdentityCredentials({
             IdentityId: idendityIdTokenAuthedClient['IdentityId'],
             Logins: {
                'cognito-identity.amazonaws.com': idendityIdTokenAuthedClient['Token']
             }
          });
          AWS.config.credentials['expireTime'] = sessionObject.expireTime;
          AWS.config.credentials['accessKeyId'] = sessionObject.accessKeyId;
          AWS.config.credentials['secretAccessKey'] = sessionObject.secretAccessKey;
          AWS.config.credentials['sessionToken'] = sessionObject.sessionToken;
          AWS.config.credentials['identityId'] = idendityIdTokenAuthedClient['IdentityId'];

        } else {
          console.log("missing identityId and token")
          AWS.config.credentials = null;
        }


      } else {
        console.log("unknown date format")
        AWS.config.credentials = null;
      }
    } else {
      console.log('invalid or missing stored session')
      AWS.config.credentials = null;
    }
  };

  ctrl.getSession = function(callback) {

    console.log("attempting to get session from cognito")

    if (ctrl.hasIdentityAndToken()) {
      // Set the region where your identity pool exists (us-east-1, eu-west-1)
      var splitIdentity = idendityIdTokenAuthedClient['IdentityId'].split(':');
      if (splitIdentity.length < 2) {
        console.log("invalid IdentityId")
        return(null, new Error('invalid IdentityId'));
      }
      AWS.config.region = splitIdentity[0];

      // Configure the credentials provider to use your identity pool
      AWS.config.credentials = new AWS.CognitoIdentityCredentials({
         IdentityId: idendityIdTokenAuthedClient['IdentityId'],
         Logins: {
            'cognito-identity.amazonaws.com': idendityIdTokenAuthedClient['Token']
         }
      });
    }

    var loginWithProviderData = function (callback){
      if (!ctrl.hasReceivedProviderData()) {
        console.log("no provider data")
        // logout;
        callback(null,new Error("no provider data"));
        return;
      }
      console.log("trying to get Identity and Token with provider data")
      apiUnauthedClientFactory.loginPost({},{'provider-name': idendityIdTokenAuthedClient['providerName'], 'id': idendityIdTokenAuthedClient['providerId']})
      .then(function(result){
          console.log("received Identity and Token from provider data");
          ctrl.setIdentityAndToken(result.data.IdentityId, result.data.Token, callback);
      }).catch(function(result){
          console.log("fail to get Identity and Token with provider data");
      });
    };

    // Make the call to obtain session
/*    if (ctrl.sessionExpired() && ctrl.hasReceivedProviderData()) {
      loginWithProviderData(callback);
      return;
    }
*/
    AWS.config.credentials.get(function(err){
      if (err) {
        console.log("could not get session from IdentityID and Token with get")
        console.log(err);
        // try one more time with refresh
        loginWithProviderData(callback);
      } else {
        console.log("Storing new session credentials")
        var params = {
          accessKeyId: AWS.config.credentials.accessKeyId,
          secretAccessKey: AWS.config.credentials.secretAccessKey,
          sessionToken: AWS.config.credentials.sessionToken,
          expireTimeJSONDate: AWS.config.credentials.expireTime.toJSON()
        }
        $cookies.putObject('sessionCredentials', params);
        ctrl.updateAuthedClient(function (client, err) {
          callback(client,err); // also logout?
          if (!err) {
            // get the curretn client provider and id
            if (!ctrl.hasReceivedProviderData()) {
              console.log("getting provider data")
              client.userMeGet().then(function(result){
                console.log("received provier data")
                ctrl.setProviderNameAndId(result.data['provider-name'], result.data.logins[result.data['provider-name']]);
              }).catch(function(result) {
                console.log("failed getting provider data");
                console.log(result);
                // also logout?
              });
            } else {
              console.log("already have provider data, no need to get it again");
            }
          }
        });
      }
    });
  }

  ctrl.clearIdentityAndToken = function () {
    delete idendityIdTokenAuthedClient['IdentityId'];
    delete idendityIdTokenAuthedClient['Token'];
    delete idendityIdTokenAuthedClient['AuthedClient'];
    $cookies.putObject('idendityIdTokenAuthedClient',idendityIdTokenAuthedClient);
  }

  ctrl.hasReceivedProviderData = function () {
    if (idendityIdTokenAuthedClient['providerName']&&idendityIdTokenAuthedClient['providerId']) {
      return true;
    }
    return false;
  }

  ctrl.setProviderNameAndId = function (providerName, providerId) {
    idendityIdTokenAuthedClient['providerName'] = providerName;
    idendityIdTokenAuthedClient['providerId'] = providerId;
    $cookies.putObject('idendityIdTokenAuthedClient',idendityIdTokenAuthedClient);
  }

  ctrl.hasIdentityAndToken = function () {
    if (idendityIdTokenAuthedClient['IdentityId'] && idendityIdTokenAuthedClient['Token']) {
      return true;
    }
    return false;
  }

  ctrl.setIdentityAndToken = function (identityId, token, callback) {
    ctrl.clearIdentityAndToken();
    ctrl.clearSession();
    idendityIdTokenAuthedClient['IdentityId'] = identityId;
    idendityIdTokenAuthedClient['Token'] = token;
    $cookies.putObject('idendityIdTokenAuthedClient',idendityIdTokenAuthedClient);
    ctrl.authedClient(callback);
  }

  ctrl.retrieveIdentityAndToken = function () {
    console.log("attempting to retrieve retrieveIdentityAndToken");
    var idendityIdToken = $cookies.getObject('idendityIdTokenAuthedClient');
    if (idendityIdToken) {
      console.log("retrieved IdentityAndToken");
      idendityIdTokenAuthedClient['IdentityId'] = idendityIdToken.IdentityId;
      idendityIdTokenAuthedClient['Token'] = idendityIdToken.Token;
      idendityIdTokenAuthedClient['providerName'] = idendityIdToken.providerName;
      idendityIdTokenAuthedClient['providerId'] = idendityIdToken.providerId;

    } else {
      console.log("no retrieveIdentityAndToken found clearing");
      ctrl.clearIdentityAndToken();
    }
  }

  ctrl.authedClient = function (callback) {
    // try and make a client from stored credentials
    if (!AWS.config.credentials) {
      console.log("Don't have AWS.config.credentials")
      console.log("Attemping to retrieve from cookie")
      ctrl.retrieveStoredSession();
    }
    // try to make a authed client from stored session
    if (!idendityIdTokenAuthedClient['AuthedClient'] || ctrl.sessionExpired()) {
      if (!idendityIdTokenAuthedClient['AuthedClient']) {
        console.log("don't have a stored authed client");
      }
      if (ctrl.sessionExpired()) {
        console.log("session is expired")
      }

      ctrl.updateAuthedClient(function(client, err) {
        console.log("updating authed client")
        if (err) {
          // try to start from identityID & token
          ctrl.retrieveIdentityAndToken();
          if (ctrl.hasIdentityAndToken() || ctrl.hasReceivedProviderData()) {
            ctrl.getSession(function (authedClient,err) {
              if (err) {
                callback(null,err); // could not get session
              } else {
                callback(authedClient);
              }
            })
          } else {
            callback(null, new Error('no idendityIdTokenAuthedClient'));
          }
        } else {
          callback(client);
        }
      });
    } else {
      callback(idendityIdTokenAuthedClient['AuthedClient']);
    }
  }
});
