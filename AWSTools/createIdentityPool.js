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
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.help('h')
.alias('h', 'help')
.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
  throw new Error("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.")
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

var AWSCLIUserProfile = "default";
if (!awscommon.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
  AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
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
          updateRolePolicyDocumentStatementConditions(identityPoolName);
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
        setRoles(request.context.poolName);
        updateRolePolicyDocumentStatementConditions(request.context.poolName);
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

function updateRolePolicyDocumentStatementConditions(identityPoolName) {
  // first get the role
  var roles = baseDefinitions.cognitoIdentityPoolInfo.identityPools[identityPoolName].roles;
  Object.keys(roles).forEach(function (roleType) {
    var role = roles[roleType];
    if (!awscommon.verifyPath(baseDefinitions,['cognitoIdentityPoolInfo','identityPools',identityPoolName,'rolePolicyDocumentStatementConditions',role],'a').isVerifyError) {
      // get the role
      AwsRequest.createRequest({
        serviceName: 'iam',
        functionName: 'get-role',
        context: {poolName: identityPoolName, roleName:role},
        returnSchema:'json',
        parameters: {
          'role-name' : {type:'string', value:role},
          'profile': {type: 'string', value:AWSCLIUserProfile}
        }
      },
      function (roleReq) {
        if (roleReq.response.error) {
          console.log("no policy document statemets for role \"" + roleReq.context.roleName + "to update. Is the role created?");
          console.log(roleReq.response.error);
        } else {
          if (!awscommon.verifyPath(roleReq.response.parsedJSON,['Role','AssumeRolePolicyDocument','Statement'],'a').isVerifyError) {
            // for each matching policy action add the conditions
            var statementArray = roleReq.response.parsedJSON.Role.AssumeRolePolicyDocument.Statement;
            var conditionArray = baseDefinitions.cognitoIdentityPoolInfo.identityPools[roleReq.context.poolName].rolePolicyDocumentStatementConditions[role];
            for (var conditionIndex = 0; conditionIndex < conditionArray.length; conditionIndex ++) {
              for (var statementIndex = 0; statementIndex < statementArray.length; statementIndex ++) {
                if (statementArray[statementIndex].Action === conditionArray[conditionIndex].Action) {
                  statementArray[statementIndex]['Condition'] = conditionArray[conditionIndex].Condition;
                  // we may want to replace the identity pool ID in some of the conditions
                  Object.keys(statementArray[statementIndex]['Condition']).forEach(function(conditionType) {
                    var theCondition = statementArray[statementIndex]['Condition'][conditionType];
                    Object.keys(theCondition).forEach(function(conditionTypeParam) {
                      var val = theCondition[conditionTypeParam];
                      if (val === '$identityPoolId') {
                        theCondition[conditionTypeParam] = baseDefinitions.cognitoIdentityPoolInfo.identityPools[roleReq.context.poolName].identityPoolId;
                      }
                    });
                  });
                }
              }
            }
            // UPDATE THE MODIFIED POLICY
            AwsRequest.createRequest({
              serviceName: 'iam',
              functionName: 'update-assume-role-policy',
              context: {poolName: roleReq.context.poolName, roleName:roleReq.context.roleName},
              returnSchema:'none',
              parameters: {
                'role-name': {type:'string', value:roleReq.context.roleName},
                'policy-document': {type: 'JSONObject', value:roleReq.response.parsedJSON.Role.AssumeRolePolicyDocument},
                'profile': {type: 'string', value:AWSCLIUserProfile},
              }
            },
            function (putPolReq) {
              if (putPolReq.response.error) {
                console.log("Error updating policy doc for role \"" + putPolReq.context.roleName + "\"");
                console.log(putPolReq.response.error);
              } else {
                console.log("Updated policy doc for role \"" + putPolReq.context.roleName + "\"");
              }
            }).startRequest();
          }
        }
      }).startRequest();
    }

  });


}
