#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Deletes Route Tables and Associations.\nUsage: $0 [options]')
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

console.log("## Deleting Route Tables ##");

if (awsc.verifyPath(baseDefinitions,['routeTableInfo', 'routeTables'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}

Object.keys(baseDefinitions.routeTableInfo.routeTables).forEach(function (routeTableName) {
 /*   var networkAclDescription = baseDefinitions.networkAclInfo.networkAcls[networkAclName];
    if (!awsc.verifyPath(networkAclDescription,["networkAclId"],'s').isVerifyError) {
        console.log("Network ACL '" + networkAclName + "' is already defined. Please use deleteNetworkAcl.js first.");
        return;
    }*/
    // check to see if the name tag exists
    var nameTag = baseDefinitions.environment.AWSResourceNamePrefix + routeTableName + "RouteTable";
    console.log("Checking for Route Table with tag name '" + nameTag + "'");
    awsc.checkEc2ResourceTagName(nameTag, routeTableName, AWSCLIUserProfile, function(tagExists, results, tagName, routeTableName) {
        if (tagExists) {
            console.log("Route Table '" + tagName + "' exists, deleting.");
            // update Network ACL info with existing tag IDs
            if (!baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable) {
                baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable = {};
            }
            baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable.RouteTableId = results[0].ResourceId;
            // write out result
            deleteSubnetAssociations(routeTableName, function (routeTableName) {
               deleteRoutes(routeTableName, function (routeTableName) {
                   deleteRouteTable(routeTableName, function (routeTableName) {
                       commitUpdates(routeTableName);
                   });
               });
            });
       } else {
           console.log("Route Table '" + tagName + "' does not exist.");
           delete baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable;
           deleteSubnetAssociations(routeTableName, function (routeTableName) {
               commitUpdates(routeTableName);
           });
       }
    });
});

function commitUpdates(routeTableName) {
    writeOut("Could not update RouteTableId for Route Table '" + routeTableName + "'.");
}

function deleteRouteTable(routeTableName, callback) {
    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "delete-route-table",
        parameters:{
            "route-table-id": {type: "string", value: baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable.RouteTableId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'none'
    },
    function (request) {
        if (request.response.error) {
            throw request.response.error;
        }
        delete baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable;
        console.log("Deleted Route Table '" + routeTableName + "'.");
        callback(routeTableName);
    }).startRequest();
}

function deleteSubnetAssociations(routeTableName, callback) {
    if (awsc.verifyPath(baseDefinitions, ["routeTableInfo", "routeTables", routeTableName, "Associations"],'o').isVerifyError) {
        callback(routeTableName);
        return;
    }
    var associations = baseDefinitions.routeTableInfo.routeTables[routeTableName].Associations;
    var associationRequests = [];
    Object.keys(associations).forEach(function (subnetName) {
        associationRequests.push(
            AWSRequest.createRequest({
                serviceName: "ec2",
                functionName: "disassociate-route-table",
                context: {subnetName: subnetName, routeTableName: routeTableName},
                parameters:{
                    "association-id": {type: "string", value: associations[subnetName]},
                    "profile": {type: "string", value: AWSCLIUserProfile}
                },
                returnSchema:'none'
            },
            function () {
            })
        );
    });
    if (associationRequests.length === 0) {
        callback(routeTableName);
        return;
    }
    AWSRequest.createBatch(associationRequests, function(batchRequest) {
        var hasError = false;
        batchRequest.requestArray.forEach(function (request) {
            if (request.response.error) {
                hasError = true;
                console.log("Could not remove subnet association '" + request.context.subnetName + "' for route table '" + request.context.routeTableName + "'.");
                console.log(request.response.error);
            }
            delete baseDefinitions.routeTableInfo.routeTables[routeTableName].Associations[request.context.subnetName];
            console.log("Deleted subnet association '" + request.context.subnetName + "' for route table '" + request.context.routeTableName + "'.");
        });
        writeOut("Could not save deleted subnet associations for route table '" + routeTableName + "'.", function () {
            if (hasError) {
                process.exit(1);
            }
            callback(routeTableName);
        });
    }).startRequest();
}

function deleteRoutes(routeTableName, callback) {
    if (awsc.verifyPath(baseDefinitions, ["routeTableInfo", "routeTables", routeTableName, "routes"],'a').isVerifyError) {
        callback(routeTableName);
        return;
    }
    var routes = baseDefinitions.routeTableInfo.routeTables[routeTableName].routes;
    var routeDeleteRequests = [];
    routes.forEach(function (route) {
        var params = {
            "route-table-id": {type: "string", value: baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable.RouteTableId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        };
        params["destination-cidr-block"] = {type: "string", value: route["destination-cidr-block"]};
        routeDeleteRequests.push(

            AWSRequest.createRequest({
                serviceName: "ec2",
                functionName: "delete-route",
                context: {route: route, routeTableName: routeTableName},
                parameters: params,
                returnSchema:'none'
            },
            function () {
            })
        );
    });
    if (routeDeleteRequests.length > 0) {
        AWSRequest.createBatch(routeDeleteRequests, function (batchRequest) {
            var hasError;
            batchRequest.requestArray.forEach(function (request) {
                if (request.response.error && (request.response.errorId !== "InvalidRoute.NotFound") && (request.response.errorId !== "InvalidRouteTableID.NotFound")) {
                    console.log("Could not delete route '" + JSON.stringify(request.context.route) + "' for route table '" + request.context.routeTableName + "'.");
                    hasError = true;
                } else {
                    console.log("Deleted route '" + JSON.stringify(request.context.route) + "' for route table '" + request.context.routeTableName + "'.");
                }
            });
            if (hasError) {
                process.exit(1);
            }
            callback(routeTableName);
        }).startRequest();
    } else {
        callback();
    }
}

function writeOut(errorText, callback) {
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
        if (callback) {
            callback();
        }
    });
}
