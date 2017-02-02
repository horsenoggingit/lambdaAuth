#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Creates NAT Gateways and assignes them to a VPC.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.help('h')
.alias('h', 'help');
var argv = yargs.argv;

// once the gateway is deleted, delete the NatGatewayAddresses and remove any routs pointing to it.

var retryCounters = {};

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

console.log("## Deleting NAT Gateways ##");

if (awsc.verifyPath(baseDefinitions,['natGatewayInfo', 'natGateways'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}

Object.keys(baseDefinitions.natGatewayInfo.natGateways).forEach(function (natGatewayName) {
    var natGatewayDescription = baseDefinitions.natGatewayInfo.natGateways[natGatewayName];
    if (awsc.verifyPath(natGatewayDescription, ["NatGateway", "NatGatewayId"], 's').isVerifyError) {
        console.log("NAT Gateway '" + natGatewayName + "' is already deleted.");
        return;
    }

    console.log("Deleting NAT Gateway " + natGatewayName);
    deleteTrafficSourceRoutes(natGatewayName, function (natGatewayName) {
        deleteNatGateway(natGatewayName, function (err, natGatewayName) {
            if (err) {
                console.log(err);
                return;
            }
            waitForNatGatewayDeleted(natGatewayName, function (natGatewayName) {
                deleteElasticIp(natGatewayName, function (err, natGatewayName) {
                    if (err) {
                        throw err;
                    }
                    delete baseDefinitions.natGatewayInfo.natGateways[natGatewayName].NatGateway;
                    commitUpdates(natGatewayName);
                    console.log("Deleted NAT Gateway " + natGatewayName);
                });
            });
        });
    });
});

function commitUpdates(natGatewayName) {
    writeOut("Could not update natGatewayId for NAT Gateway '" + natGatewayName + "'.");
}


function waitForNatGatewayDeleted(natGatewayName, callback) {
    if (!retryCounters[natGatewayName]) {
        retryCounters[natGatewayName] = 1;
    }
    var maxRetry = 30;
    var status = baseDefinitions.natGatewayInfo.natGateways[natGatewayName].NatGateway.State;
    console.log("Waiting for NAT Gateway '" + natGatewayName + "' deleted. Current status: '" + status + "'. Retry " + retryCounters[natGatewayName] + " of " + maxRetry);
    if (status === 'deleted') {
        callback(natGatewayName);
        return;
    }
    setTimeout(function () {
        AWSRequest.createRequest({
            serviceName: "ec2",
            functionName: "describe-nat-gateways",
            parameters:{
                "nat-gateway-ids": {type: "string", value: baseDefinitions.natGatewayInfo.natGateways[natGatewayName].NatGateway.NatGatewayId},
                "profile": {type: "string", value: AWSCLIUserProfile}
            },
            returnSchema:'json',
            returnValidation:[{path:['NatGateways'], type:'a'}]
        },
        function (request) {
            if (request.response.error) {
                console.log("Issue retrieving nat gateway description from AWS");
                throw request.response.error;
            }
            if (request.response.parsedJSON.NatGateways[0].State === "deleted") {
                baseDefinitions.natGatewayInfo.natGateways[natGatewayName].NatGateway = request.response.parsedJSON.NatGateways[0];
                callback(natGatewayName);
            } else {
                if (retryCounters[natGatewayName] > maxRetry) {
                    throw new Error("Waiting for 'deleted' status of NAT Gateway '" + natGatewayName + "' timed out.");
                }
                baseDefinitions.natGatewayInfo.natGateways[natGatewayName].NatGateway = request.response.parsedJSON.NatGateways[0];
                retryCounters[natGatewayName] = retryCounters[natGatewayName] + 1;
                waitForNatGatewayDeleted(natGatewayName, callback);
           }
        }).startRequest();
    }, 10000);
}

function deleteElasticIp(natGatewayName, callback) {

    if (awsc.verifyPath(baseDefinitions, ["natGatewayInfo", "natGateways", natGatewayName, "NatGateway", "NatGatewayAddresses"], 'a').isVerifyError) {
        console.log("No Elastic IPs to release for NAT Gateway " + natGatewayName);
        callback(null, natGatewayName); // nothing to do
        return;
    }
    var releaseAddressRequests = [];
    var addresses = baseDefinitions.natGatewayInfo.natGateways[natGatewayName].NatGateway.NatGatewayAddresses;
    addresses.forEach(function (address){
        releaseAddressRequests.push(AWSRequest.createRequest({
            serviceName: "ec2",
            functionName: "release-address",
            parameters:{
                "allocation-id": {type: "string", value: address.AllocationId},
                "profile": {type: "string", value: AWSCLIUserProfile}
            },
            returnSchema:'none'
        },
        function () {}
        ));
    });

    if (releaseAddressRequests.length > 0) {
        AWSRequest.createBatch(releaseAddressRequests, function (batchRequest) {
            var failCount = 0;
            batchRequest.requestArray.forEach(function (request) {
                if (request.response.error && (request.response.errorId !== "InvalidAllocationID.NotFound")) {
                    failCount ++;
                    console.log(request.response.error);
                } else {
                    console.log("Released elastic IP " + request.parameters["allocation-id"].value);
                }
            });
            if (failCount > 0) {
                callback(new Error("Failed to complete " + failCount + "/" + batchRequest.requestArray.length + " requests."), natGatewayName);
            } else {
                console.log("Successfully completed all delete Elastic IP requests.");
                callback(null, natGatewayName);
            }

        }).startRequest();
    } else {
        callback(null, natGatewayName);
    }
}


function deleteNatGateway(natGatewayName, callback) {

    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "delete-nat-gateway",
        parameters:{
            "nat-gateway-id": {type: "string", value: baseDefinitions.natGatewayInfo.natGateways[natGatewayName].NatGateway.NatGatewayId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'none'
    },
    function (request) {
        if (request.response.error) {
            callback(request.response.error, natGatewayName);
            return;
        }
        callback(null, natGatewayName);
    }).startRequest();
}

function deleteTrafficSourceRoutes(natGatewayName, callback) {
    console.log("Deleting traffic source routes.");

    if (awsc.verifyPath(baseDefinitions, ["natGatewayInfo", "natGateways", natGatewayName, "trafficSourceRouters"], 'a').isVerifyError) {
        console.log("No traffic source routes.");
        return;
    }
    var tsRouters = baseDefinitions.natGatewayInfo.natGateways[natGatewayName].trafficSourceRouters;
    var delTrafficRequests = [];
    tsRouters.forEach(function (route){
        var params = {
            "profile": {type: "string", value: AWSCLIUserProfile}
        };
        Object.keys(route).forEach(function (routeKey) {
            var key;
            var value;
            if(routeKey === "routerTable") {
                key = "route-table-id";
                value = baseDefinitions.routeTableInfo.routeTables[route.routerTable].RouteTable.RouteTableId;
            } else if(routeKey === "vpcDefaultRouter") {
                key = "route-table-id";
                value = baseDefinitions.vpcInfo.vpcs[route.vpcDefaultRouter].RouteTableId;
            } else {
                key = routeKey;
                value = route[routeKey];
            }
            params[key] = {type: "string", value: value};
        });
        delTrafficRequests.push(AWSRequest.createRequest({
            serviceName: "ec2",
            functionName: "delete-route",
            context: {route: route, routeTableName: natGatewayName},
            parameters: params,
            returnSchema:'none'
        },
        function (request) {
            if (request.response.error && (request.response.errorId !== "InvalidRoute.NotFound") && (request.response.errorId !== "InvalidRouteTableID.NotFound")) {
                throw request.response.error;
            }
            console.log("Deleted Route " + request.parameters["destination-cidr-block"].value + " on route table " + request.parameters["route-table-id"].value);
        }));
    });
    if (delTrafficRequests.length > 0) {
        AWSRequest.createBatch(delTrafficRequests, function() {
            callback(natGatewayName);
        }).startRequest();
    } else {
        callback(natGatewayName);
    }
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
