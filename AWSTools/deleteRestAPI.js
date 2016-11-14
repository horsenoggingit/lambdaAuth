#!/usr/bin/env node

const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AwsRequest = require(path.join(__dirname, 'AwsRequest'));
const fs = require('fs');

var YAML = require('yamljs');
var yargs = require('yargs')
.usage('Delete project API definitions.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that containes information about your API')
.default('s','./base.definitions.yaml')
.help('h')
.alias('h', 'help')
var argv = yargs.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
  console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.")
  yargs.showHelp("log");
  process.exit(1);
}
var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);
if (typeof baseDefinitions.apiInfo == 'object') {
  if (typeof baseDefinitions.apiInfo.awsId != 'string') {
    console.log("\"awsId\" in \"apiInfo\" section of base definitions file \"" + argv.baseDefinitionsFile + "\" was not found. Was the API already deleted?");
    process.exit(1);
  }
}

var AWSCLIUserProfile = "default"
if (typeof baseDefinitions.enviroment != 'object') {
} else {
  if (typeof baseDefinitions.enviroment.AWSCLIUserProfile == 'string') {
    AWSCLIUserProfile = baseDefinitions.enviroment.AWSCLIUserProfile;
  }
}

if (AWSCLIUserProfile === "default") {
  console.log("using \"default\" AWSCLIUserProfile");
}

awsc.verifyPath(baseDefinitions, ['apiInfo', 'awsId'],'s', "base definitions file \"" + argv.baseDefinitionsFile + "\"").exitOnError();

console.log("Deleting API")
AwsRequest.createRequest({
  serviceName: 'apigateway',
  functionName: 'delete-rest-api',
  parameters: {
    'rest-api-id': {type:'string', value:baseDefinitions.apiInfo.awsId},
    profile: {type:'string', value:AWSCLIUserProfile},
  },
  returnSchema: 'none',
}, function (request) {
  if (request.response.error) {
    throw request.response.error;
  }
  console.log("Updating defaults file: \"" + argv.baseDefinitionsFile + "\"");
  awsc.updateFile(argv.baseDefinitionsFile, function () {
    delete baseDefinitions.apiInfo["awsId"];
    delete baseDefinitions.apiInfo["lastDeploy"];
    return YAML.stringify(baseDefinitions, 6);
  }, function (backupErr, writeErr) {
    if (backupErr) {
      console.log("Could not create backup of \"" + argv.baseDefinitionsFile + "\". API Id was not updated.");
      throw backupErr;
    }
    if (writeErr) {
      console.log("Unable to write updated definitions file.");
      throw writeErr;
    }
    console.log("Done.")
  })
}).startRequest()
