#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Creates Subnets to use with VPCs.\nUsage: $0 [options]')
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

console.log("## Creating Subnets ##");

if (awsc.verifyPath(baseDefinitions,['subnetInfo', 'subnets'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}

Object.keys(baseDefinitions.subnetInfo.subnets).forEach(function (subnetName) {
/*    var subnetDescription = baseDefinitions.subnetInfo.subnets[subnetName];
    if (!awsc.verifyPath(subnetDescription,["SubnetId"],'s').isVerifyError) {
        console.log("Subnet '" + subnetName + "' is already defined. Please use deleteSubnet.js first.");
        return;
    }*/
    // check to see if the name tag exists
    var nameTag = baseDefinitions.environment.AWSResourceNamePrefix + subnetName + "Subnet";
    console.log("Checking for Subnet with tag name '" + nameTag + "'");
    awsc.checkEc2ResourceTagName(nameTag, subnetName, AWSCLIUserProfile, function(tagExists, results, tagName, subnetName) {
        if (tagExists) {
            console.log("Subnet '" + tagName + "' exists. updating local definitions with existing ID.");
            // update Subnet info with existing tag IDs
            baseDefinitions.subnetInfo.subnets[subnetName].SubnetId = results[0].ResourceId;
           // write out result
           writeOut("Could not update SubnetId for Subnet '" + subnetName + "'.");
       } else {
           console.log("Creating new Subnet with tag name '" + tagName + "'");
           createSubnet(tagName, subnetName, function (err, tagName, subnetName) {
               if (err) {
                   console.log(err);
                   return;
               }
               writeOut("Could not update SubnetId for Subnet '" + subnetName + "'.");
           });
       }
    });
});

function createSubnet(nameTag, subnetName, callback) {

    var pathError = awsc.verifyPath(baseDefinitions,["vpcInfo", "vpcs", baseDefinitions.subnetInfo.subnets[subnetName].vpc, "VpcId"], "s", "definitions file \"" + argv.baseDefinitionsFile + "\"");
    if (pathError.isVerifyError) {
        console.log(pathError);
        throw new Error("Please create the VPC first using 'createVPC.js'");
    }

    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "create-subnet",
        parameters:{
            "cidr-block": {type: "string", value: baseDefinitions.subnetInfo.subnets[subnetName]["cidr-block"]},
            "vpc-id": {type: "string", value: baseDefinitions.vpcInfo.vpcs[baseDefinitions.subnetInfo.subnets[subnetName].vpc].VpcId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json',
        returnValidation:[{path:['Subnet', 'SubnetId'], type:'s'}]
    },
    function (request) {
        if (request.response.error) {
            callback(request.response.error, nameTag, subnetName);
            return;
        }

        baseDefinitions.subnetInfo.subnets[subnetName].SubnetId = request.response.parsedJSON.Subnet.SubnetId;
        awsc.createEc2ResourceTag(baseDefinitions.subnetInfo.subnets[subnetName].SubnetId, nameTag, AWSCLIUserProfile, function (err) {
            callback(err, nameTag, subnetName);
        });
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
