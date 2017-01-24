#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Creates security groups.\nUsage: $0 [options]')
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

console.log("Creating Security Groups");

if (awsc.verifyPath(baseDefinitions,['securityGroupInfo', 'securityGroups'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}

Object.keys(baseDefinitions.securityGroupInfo.securityGroups).forEach(function (groupName) {
    if (!awsc.verifyPath(baseDefinitions,["securityGroupInfo", "securityGroups", groupName, "GroupId"],'s').isVerifyError) {
        console.log("Security group '" + groupName + "' is already defined. Please use deleteSecurityGroup.js first.");
        return;
    }
    // check to see if the name tag exists
    var nameTag = baseDefinitions.environment.AWSResourceNamePrefix + groupName + "Group";
    console.log("Checking for Security Group with tag name '" + nameTag + "'");
    checkTagName(nameTag, groupName, function(tagExists, results, tagName, groupName) {
        if (tagExists) {
            console.log("Security group '" + tagName + "' exists. updating local definitions with existing ID.");
            // update security group info with existing tag IDs
            baseDefinitions.securityGroupInfo.securityGroups[groupName].GroupId = results[0].ResourceId;
           // write out result
           writeOut("Could not update GroupId for Security Group '" + groupName + "'.");
       } else {
           console.log("Creating new security group with tag name '" + tagName + "'");
           createSecurityGroup(tagName, groupName, function (err, tagName, groupName) {
               if (err) {
                   console.log(err);
                   return;
               }
               writeOut("Could not update GroupId for Security Group '" + groupName + "'.");
           });
       }
    });
});

function checkTagName(nameTag, groupName, callback) {
    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "describe-tags",
        parameters:{
            "filters": {type: "string", value: "Name=value,Values=" + nameTag},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json',
    },
    function (request) {
        if (request.response.error) {
            callback(false, null, nameTag, groupName);
            return;
        }
        if (!request.response.parsedJSON.Tags || (request.response.parsedJSON.Tags.length === 0)) {
            callback(false, null, nameTag, groupName);
            return;
        }
        callback(true, request.response.parsedJSON.Tags, nameTag, groupName);
    }).startRequest();
}

function createSecurityGroup(nameTag, groupName, callback) {

    var pathError = awsc.verifyPath(baseDefinitions,["vpcInfo", "vpcs", baseDefinitions.securityGroupInfo.securityGroups[groupName].vpc, "VpcId"], "s", "definitions file \"" + argv.baseDefinitionsFile + "\"");
    if (pathError.isVerifyError) {
        console.log(pathError);
        throw new Error("Please create the VPC first using 'createVPC.js'");
    }

    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "create-security-group",
        parameters:{
            "group-name": {type: "string", value: nameTag},
            "description": {type: "string", value: groupName},
            "vpc-id": {type: "string", value: baseDefinitions.vpcInfo.vpcs[baseDefinitions.securityGroupInfo.securityGroups[groupName].vpc].VpcId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json',
        returnValidation:[{path:['GroupId'], type:'s'}]
    },
    function (request) {
        if (request.response.error) {
            callback(request.response.error, nameTag, groupName);
            return;
        }

        baseDefinitions.securityGroupInfo.securityGroups[groupName].GroupId = request.response.parsedJSON.GroupId;

        AWSRequest.createRequest({
            serviceName: "ec2",
            functionName: "create-tags",
            parameters:{
                "resource": {type: "string", value: baseDefinitions.securityGroupInfo.securityGroups[groupName].GroupId},
                "tags": {type: "string", value: "Key=Name,Value=" + nameTag},
                "profile": {type: "string", value: AWSCLIUserProfile}
            },
            returnSchema:'none',
        },
        function (request) {
            if (request.response.error) {
                callback(request.response.error, nameTag, groupName);
                return;
            }
            callback(null, nameTag, groupName);
        }).startRequest();

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
