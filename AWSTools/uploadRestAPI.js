#!/usr/bin/env node

const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AwsRequest = require(path.join(__dirname, 'AwsRequest'));
const fs = require('fs');
const YAML = require('yamljs');

var argv = require('yargs')
.usage('Upldate project API.\n"createAPI" should have been previously called.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('a','apiDefinitionFile')
.describe('a','yaml swagger API file to upload to AWS')
.default('a','./swaggerAPI.yaml')
.help('h')
.alias('h', 'help')
.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
  console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.")
  process.exit(1);
}

if (!fs.existsSync(argv.apiDefinitionFile)) {
  throw new Error("API definition file \"" + argv.apiDefinitionFile + "\" not found.")
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);
if (typeof baseDefinitions.apiInfo != 'object') {
  throw new Error("Missing apiInfo in base definitions file");
}

awsc.verifyPath(baseDefinitions,['apiInfo','awsId'],'s', "base definitions file \"" + argv.baseDefinitionsFile + "\"").exitOnError();
awsc.verifyPath(baseDefinitions,['apiInfo','region'],'s', "base definitions file \"" + argv.baseDefinitionsFile + "\"").exitOnError();

var AWSCLIUserProfile = "default";
if (!awsc.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
  AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
} else {
  console.log("using \"default\" AWSCLIUserProfile");
}

console.log("Uploading API to AWS")

AwsRequest.createRequest({
  serviceName: 'apigateway',
  functionName: 'put-rest-api',
  parameters: {
    'rest-api-id' : {type:'string', value:baseDefinitions.apiInfo.awsId},
    body: {type:'fileName', value:argv.apiDefinitionFile},
    region: {type:'string', value:baseDefinitions.apiInfo.region},
    'fail-on-warnings': {type:'none'},
    mode: {type:'string', value:'overwrite'},
    profile: {type:'string', value:AWSCLIUserProfile},
  },
  returnSchema: 'none'
}, function (request) {
  if (request.response.error) {
    throw request.response.error;
  }
  console.log(request.response.stdout);
  console.log("Done.")
}).startRequest()
