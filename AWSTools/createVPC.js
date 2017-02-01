#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Creates VPCs. By default VPCs come with a default ACL and Security Group\nUsage: $0 [options]')
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

console.log("## Creating VPCs ##");

if (awsc.verifyPath(baseDefinitions,['vpcInfo', 'vpcs'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}

Object.keys(baseDefinitions.vpcInfo.vpcs).forEach(function (vpcName) {
/*    var vpcDescription = baseDefinitions.vpcInfo.vpcs[vpcName];
    if (!awsc.verifyPath(vpcDescription,["VpcId"],'s').isVerifyError) {
        console.log("VPC '" + vpcName + "' is already defined. Please use deleteVPC.js first.");
        return;
    }*/
    // check to see if the name tag exists
    var nameTag = baseDefinitions.environment.AWSResourceNamePrefix + vpcName + "VPC";
    console.log("Checking for VPC with tag name '" + nameTag + "'");
    awsc.checkEc2ResourceTagName(nameTag, vpcName, AWSCLIUserProfile, function(tagExists, results, tagName, vpcName) {
        if (tagExists) {
            console.log("VPC '" + tagName + "' exists. updating local definitions with existing ID.");
            // update VPC info with existing tag IDs
            baseDefinitions.vpcInfo.vpcs[vpcName].VpcId = results[0].ResourceId;
           // write out result
           writeOut("Could not update VpcId for VPC '" + vpcName + "'.");
           fetchSecurityGroupId(nameTag, vpcName);
           fetchNetworkAclId(nameTag, vpcName);
           fetchRouteTableId(nameTag, vpcName);
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
            callback(request.response.error, nameTag, vpcName);
            return;
        }

        baseDefinitions.vpcInfo.vpcs[vpcName].VpcId = request.response.parsedJSON.Vpc.VpcId;
        awsc.createEc2ResourceTag(baseDefinitions.vpcInfo.vpcs[vpcName].VpcId, nameTag, AWSCLIUserProfile, function (err) {
            callback(err, nameTag, vpcName);
        });
        // get the Ids of automatically created resources.
        fetchSecurityGroupId(nameTag, vpcName);
        fetchNetworkAclId(nameTag, vpcName);
        fetchRouteTableId(nameTag, vpcName);
    }).startRequest();
}

function fetchSecurityGroupId(nameTag, vpcName) {
    awsc.describeEc2ResourceForService("describe-security-groups",
                                        "SecurityGroups",
                                        "vpc-id",
                                        baseDefinitions.vpcInfo.vpcs[vpcName].VpcId,
                                        AWSCLIUserProfile,
                                        true,
                                        function (err, resourceResult) {
                                            if (err) {
                                                throw err;
                                            }
                                            baseDefinitions.vpcInfo.vpcs[vpcName].GroupId = resourceResult[0].GroupId;
                                            writeOut("Could not update GroupId for VPC '" + vpcName + "'.");
                                        });
 }

function fetchRouteTableId(nameTag, vpcName) {
    awsc.describeEc2ResourceForService("describe-route-tables",
                                        "RouteTables",
                                        "vpc-id",
                                        baseDefinitions.vpcInfo.vpcs[vpcName].VpcId,
                                        AWSCLIUserProfile,
                                        true,
                                        function (err, resourceResult) {
                                            if (err) {
                                                throw err;
                                            }
                                            baseDefinitions.vpcInfo.vpcs[vpcName].RouteTableId = resourceResult[0].RouteTableId;
                                            writeOut("Could not update RouteTableId for VPC '" + vpcName + "'.");
                                        });
}

function fetchNetworkAclId(nameTag, vpcName) {
    awsc.describeEc2ResourceForService("describe-network-acls",
                                        "NetworkAcls",
                                        "vpc-id",
                                        baseDefinitions.vpcInfo.vpcs[vpcName].VpcId,
                                        AWSCLIUserProfile,
                                        true,
                                        function (err, resourceResult) {
                                            if (err) {
                                                throw err;
                                            }
                                            baseDefinitions.vpcInfo.vpcs[vpcName].NetworkAclId = resourceResult[0].NetworkAclId;
                                            writeOut("Could not update NetworkAclId for VPC '" + vpcName + "'.");
                                        });
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
