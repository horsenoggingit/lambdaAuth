#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Delete security groups.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.help('h')
.alias('h', 'help');
var argv = yargs.argv;


if (!fs.existsSync(argv.baseDefinitionsFile)) {
    console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
    yargs.showHelp("log");
    process.exit(1);
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

awsc.isValidAWSResourceNamePrefix(baseDefinitions, argv.baseDefinitionsFile);

var AWSCLIUserProfile = "default";
if (!awsc.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
    AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
} else {
    console.log("using \"default\" AWSCLIUserProfile");
}

console.log("Deleting Security Groups");
if (awsc.verifyPath(baseDefinitions,['securityGroupInfo', 'securityGroups'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}

Object.keys(baseDefinitions.securityGroupInfo.securityGroups).forEach(function (groupName) {
    var groupDescription = baseDefinitions.securityGroupInfo.securityGroups[groupName];
    if (awsc.verifyPath(groupDescription,["GroupId"],'s').isVerifyError) {
        console.log("Security group '" + groupName + "' is already deleted. Please use createSecurityGroup.js first.");
        return;
    }
    // check to see if the name tag exists
    var nameTag = baseDefinitions.environment.AWSResourceNamePrefix + groupName + "Group";
    console.log("Deleting security group with tag name '" + nameTag + "'");
    deleteSecurityGroup(nameTag, groupName, function (err, tagName, groupName) {
       if (err) {
           console.log(err);
           return;
       }
       writeOut("Could not update deleted GroupId for security group '" + groupName + "'.");
   });

});


function deleteSecurityGroup(nameTag, groupName, callback) {
    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "delete-security-group",
        parameters:{
            "group-id": {type: "string", value: baseDefinitions.securityGroupInfo.securityGroups[groupName].GroupId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'none',
    },
    function (request) {
        if (request.response.error && (request.response.errorId !== "InvalidGroup.NotFound")) {
            callback(request.response.error, nameTag, groupName);
            return;
        }

        delete baseDefinitions.securityGroupInfo.securityGroups[groupName].GroupId;
        callback(null, nameTag, groupName);

    }).startRequest();
}


function writeOut(errorText) {
    // now delete role
    awsc.updateFile(argv.baseDefinitionsFile, function () {
        return YAML.stringify(baseDefinitions, 15);
    }, function (backupErr, writeErr) {
        if (backupErr) {
            console.log("Could not create backup of \"" + argv.baseDefinitionsFile + "\". " + errorText);
            throw backupErr;
        }
        if (writeErr) {
            console.log("Unable to write updated definitions file. " + errorText);
            throw writeErr;
        }
        console.log("Done.");
    });
}
