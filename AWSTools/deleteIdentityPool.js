#!/usr/bin/env node

var path = require('path');
const awscommon = require(path.join(__dirname, 'awscommonutils'));
const AwsRequest = require(path.join(__dirname, 'AwsRequest'))
var fs = require('fs');
var YAML = require('yamljs');
const exec = require('child_process').exec;

var YAML = require('yamljs');
var argv = require('yargs')
.usage('Delete project identity pools.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that containes information about your API')
.default('s','./base.definitions.yaml')
.help('h')
.alias('h', 'help')
.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
  console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.")
  process.exit(1);
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

var AWSCLIUserProfile = "default";
if (!awscommon.verifyPath(baseDefinitions,['enviroment', 'AWSCLIUserProfile'],'s').isVerifyError) {
  AWSCLIUserProfile = baseDefinitions.enviroment.AWSCLIUserProfile;
} else {
  console.log("using \"default\" AWSCLIUserProfile");
}

awscommon.verifyPath(baseDefinitions, ['cognitoIdentityPoolInfo'], 'o', "definitions file \""+argv.baseDefinitionsFile+"\"").exitOnError();

var deleteRequests = [];
var roleNames = Object.keys(baseDefinitions.cognitoIdentityPoolInfo).forEach(function (identityPoolName) {
  var poolDef = baseDefinitions.cognitoIdentityPoolInfo[identityPoolName];
  var verifyError = awscommon.verifyPath(poolDef, ['identityPoolId'], 's', "definitions file \""+argv.baseDefinitionsFile+"\"").callbackOnError(function(verifyError) {
    console.log(verifyError.toString());
    console.log("Skipping delete request for \"" + identityPoolName + "\".")
  });

  if (!verifyError.isVerifyError) {
    var request = AwsRequest.createRequest({
      serviceName:'cognito-identity',
      functionName:'delete-identity-pool',
      returnSchema:'none',
      context:{poolName: identityPoolName},
      parameters:{
        'identity-pool-id': {type: 'string', value:poolDef.identityPoolId},
        'profile': {type: 'string', value:AWSCLIUserProfile}
      }
    });
    deleteRequests.push(request);
  }
});

if (deleteRequests.length>0) {
  AwsRequest.createBatch(deleteRequests, requestsDoneFunction).startRequest();
} else {
  console.log("Nothing to do.");
}

function requestsDoneFunction(requestBatch){
  var successCount = 0;
  requestBatch.requestArray.forEach(function(request) {
    if (request.response.error) {
      console.log(request.response.error);
    } else {
      delete baseDefinitions.cognitoIdentityPoolInfo[request.context.poolName].identityPoolId;
      successCount++;
    }
  });

  if (successCount == requestBatch.requestArray.length) {
    console.log("Success")
  } else {
    throw new Error("Failed " + (requestBatch.requestArray.length - successCount) + " of " + requestBatch.requestArray.length + " requests.");
  }
  // write out the result file
  awscommon.updateFile(argv.baseDefinitionsFile, function () {
    return YAML.stringify(baseDefinitions, 6);
  }, function (backupErr, writeErr) {
    if (backupErr) {
      console.log("Could not create backup of \"" + argv.baseDefinitionsFile + "\". pool id was not updated.");
      throw backupErr;
    }
    if (writeErr) {
      console.log("Unable to write updated definitions file.");
      throw writeErr;
    }
    console.log("Done.")
  });
}
