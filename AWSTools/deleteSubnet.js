#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Delete Subnets.\nUsage: $0 [options]')
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

console.log("Deleting Subnets");
if (awsc.verifyPath(baseDefinitions,['subnetInfo', 'subnets'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}

Object.keys(baseDefinitions.subnetInfo.subnets).forEach(function (subnetName) {
    var subnetDescription = baseDefinitions.subnetInfo.subnets[subnetName];
    if (awsc.verifyPath(subnetDescription,["SubnetId"],'s').isVerifyError) {
        console.log("Subnet '" + subnetName + "' is already deleted. Please use createSubnet.js first.");
        return;
    }
    // check to see if the name tag exists
    var nameTag = baseDefinitions.environment.AWSResourceNamePrefix + subnetName + "Subnet";
    console.log("Deleting Subnet with tag name '" + nameTag + "'");
    deleteSubnet(nameTag, subnetName, function (err, tagName, subnetName) {
       if (err) {
           console.log(err);
           return;
       }
       writeOut("Could not update deleted SubnetId for Subnet '" + subnetName + "'.");
   });

});


function deleteSubnet(nameTag, subnetName, callback) {
    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "delete-subnet",
        parameters:{
            "subnet-id": {type: "string", value: baseDefinitions.subnetInfo.subnets[subnetName].SubnetId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'none',
    },
    function (request) {
        if (request.response.error && (request.response.errorId !== "InvalidSubnetID.NotFound")) {
            console.log(console.error());
            callback(request.response.error, nameTag, subnetName);
            return;
        }

        delete baseDefinitions.subnetInfo.subnets[subnetName].SubnetId;
        callback(null, nameTag, subnetName);

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
