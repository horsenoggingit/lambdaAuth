#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Creates Network ACLs.\nUsage: $0 [options]')
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

console.log("Creating Route Tables");

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
    console.log("Checking for Network ACL with tag name '" + nameTag + "'");
    awsc.checkEc2ResourceTagName(nameTag, routeTableName, AWSCLIUserProfile, function(tagExists, results, tagName, routeTableName) {
        if (tagExists) {
            console.log("Network ALC '" + tagName + "' exists. updating local definitions with existing ID.");
            // update Network ACL info with existing tag IDs
            if (!baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable) {
                baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable = {};
            }
            baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable.RouteTableId = results[0].ResourceId;
           // write out result
           commitUpdates(routeTableName);
           makeSubnetAssociations(routeTableName);
           addRoutes(routeTableName);
       } else {
           console.log("Creating new Network ACL with tag name '" + tagName + "'");
           createRouteTable(tagName, routeTableName, function (err, tagName, routeTableName) {
               if (err) {
                   console.log(err);
                   return;
               }
               commitUpdates(routeTableName);
               makeSubnetAssociations(routeTableName);
               addRoutes(routeTableName);
           });
       }
    });
});

function commitUpdates(routeTableName) {
    writeOut("Could not update RouteTableId for Route Table '" + routeTableName + "'.");
}

function createRouteTable(nameTag, routeTableName, callback) {

    var pathError = awsc.verifyPath(baseDefinitions,["vpcInfo", "vpcs", baseDefinitions.routeTableInfo.routeTables[routeTableName].vpc, "VpcId"], "s", "definitions file \"" + argv.baseDefinitionsFile + "\"");
    if (pathError.isVerifyError) {
        console.log(pathError);
        throw new Error("Please create the VPC first using 'createVPC.js'");
    }

    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "create-route-table",
        parameters:{
            "vpc-id": {type: "string", value: baseDefinitions.vpcInfo.vpcs[baseDefinitions.routeTableInfo.routeTables[routeTableName].vpc].VpcId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json',
        returnValidation:[{path:['RouteTable', 'RouteTableId'], type:'s'}]
    },
    function (request) {
        if (request.response.error) {
            callback(request.response.error, nameTag, routeTableName);
            return;
        }
        baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable = request.response.parsedJSON.RouteTable;
        // clear out associations because this is a new route table.
        baseDefinitions.routeTableInfo.routeTables[routeTableName].Associations = {};
        awsc.createEc2ResourceTag(baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable.RouteTableId, nameTag, AWSCLIUserProfile, function (err) {
            callback(err, nameTag, routeTableName);
        });
    }).startRequest();
}

function makeSubnetAssociations(routeTableName) {
    if (awsc.verifyPath(baseDefinitions, ["routeTableInfo", "routeTables", routeTableName, "subnetAssociations"],'a').isVerifyError) {
        return;
    }
    var associations = baseDefinitions.routeTableInfo.routeTables[routeTableName].subnetAssociations;
    associations.forEach(function (subnetName) {
        AWSRequest.createRequest({
            serviceName: "ec2",
            functionName: "associate-route-table",
            context: {subnetName: subnetName, routeTableName: routeTableName},
            parameters:{
                "subnet-id": {type: "string", value: baseDefinitions.subnetInfo.subnets[subnetName].SubnetId},
                "route-table-id": {type: "string", value: baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable.RouteTableId},
                "profile": {type: "string", value: AWSCLIUserProfile}
            },
            returnSchema:'json',
            returnValidation:[{path:['AssociationId'], type:'s'}]
        },
        function (request) {
            if (request.response.error) {
                console.log("Could not create subnet association '" + request.context.subnetName + "' for route table '" + request.context.routeTableName + "'.");
                throw request.response.error;
            }
            if (!baseDefinitions.routeTableInfo.routeTables[routeTableName].Associations) {
                baseDefinitions.routeTableInfo.routeTables[routeTableName].Associations = {};
            }
            baseDefinitions.routeTableInfo.routeTables[routeTableName].Associations[request.context.subnetName] = request.response.parsedJSON.AssociationId;
            console.log("Created subnet associlation " + request.context.subnetName + "' for route table '" + request.context.routeTableName + "'.");
            writeOut("Could not save subnet association '" + request.context.subnetName + "' for route table '" + request.context.routeTableName + "'.");
        }).startRequest();
    });
}

function addRoutes(routeTableName) {
    if (awsc.verifyPath(baseDefinitions, ["routeTableInfo", "routeTables", routeTableName, "routes"],'a').isVerifyError) {
        return;
    }
    var routes = baseDefinitions.routeTableInfo.routeTables[routeTableName].routes;

    routes.forEach(function (route) {
        var params = {
            "route-table-id": {type: "string", value: baseDefinitions.routeTableInfo.routeTables[routeTableName].RouteTable.RouteTableId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        };
        Object.keys(route).forEach(function (routeKey) {
            var key;
            var value;
            if (routeKey === "internetGateway") {
                key = "gateway-id";
                value = baseDefinitions.internetGatewayInfo.internetGateways[route[routeKey]].InternetGateway.InternetGatewayId;
            } else {
                key = routeKey;
                value = route[routeKey];
            }
            params[key] = {type: "string", value: value};
        });

        AWSRequest.createRequest({
            serviceName: "ec2",
            functionName: "create-route",
            context: {route: route, routeTableName: routeTableName},
            parameters: params,
            returnSchema:'none'
        },
        function (request) {
            if (request.response.error) {
                console.log("Could not create route '" + JSON.stringify(request.context.route) + "' for route table '" + request.context.routeTableName + "'.");
                throw request.response.error;
            }
            console.log("Created route '" + JSON.stringify(request.context.route) + "' for route table '" + request.context.routeTableName + "'.");
        }).startRequest();
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
        console.log("Done.");
    });
}
