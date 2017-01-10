/* jshint undef: true, unused: true, esversion: 6, devel: true, node: false, browser: true, module: true */
/* globals AWS:true, apigClientFactory: true */
'use strict';

var awsAPIClientsModule = angular.module("awsAPIClients", ['ngCookies']);

awsAPIClientsModule.value('idendityIdTokenAuthedClient',{IdentityId:null,Token:null,AuthedClient:null});
awsAPIClientsModule.value('providerData',{providerName: null, providerId:null});

awsAPIClientsModule.factory('apiUnauthedClientFactory', function () {
    return apigClientFactory.newClient();
});

awsAPIClientsModule.service('authService', function(apiUnauthedClientFactory, idendityIdTokenAuthedClient, providerData, $cookies) {
    var ctrl = this;

    ctrl.guid = function () {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
    };

    ctrl.deviceId = function () {
        if (!$cookies.get("deviceId")) {
            $cookies.put("deviceId", ctrl.guid());
        }
        return $cookies.get("deviceId");
    };

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
            console.log('attempting to update authed client');

            if (!ctrl.sessionExpired()) {
                console.log("session isn't expired, returning authed client");
                idendityIdTokenAuthedClient.AuthedClient = apigClientFactory.newClient({
                    accessKey: AWS.config.credentials.accessKeyId,
                    secretKey: AWS.config.credentials.secretAccessKey,
                    sessionToken: AWS.config.credentials.sessionToken,
                });      callback(idendityIdTokenAuthedClient.AuthedClient);
            } else {
                console.log("session expired, returning 'no valid session credentials'.");
                idendityIdTokenAuthedClient.AuthedClient = null;
                callback(null, new Error('no valid session credentials'));
            }
        };

        ctrl.clearAll = function () {
            // effectively logs out the user
            ctrl.clearSession();
            ctrl.clearIdentityAndToken();
            ctrl.clearProviderData();
            delete idendityIdTokenAuthedClient.AuthedClient;
        };

        ctrl.clearSession = function () {
            AWS.config.credentials = null;
            $cookies.remove('sessionCredentials');
        };

        ctrl.retrieveStoredSession = function () {
            console.log("retrieving stored session");
            // try to get an authed client.
            var sessionObject = $cookies.getObject('sessionCredentials');
            if (typeof sessionObject == 'object') {
                if (typeof sessionObject.expireTimeJSONDate == 'string') {
                    sessionObject.expireTime = new Date(sessionObject.expireTimeJSONDate);
                    delete sessionObject.expireTimeJSONDate;
                    console.log('retrieved parsable session');
                    AWS.config.credentials = {};
                    AWS.config.credentials.expireTime = sessionObject.expireTime;
                    AWS.config.credentials.accessKeyId = sessionObject.accessKeyId;
                    AWS.config.credentials.secretAccessKey = sessionObject.secretAccessKey;
                    AWS.config.credentials.sessionToken = sessionObject.sessionToken;

                    if (ctrl.sessionExpired()) {
                        console.log("stored session has expired");
                        delete idendityIdTokenAuthedClient.AuthedClient;
                        AWS.config.credentials = null;
                    }
                } else {
                    console.log("unknown date format for token expiration");
                    AWS.config.credentials = null;
                }
            } else {
                console.log('invalid or missing stored session');
                AWS.config.credentials = null;
            }
        };

        ctrl.storeSession = function () {
            console.log("Storing new session credentials");
            var params = {
                accessKeyId: AWS.config.credentials.accessKeyId,
                secretAccessKey: AWS.config.credentials.secretAccessKey,
                sessionToken: AWS.config.credentials.sessionToken,
                expireTimeJSONDate: AWS.config.credentials.expireTime.toJSON()
            };
            $cookies.putObject('sessionCredentials', params);
        };

        ctrl.getNewSession = function(callback) {

            console.log("attempting to get new session from cognito");
            // try to restore provider data if we have it
            ctrl.restoreProviederData();

            if (ctrl.hasIdentityAndToken()) {
                // Set the region where your identity pool exists (us-east-1, eu-west-1)
                var splitIdentity = idendityIdTokenAuthedClient.IdentityId.split(':');
                if (splitIdentity.length < 2) {
                    console.log("invalid IdentityId");
                    callback(null, new Error('invalid IdentityId'));
                    return;
                }
                AWS.config.region = splitIdentity[0];

                // Configure the credentials provider to use your identity pool
                AWS.config.credentials = new AWS.CognitoIdentityCredentials({
                    IdentityId: idendityIdTokenAuthedClient.IdentityId,
                    Logins: {
                        'cognito-identity.amazonaws.com': idendityIdTokenAuthedClient.Token
                    }
                });
            } else {
                console.log("no Identity and Token found");
                AWS.config.credentials = null;
                if (!ctrl.hasReceivedProviderData()) {
                    console.log("no stored provider data");
                    // nothing to do... basically need to logout
                    callback(null,new Error("not enough information to create new session"));
                    return;
                }
            }

            var loginWithProviderData = function (callback){
                if (!ctrl.hasReceivedProviderData()) {
                    console.log("no provider data");
                    // logout;
                    callback(null,new Error("no provider data"));
                    return;
                }
                console.log("trying to get Identity and Token with provider data");
                apiUnauthedClientFactory.tokenPost({},{provider_name: providerData.providerName, id: providerData.providerId, device_id: ctrl.deviceId()})
                .then(function(result){
                    console.log("received Identity and Token from provider data");
                    ctrl.setIdentityAndToken(result.data.IdentityId, result.data.Token, callback);
                }).catch(function(){
                    console.log("fail to get Identity and Token with provider data");
                    callback(null, new Error("unable to get data for new session"));
                });
            };

            // Make the call to obtain session
            if (!AWS.config.credentials && ctrl.hasReceivedProviderData()) {
                loginWithProviderData(callback);
                return;
            }

            AWS.config.credentials.get(function(err){
                if (err) {
                    console.log("could not get session from IdentityID and Token with get");
                    console.log(err);
                    // try one more time with refresh
                    loginWithProviderData(callback);
                } else {
                    ctrl.storeSession();
                    ctrl.updateAuthedClient(function (client, err) {
                        callback(client,err); // also logout if error?
                        if (!err) {
                            // get the curretn client provider and id
                            if (!ctrl.hasReceivedProviderData()) {
                                ctrl.getProviderData(client);
                            } else {
                                console.log("already have provider data, no need to get it again");
                            }
                        }
                    });
                }
            });
        };

        ctrl.clearIdentityAndToken = function () {
            delete idendityIdTokenAuthedClient.IdentityId;
            delete idendityIdTokenAuthedClient.Token;
        };

        ctrl.getProviderData = function (client) {
            console.log("getting provider data");
            client.userMeGet().then(function(result){
                console.log("received provier data");
                ctrl.setProviderNameAndId(result.data.provider_name, result.data.logins[result.data.provider_name]);
                // this infromation is no longer needed
                ctrl.clearIdentityAndToken();
            }).catch(function(result) {
                console.log("failed getting provider data");
                console.log(result);
                // also logout?
            });
        };

        ctrl.hasReceivedProviderData = function () {
            if (providerData.providerName && providerData.providerId) {
                return true;
            }
            return false;
        };

        ctrl.restoreProviederData = function () {
            var providerFromStorage = $cookies.getObject('providerData');
            if (providerFromStorage) {
                providerData.providerName = providerFromStorage.providerName;
                providerData.providerId = providerFromStorage.providerId;
            }
        };

        ctrl.setProviderNameAndId = function (providerName, providerId) {
            providerData.providerName = providerName;
            providerData.providerId = providerId;
            $cookies.putObject('providerData',providerData);
        };

        ctrl.clearProviderData = function () {
            delete providerData.providerName;
            delete providerData.providerId;
            $cookies.remove('providerData');
        };

        ctrl.hasIdentityAndToken = function () {
            if (idendityIdTokenAuthedClient.IdentityId && idendityIdTokenAuthedClient.Token) {
                return true;
            }
            return false;
        };

        ctrl.setIdentityAndToken = function (identityId, token, callback) {
            delete idendityIdTokenAuthedClient.AuthedClient;
            ctrl.clearIdentityAndToken();
            ctrl.clearSession();
            idendityIdTokenAuthedClient.IdentityId = identityId;
            idendityIdTokenAuthedClient.Token = token;
            ctrl.authedClient(callback);
        };

        ctrl.authedClient = function (callback) {
            // try and make a client from stored credentials
            if (!AWS.config.credentials) {
                console.log("Don't have AWS.config.credentials");
                console.log("Attemping to retrieve from cookie");
                ctrl.retrieveStoredSession();
            }
            // try to make a authed client from stored session
            if (!idendityIdTokenAuthedClient.AuthedClient || ctrl.sessionExpired()) {
                if (!idendityIdTokenAuthedClient.AuthedClient) {
                    console.log("don't have a stored authed client");
                }
                if (ctrl.sessionExpired()) {
                    console.log("session is expired");
                }

                ctrl.updateAuthedClient(function(client, err) {
                    console.log("updating authed client");
                    if (err) {
                        // try to start from identityID & token
                        ctrl.getNewSession(function (authedClient,err) {
                            if (err) {
                                callback(null,err); // could not get session
                            } else {
                                callback(authedClient);
                            }
                        });
                    } else {
                        callback(client);
                        // check to make sure we have provider data.
                        if (!ctrl.hasReceivedProviderData()) {
                            // lets see if it can be
                            ctrl.restoreProviederData();
                            if (!ctrl.hasReceivedProviderData()) {
                                ctrl.getProviderData(client);
                            }
                        }
                    }
                });
            } else {
                callback(idendityIdTokenAuthedClient.AuthedClient);
            }
        };
    }
);
