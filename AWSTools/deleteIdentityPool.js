#!/usr/bin/env node

const path = require('path');
const awscommon = require(path.join(__dirname, 'awscommonutils'));
const AwsRequest = require(path.join(__dirname, 'AwsRequest'));
const fs = require('fs');
const YAML = require('yamljs');

var argv = require('yargs')
.usage('Delete project identity pools.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.help('h')
.alias('h', 'help')
.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
    console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
    process.exit(1);
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

var AWSCLIUserProfile = "default";
if (!awscommon.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
    AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
} else {
    console.log("using \"default\" AWSCLIUserProfile");
}

console.log("## Deleting Identity Pools ##");

awscommon.verifyPath(baseDefinitions, ['cognitoIdentityPoolInfo', 'identityPools'], 'o', "definitions file \""+argv.baseDefinitionsFile+"\"").exitOnError();

var deleteRequests = [];
Object.keys(baseDefinitions.cognitoIdentityPoolInfo.identityPools).forEach(function (identityPoolKey) {
    var poolDef = baseDefinitions.cognitoIdentityPoolInfo.identityPools[identityPoolKey];
    var verifyError = awscommon.verifyPath(poolDef, ['identityPoolId'], 's', "definitions file \""+argv.baseDefinitionsFile+"\"").callbackOnError(function(verifyError) {
        console.log(verifyError.toString());
        console.log("Skipping delete request for \"" + identityPoolKey + "\".");
    });

    if (!verifyError.isVerifyError) {
        var request = AwsRequest.createRequest({
            serviceName:'cognito-identity',
            functionName:'delete-identity-pool',
            returnSchema:'none',
            context:{poolKey: identityPoolKey},
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
            delete baseDefinitions.cognitoIdentityPoolInfo.identityPools[request.context.poolKey].identityPoolId;
            successCount++;
        }
    });

    if (successCount === requestBatch.requestArray.length) {
        console.log("All Identity pools were deleted.");
    } else {
        throw new Error("Failed " + (requestBatch.requestArray.length - successCount) + " of " + requestBatch.requestArray.length + " requests.");
    }
    // write out the result file
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
    });
}
