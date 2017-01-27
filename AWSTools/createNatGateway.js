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

console.log("Creating NAT Gateways");

if (awsc.verifyPath(baseDefinitions,['natGatewayInfo', 'natGateways'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}

Object.keys(baseDefinitions.natGatewayInfo.natGateways).forEach(function (natGatewayName) {
    var natGatewayDescription = baseDefinitions.natGatewayInfo.natGateways[natGatewayName];
    if (!awsc.verifyPath(natGatewayDescription, ["NatGateway", "NatGatewayId"], 's').isVerifyError) {
        console.log("NAT Gateway '" + natGatewayName + "' is already defined.");
        waitForNatGatewayAvailable(natGatewayName, function (natGatewayName) {
            commitUpdates(natGatewayName);
            configureTrafficSourceRoutes(natGatewayName);
        });
        return;
    }

    console.log("Creating new NAT Gateway");
    createNatGateway(natGatewayName, function (err, natGatewayName) {
        if (err) {
            console.log(err);
            return;
        }
        commitUpdates(natGatewayName);
        waitForNatGatewayAvailable(natGatewayName, function (natGatewayName) {
            commitUpdates(natGatewayName);
            configureTrafficSourceRoutes(natGatewayName);
        });
    });
});

function commitUpdates(natGatewayName) {
    writeOut("Could not update natGatewayId for NAT Gateway '" + natGatewayName + "'.");
}


function waitForNatGatewayAvailable(natGatewayName, callback) {
    if (!retryCounters[natGatewayName]) {
        retryCounters[natGatewayName] = 1;
    }
    var maxRetry = 30;
    var status = baseDefinitions.natGatewayInfo.natGateways[natGatewayName].NatGateway.State;
    console.log("Waiting for NAT Gateway '" + natGatewayName + "' available. Current status: '" + status + "'. Retry " + retryCounters[natGatewayName] + " of " + maxRetry);
    if (status === 'available') {
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
            if (request.response.parsedJSON.NatGateways[0].State === "available") {
                baseDefinitions.natGatewayInfo.natGateways[natGatewayName].NatGateway = request.response.parsedJSON.NatGateways[0];
                callback(natGatewayName);
            } else {
                if (retryCounters[natGatewayName] > maxRetry) {
                    throw new Error("Waiting for 'avalable' status of NAT Gateway '" + natGatewayName + "' timed out.");
                }
                retryCounters[natGatewayName] = retryCounters[natGatewayName] + 1;
                waitForNatGatewayAvailable(natGatewayName, callback);
           }
        }).startRequest();
    }, 10000);
}



function allocateElasticIp(natGatewayName, callback) {
    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "allocate-address",
        parameters:{
            "domain": {type: "string", value:"vpc"},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json',
        returnValidation:[{path:['AllocationId'], type:'s'}]
    },
    function (request) {
        if (request.response.error) {
            callback(request.response.error, null, natGatewayName);
            return;
        }
        callback(request.response.error, request.response.parsedJSON.AllocationId, natGatewayName);
    }).startRequest();
}

function createNatGateway(natGatewayName, callback) {
    allocateElasticIp(natGatewayName, function (err, allocationId, natGatewayName) {
        if (err) {
            throw err;
        }
        AWSRequest.createRequest({
            serviceName: "ec2",
            functionName: "create-nat-gateway",
            parameters:{
                "subnet-id": {type: "string", value: baseDefinitions.subnetInfo.subnets[baseDefinitions.natGatewayInfo.natGateways[natGatewayName].subnet].SubnetId},
                "allocation-id": {type: "string", value: allocationId},
                "profile": {type: "string", value: AWSCLIUserProfile}
            },
            returnSchema:'json',
            returnValidation:[{path:['NatGateway', 'NatGatewayId'], type:'s'}]
        },
        function (request) {
            if (request.response.error) {
                callback(request.response.error, natGatewayName);
                return;
            }

            baseDefinitions.natGatewayInfo.natGateways[natGatewayName].NatGateway = request.response.parsedJSON.NatGateway;
            callback(null, natGatewayName);
        }).startRequest();
    });
}

function configureTrafficSourceRoutes(natGatewayName) {
    console.log("Configuring traffic source routes.");

    if (awsc.verifyPath(baseDefinitions, ["natGatewayInfo", "natGateways", natGatewayName, "trafficSourceRouters"], 'a').isVerifyError) {
        console.log("No traffic source routes.");
        return;
    }
    var tsRouters = baseDefinitions.natGatewayInfo.natGateways[natGatewayName].trafficSourceRouters;
    tsRouters.forEach(function (route){
        var params = {
            "nat-gateway-id": {type: "string", value: baseDefinitions.natGatewayInfo.natGateways[natGatewayName].NatGateway.NatGatewayId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        };
        Object.keys(route).forEach(function (routeKey) {
            var key;
            var value;
            if (routeKey === "internetGateway") {
                key = "gateway-id";
                value = baseDefinitions.internetGatewayInfo.internetGateways[route[routeKey]].InternetGateway.InternetGatewayId;
            } else if(routeKey === "routerTableId") {
                key = "route-table-id";
                value = route[routeKey];
            } else if(routeKey === "vpcDefaultRouter") {
                key = "route-table-id";
                value = baseDefinitions.vpcInfo.vpcs[route.vpcDefaultRouter].RouteTableId;
            } else {
                key = routeKey;
                value = route[routeKey];
            }
            params[key] = {type: "string", value: value};
        });
        createRoute(route, params, natGatewayName);
    });

}

function createRoute(route, params, natGatewayName, retry) {
            AWSRequest.createRequest({
                serviceName: "ec2",
                functionName: "create-route",
                context: {route: route, routeTableName: natGatewayName},
                parameters: params,
                returnSchema:'none'
            },
            function (request) {
                if (request.response.error && (request.response.errorId === "RouteAlreadyExists") && !retry) {
                    console.log("Route '" + JSON.stringify(request.context.route) + "' exists for route table '" + request.context.routeTableName + "'. Deleting and re-creating.");
                    var deleteParams = {};
                    deleteParams.profile = params.profile;
                    deleteParams["route-table-id"] = params["route-table-id"];
                    deleteParams["destination-cidr-block"] = params["destination-cidr-block"];
                    AWSRequest.createRequest({
                        serviceName: "ec2",
                        functionName: "delete-route",
                        parameters: deleteParams,
                        returnSchema:'none'
                    },
                    function () {
                        createRoute(route, params, natGatewayName, true);
                    }).startRequest();
                    return;
                } else if (request.response.error) {
                    console.log("Could not create route '" + JSON.stringify(request.context.route) + "' for route table '" + request.context.routeTableName + "'.");
                    throw request.response.error;
                }
                console.log("Created route '" + JSON.stringify(request.context.route) + "' for route table Id'" + request.parameters['route-table-id'].value + "'.");
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
