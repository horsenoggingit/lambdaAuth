'use strict';

var awsAPIClientsModule = angular.module("awsAPIClients", []);

awsAPIClientsModule.value('idendityIdTokenAuthedClient',{IdentityId:null,Token:null,AuthedClient:null, });

awsAPIClientsModule.factory('apiUnauthedClientFactory', function () {
  return apigClientFactory.newClient();
})

awsAPIClientsModule.service('authService', function(idendityIdTokenAuthedClient) {
  var ctrl = this;
  this.updateAuthedClient = function () {
    idendityIdTokenAuthedClient['AuthedClient'] = apigClientFactory.newClient({
        accessKey: AWS.config.credentials.accessKeyId,
        secretKey: AWS.config.credentials.secretAccessKey,
        sessionToken: AWS.config.credentials.sessionToken,
    });
  };

  this.setIdentityAndToken = function (identityId, token, callback) {
    idendityIdTokenAuthedClient['IdentityId'] = identityId;
    idendityIdTokenAuthedClient['Token'] = token;

    // Set the region where your identity pool exists (us-east-1, eu-west-1)
    AWS.config.region = identityId.split(':')[0];

    // Configure the credentials provider to use your identity pool
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
       IdentityId: identityId,
       Logins: {
          'cognito-identity.amazonaws.com': token
       }
    });

    // Make the call to obtain session
    AWS.config.credentials.get(function(err){
      if (err) {
        if (callback) {
          callback(err);
        }
        return;
      }

      console.log("Received Session Credentials")

      ctrl.updateAuthedClient();

      console.log("Auth Session Active")
      if (callback) {
        callback(null);
      }
    });
  }

  this.authedClient = function () {
    return idendityIdTokenAuthedClient['AuthedClient'];
  }
})



var credentialModule = angular.module("credentialModule", [])
.value("lastLoginSignupInfo", {email: ""});

// Declare app level module which depends on views, and components
angular.module('lambdaAuth', [
  'credentialModule',
  'awsAPIClients',
  'ngRoute',
  'signup',
  'login'
]).
config(['$locationProvider', '$routeProvider' ,function($locationProvider, $routeProvider) {

  $locationProvider.hashPrefix('!');
  $routeProvider.when('/signup', {
    template: '<signup></signup>'
  }).
  when('/login', {
    template: '<login></login>'
  }).
  otherwise('/signup')

}]);
