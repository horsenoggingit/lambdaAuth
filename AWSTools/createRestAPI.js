#!/usr/bin/env node

const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AwsRequest = require(path.join(__dirname, 'AwsRequest'));
const fs = require('fs');
const YAML = require('yamljs');

const yargs = require('yargs')
.usage('Create a new API\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('a','apiDefinitionFile')
.describe('a','yaml swagger API file to upload to AWS')
.default('a','./swaggerAPI.yaml')
.alias('u','updateAWSId')
.describe('u', 'ignore existing \"awsId\" in \"apiInfo\" section of base definitions file and overwrite new value on success')
.help('h')
.alias('h', 'help');
const argv = yargs.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
    console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
    yargs.showHelp("log");
    process.exit(1);
}
var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

if (!fs.existsSync(argv.apiDefinitionFile)) {
    console.log("API definition file \"" + argv.apiDefinitionFile + "\" not found.");
    yargs.showHelp("log");
    process.exit(1);
}

if (typeof baseDefinitions.apiInfo.region !== 'string') {
    console.log("Missing \"region\" in \"apiInfo\" section of base definitions file \"" + argv.baseDefinitionsFile + "\" - has this API been created? (use createRestAPI.js)");
    process.exit(1);
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);
if (typeof baseDefinitions.apiInfo === 'object') {
    if (typeof baseDefinitions.apiInfo.awsId === 'string' && !argv.updateAWSId) {
        console.log("Error: There is already an \"awsId\" in \"apiInfo\" section of base definitions file \"" + argv.baseDefinitionsFile + "\". Use \"--updateAWSId\" to force update.");
        process.exit(1);
    }
}

var AWSCLIUserProfile = "default";
if (!awsc.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
    AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
} else {
    console.log("using \"default\" AWSCLIUserProfile");
}

console.log("Uploading API to AWS");

AwsRequest.createRequest({
    serviceName: 'apigateway',
    functionName: 'import-rest-api',
    parameters: {
        body: {type:'fileName', value:argv.apiDefinitionFile},
        region: {type:'string', value:baseDefinitions.apiInfo.region},
        profile: {type:'string', value:AWSCLIUserProfile},
        'fail-on-warnings': {type:'none'}
    },
    returnSchema: 'json',
    returnValidation:[{path:['id'], type:'s'}],
}, function (request) {
    if (request.response.error) {
        throw request.response.error;
    }
    awsc.updateFile(argv.baseDefinitionsFile, function () {
        baseDefinitions.apiInfo.awsId = request.response.parsedJSON.id;
        return YAML.stringify(baseDefinitions, 15);
    }, function (backupErr, writeErr) {
        if (backupErr) {
            console.log("Could not create backup of \"" + argv.baseDefinitionsFile + "\". API Id was not updated.");
            throw backupErr;
        }
        if (writeErr) {
            console.log("Unable to write updated definitions file.");
            throw writeErr;
        }
        console.log("Done.");
    });
}).startRequest();
