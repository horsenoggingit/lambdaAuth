#!/usr/bin/env node

var path = require('path');
const awscommon = require(path.join(__dirname, 'awscommonutils'))
var fs = require('fs');
var YAML = require('yamljs');
const exec = require('child_process').exec;
const AwsRequest = require(path.join(__dirname, 'AwsRequest'));

var YAML = require('yamljs');
var argv = require('yargs')
.usage('Create the identity pools required for the project.\nIf identity pools with the same name already exist a new pool will not be created and the existing pool infomation will be used.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that containes information about your API')
.default('s','./base.definitions.yaml')
.help('h')
.alias('h', 'help')
.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
  throw new Error("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.")
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

var AWSCLIUserProfile = "default";
if (!awscommon.verifyPath(baseDefinitions,['enviroment', 'AWSCLIUserProfile'],'s').isVerifyError) {
  AWSCLIUserProfile = baseDefinitions.enviroment.AWSCLIUserProfile;
} else {
  console.log("using \"default\" AWSCLIUserProfile");
}

awscommon.verifyPath(baseDefinitions, ['cognitoIdentityPoolInfo', 'identityPools'], 'o', "definitions file \""+argv.baseDefinitionsFile+"\"").exitOnError();

var numIdentityPools = Object.keys(baseDefinitions.cognitoIdentityPoolInfo.identityPools).length;
var successDecCount = numIdentityPools;

// first lets get the identity pools to see if one with our name exists already
getIdentityPools(function (serverIdentityPools) {
  // now see which ones are valid and which ones need to be createed
  var poolCreateRequests = [];
  var roleNames = Object.keys(baseDefinitions.cognitoIdentityPoolInfo.identityPools).forEach(function (identityPoolName) {
    var poolDef = baseDefinitions.cognitoIdentityPoolInfo.identityPools[identityPoolName];
    if (serverIdentityPools) {
      for (var index = 0; index < serverIdentityPools.IdentityPools.length; index ++) {
        if (identityPoolName === serverIdentityPools.IdentityPools[index].IdentityPoolName) {
          baseDefinitions.cognitoIdentityPoolInfo.identityPools[identityPoolName].identityPoolId = serverIdentityPools.IdentityPools[index].IdentityPoolId;
          console.log("Found identity pool \"" + identityPoolName + "\" on aws.");
          setRoles(identityPoolName);
          numIdentityPools --;
          successDecCount --;
          if (numIdentityPools == 0) {
            writeout();
            return;
          } else {
            break;
          }
        }
      }
    }
    // validate to make sure we have everything
    awscommon.verifyPath(poolDef, ['allowUnauthedIdentities'], 'b', "identity pool definition \"" + identityPoolName + "\"").exitOnError();
    awscommon.verifyPath(poolDef, ['authProviders'], 'o', "identity pool definition \"" + identityPoolName + "\"").exitOnError();

    var params={
        'identity-pool-name': {type: 'string', value: identityPoolName},
        'profile': {type: 'string', value:AWSCLIUserProfile}
      };
    params[(poolDef.allowUnauthedIdentities ? 'allow-unauthenticated-identities': 'no-allow-unauthenticated-identities')] = {type: 'none'};
    Object.keys(poolDef.authProviders).forEach(function(authProvider) {
      switch (authProvider) {
        case 'custom':
          awscommon.verifyPath(poolDef.authProviders,['custom', 'developerProvider'],'s','custom developer provider for pool "' + identityPoolName + '""').exitOnError();
          params['developer-provider-name'] = {type: 'string', value:poolDef.authProviders.custom.developerProvider};
          break;
        default:
      }
    });

    poolCreateRequests.push(
      AwsRequest.createRequest({
        serviceName:'cognito-identity',
        functionName:'create-identity-pool',
        context: {poolName: identityPoolName},
        returnSchema:'json',
        returnValidation:[{path:['IdentityPoolId'], type:'s'}],
        parameters:params
      },
      function (request) {
        if (!request.response.error) {
          // set roles if present
          setRoles(request.context.identityPoolName);
        }
      })
    );
  });
  AwsRequest.createBatch(poolCreateRequests, function (batch) {
    batch.requestArray.forEach(function (request) {
      if (request.response.error) {
        console.log(request.response.error);
        console.log("Failed to create pool " + request.context.poolName + ".");
      } else {
        console.log("Successfully createed pool " + request.context.poolName + ".");
        successDecCount --;
        baseDefinitions.cognitoIdentityPoolInfo.identityPools[request.context.poolName]['identityPoolId'] = request.response.parsedJSON.IdentityPoolId;
      }
    })
    writeout();
  }).startRequest();
});

function writeout() {
  // now delete role
  awscommon.updateFile(argv.baseDefinitionsFile, function () {
    return YAML.stringify(baseDefinitions, 15);
  }, function (backupErr, writeErr) {
    if (backupErr) {
      console.log("Could not create backup of \"" + argv.baseDefinitionsFile + "\". pool id was not updated.");
      throw backupErr;
    }
    if (writeErr) {
      console.log("Unable to write updated definitions file.");
      throw writeErr;
    }
    if (successDecCount != 0) {
      console.log("Some creation operations failed.")
    }

    console.log("Done.")
  });
}

function getIdentityPools (doneCallback) {
    AwsRequest.createRequest({
    serviceName:'cognito-identity',
    functionName:'list-identity-pools',
    returnSchema:'json',
    returnValidation:[{path:['IdentityPools','IdentityPoolId'], type:'s'},
                      {path:['IdentityPools','IdentityPoolName'], type:'s'}],
    parameters:{
      'max-results': {type: 'string', value:'15'},
      'profile': {type: 'string', value:AWSCLIUserProfile}
    }
  }, function(request) {
    if (request.response.error) {
      console.log(request.response.error);
      doneCallback(null);
      return;
    }
    doneCallback(request.response.parsedJSON);
  }).startRequest();
}

function setRoles(identityPoolName){
  if (!awscommon.verifyPath(baseDefinitions, ['cognitoIdentityPoolInfo', 'identityPools', identityPoolName, 'roles'], 'o',"").isVerifyError) {
    var roles = {};
    // TODO GET ROLE ARN!!!
    roles = baseDefinitions.cognitoIdentityPoolInfo.identityPools[identityPoolName].roles;
    var identityPoolRoles = {};
    Object.keys(roles).forEach(function (roleType) {
      identityPoolRoles[roleType] = baseDefinitions.cognitoIdentityPoolInfo.roleDefinitions[roles[roleType]].arnRole;
    })
    AwsRequest.createRequest({
      serviceName: 'cognito-identity',
      functionName: 'set-identity-pool-roles',
      context: {poolName: identityPoolName},
      returnSchema:'none',
      parameters: {
        'identity-pool-id' : {type:'string', value:baseDefinitions.cognitoIdentityPoolInfo.identityPools[identityPoolName].identityPoolId},
        'roles' : {type: 'JSONObject', value:identityPoolRoles},
        'profile': {type: 'string', value:AWSCLIUserProfile}
      }
    },
    function (roleReq) {
      if (roleReq.response.error) {
        throw roleReq.response.error;
      } else {
        console.log("Set Roles for \"" + roleReq.context.poolName + "\"");
      }
    }).startRequest();
  }
}
