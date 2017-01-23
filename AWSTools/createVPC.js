#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Creates security groups and VPCs.\nUsage: $0 [options]')
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

var AWSCLIUserProfile = "default";
if (!awsc.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
    AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
} else {
    console.log("using \"default\" AWSCLIUserProfile");
}

console.log("Creating VPCs");

if (awsc.verifyPath(baseDefinitions,['vpcInfo', 'vpcs'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}

Object.keys(baseDefinitions.vpcInfo.vpcs).forEach(function (vpcName) {
    var vpcDescription = baseDefinitions.vpcInfo.vpcs[vpcName];
    if (!awsc.verifyPath(vpcDescription,["VpcId"],'s').isVerifyError) {
        console.log("VPC '" + vpcName + "' is already defined. Please use deleteVPC.js first.");
        return;
    }
    // check to see if the name tag exists
    var nameTag = baseDefinitions.environment.AWSResourceNamePrefix + vpcName + "VPC";
    console.log("Checking for VPC with tag name '" + nameTag + "'");
    checkTagName(nameTag, vpcName, function(tagExists, results, tagName, vpcName) {
        if (tagExists) {
            console.log("VPC '" + tagName + "' exists. updating local definitions with existing ID.");
            // update VPC info with existing tag IDs
            baseDefinitions.vpcInfo.vpcs[vpcName].VpcId = results[0].ResourceId;
           // write out result
           writeOut("Could not update VpcId for VPC '" + vpcName + "'.");
       } else {
           console.log("Creating new VPC with tag name '" + tagName + "'");
           createVPC(tagName, vpcName, function (err, tagName, vpcName) {
               if (err) {
                   console.log(err);
                   return;
               }
               writeOut("Could not update VpcId for VPC '" + vpcName + "'.");
           });
       }
    });
});

function checkTagName(nameTag, vpcName, callback) {
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
            console.log(console.error());
            callback(false, null, nameTag, vpcName);
            return;
        }
        if (!request.response.parsedJSON.Tags || (request.response.parsedJSON.Tags.length === 0)) {
            callback(false, null, nameTag, vpcName);
            return;
        }
        callback(true, request.response.parsedJSON.Tags, nameTag, vpcName);
    }).startRequest();
}

function createVPC(nameTag, vpcName, callback) {
    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "create-vpc",
        parameters:{
            "cidr-block": {type: "string", value: baseDefinitions.vpcInfo.vpcs[vpcName]["cidr-block"]},
            "instance-tenancy": {type: "string", value: baseDefinitions.vpcInfo.vpcs[vpcName]["instance-tenancy"]},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json',
        returnValidation:[{path:['Vpc', 'VpcId'], type:'s'}]
    },
    function (request) {
        if (request.response.error) {
            console.log(console.error());
            callback(request.response.error, nameTag, vpcName);
            return;
        }

        baseDefinitions.vpcInfo.vpcs[vpcName].VpcId = request.response.parsedJSON.Vpc.VpcId;

        AWSRequest.createRequest({
            serviceName: "ec2",
            functionName: "create-tags",
            parameters:{
                "resource": {type: "string", value: baseDefinitions.vpcInfo.vpcs[vpcName].VpcId},
                "tags": {type: "string", value: "Key=Name,Value=" + nameTag},
                "profile": {type: "string", value: AWSCLIUserProfile}
            },
            returnSchema:'none',
        },
        function (request) {
            if (request.response.error) {
                console.log(console.error());
                callback(request.response.error, nameTag, vpcName);
                return;
            }
            callback(null, nameTag, vpcName);
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
