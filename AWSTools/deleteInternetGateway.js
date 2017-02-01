#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Delete Internet Gateways and assignes them to a VPC.\nUsage: $0 [options]')
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

console.log("## Deleting Internet Gateways ##");

if (awsc.verifyPath(baseDefinitions,['internetGatewayInfo', 'internetGateways'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}

Object.keys(baseDefinitions.internetGatewayInfo.internetGateways).forEach(function (internetGatewayName) {
 /*   var networkAclDescription = baseDefinitions.networkAclInfo.networkAcls[networkAclName];
    if (!awsc.verifyPath(networkAclDescription,["networkAclId"],'s').isVerifyError) {
        console.log("Network ACL '" + networkAclName + "' is already defined. Please use deleteNetworkAcl.js first.");
        return;
    }*/
    // check to see if the name tag exists
    var nameTag = baseDefinitions.environment.AWSResourceNamePrefix + internetGatewayName + "InternetGateway";
    console.log("Checking for Intenet Gateway with tag name '" + nameTag + "'");
    awsc.checkEc2ResourceTagName(nameTag, internetGatewayName, AWSCLIUserProfile, function(tagExists, results, tagName, internetGatewayName) {
        if (tagExists) {
            console.log("Intenet Gateway '" + tagName + "' exists. updating local definitions with existing ID.");
            // update Network ACL info with existing tag IDs
            if (!baseDefinitions.internetGatewayInfo.internetGateways[internetGatewayName].InternetGateway) {
                baseDefinitions.internetGatewayInfo.internetGateways[internetGatewayName].InternetGateway = {};
            }
            baseDefinitions.internetGatewayInfo.internetGateways[internetGatewayName].InternetGateway.InternetGatewayId = results[0].ResourceId;
            // write out result
            detachInternetGateway(internetGatewayName, function (err, internetGatewayName) {
               if (err) {
                   throw err;
               }
               deleteInternetGateway(internetGatewayName, function (internetGatewayName) {
                   commitUpdates(internetGatewayName);
               });
           });
       } else {
           console.log("Internet Gateway with tag name '" + tagName + "' does not exist.");
       }
    });
});

function commitUpdates(internetGatewayName) {
    writeOut("Could not update InternetGatewayId for Internet Gateway '" + internetGatewayName + "'.");
}

function deleteInternetGateway(internetGatewayName, callback) {

    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "delete-internet-gateway",
        parameters:{
            "internet-gateway-id" : {type: "string", value: baseDefinitions.internetGatewayInfo.internetGateways[internetGatewayName].InternetGateway.InternetGatewayId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'none',
    },
    function (request) {
        if (request.response.error) {
            throw request.response.error;
        }
        delete baseDefinitions.internetGatewayInfo.internetGateways[internetGatewayName].InternetGateway;
        console.log("Deleted Internet Gateway '" + internetGatewayName + "'");
        callback(internetGatewayName);
    }).startRequest();
}

function detachInternetGateway(internetGatewayName, callback) {
    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "describe-internet-gateways",
        parameters:{
            "internet-gateway-ids": {type: "string", value: baseDefinitions.internetGatewayInfo.internetGateways[internetGatewayName].InternetGateway.InternetGatewayId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json',
    },
    function (request) {
        if (request.response.error) {
            callback(request.response.error, internetGatewayName);
            return;
        }
        if (request.response.parsedJSON.InternetGateways.length === 0) {
            callback(new Error("Internet gateway '" + internetGatewayName + "' does not exist."));
            return;
        }
        var vpcId = baseDefinitions.vpcInfo.vpcs[baseDefinitions.internetGatewayInfo.internetGateways[internetGatewayName].vpc].VpcId;

        AWSRequest.createRequest({
            serviceName: "ec2",
            functionName: "detach-internet-gateway",
            parameters:{
                "vpc-id": {type: "string", value: vpcId},
                "internet-gateway-id": {type: "string", value: baseDefinitions.internetGatewayInfo.internetGateways[internetGatewayName].InternetGateway.InternetGatewayId},
                "profile": {type: "string", value: AWSCLIUserProfile}
            },
            returnSchema:'none',
        },
        function (request) {
            if (request.response.error && (request.response.errorId !== "Gateway.NotAttached")) {
                callback(request.response.error, internetGatewayName);
                return;
            }
            console.log("Detached VPC '" + baseDefinitions.internetGatewayInfo.internetGateways[internetGatewayName].vpc + "' from Internet Gateway '" + internetGatewayName + "'");
            callback(null, internetGatewayName);
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
    });
}
