#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Delete VPCs.\nUsage: $0 [options]')
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

console.log("## Deleting VPCs ##");
if (awsc.verifyPath(baseDefinitions,['vpcInfo', 'vpcs'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}

Object.keys(baseDefinitions.vpcInfo.vpcs).forEach(function (vpcName) {
    var vpcDescription = baseDefinitions.vpcInfo.vpcs[vpcName];
    if (awsc.verifyPath(vpcDescription,["VpcId"],'s').isVerifyError) {
        console.log("VPC '" + vpcName + "' is already deleted. Please use createVPC.js first.");
        return;
    }
    // check to see if the name tag exists
    var nameTag = baseDefinitions.environment.AWSResourceNamePrefix + vpcName + "VPC";
    console.log("Deleting VPC with tag name '" + nameTag + "'");
    deleteVPC(nameTag, vpcName, function (err, tagName, vpcName) {
       if (err) {
           console.log(err);
           return;
       }
       writeOut("Could not update deleted VpcId for VPC '" + vpcName + "'.");
   });

});


function deleteVPC(nameTag, vpcName, callback) {
    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "delete-vpc",
        parameters:{
            "vpc-id": {type: "string", value: baseDefinitions.vpcInfo.vpcs[vpcName].VpcId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'none',
        retryCount: 4,
        retryDelay: 5000
    },
    function (request) {
        if (request.response.error && (request.response.errorId !== "InvalidVpcID.NotFound")) {
            callback(request.response.error, nameTag, vpcName);
            return;
        }

        delete baseDefinitions.vpcInfo.vpcs[vpcName].VpcId;
        delete baseDefinitions.vpcInfo.vpcs[vpcName].RouteTableId;
        delete baseDefinitions.vpcInfo.vpcs[vpcName].NetworkAclId;
        delete baseDefinitions.vpcInfo.vpcs[vpcName].GroupId;
        callback(null, nameTag, vpcName);

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
    });
}
