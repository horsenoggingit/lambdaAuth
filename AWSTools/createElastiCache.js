#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage("Creates ElastiCache clusters. This method will wait until the cache cluster is 'available' (necessary so configurationEndpoint is defined).\nUsage: $0 [options]")
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

console.log("## Creating ElastiCache clusters ##");

if (awsc.verifyPath(baseDefinitions,['elasticacheInfo', 'elasticaches'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}
// create subnet groups


// create cache clusters
Object.keys(baseDefinitions.elasticacheInfo.elasticaches).forEach(function (elasticacheName) {
/*    var elasticacheDescription = baseDefinitions.elasticacheInfo.elasticaches[elasticacheName];
    if (!awsc.verifyPath(elasticacheDescription,["CacheCluster", "CacheClusterId"],'s').isVerifyError) {
        console.log("Cache cluster '" + elasticacheName + "' is already defined. Please use deleteElastiCache.js first.");
        return;
    }*/

    // create subnet group
    processSubnetGroupForCacheName(elasticacheName, function (elasticacheName) {
        // check to see if the name tag exists
        var nameTag = baseDefinitions.environment.AWSResourceNamePrefix + elasticacheName;
        console.log("Checking for cache cluster with Id '" + nameTag + "'");
        checkTagName(nameTag, elasticacheName, function(tagExists, results, tagName, elasticacheName) {
            if (tagExists) {
                console.log("Cache cluster '" + tagName + "' exists. updating local definitions with existing ID.");
                // update VPC info with existing tag IDs
                baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].CacheCluster = results;
                // write out result
                writeOut("Could not update CacheCluster information for cache cluster '" + elasticacheName + "'.", function () {
                    waitForCacheClusterAvailable(elasticacheName, function() {

                    });
                });
            } else {
                console.log("Creating new cache cluster with Id '" + tagName + "'");
                createCacheCluster(tagName, elasticacheName, function (err, tagName, elasticacheName) {
                    if (err) {
                        throw err;
                    }
                    writeOut("Could not update CacheCluster information for cache cluster '" + elasticacheName + "'.", function () {
                        waitForCacheClusterAvailable(elasticacheName, function() {

                        });
                    });
                });
            }
        });
    });
});

function processSubnetGroupForCacheName(elasticacheName, callback) {
    awsc.verifyPath(baseDefinitions, ["elasticacheInfo", "elasticaches", elasticacheName, "subnetGroup"], "s", "cache cluster '" + elasticacheName + "'.").exitOnError();
    var subnetName = baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].subnetGroup;
/*    var subnetDescription = baseDefinitions.elasticacheInfo.subnetGroups[subnetName];
    if (!awsc.verifyPath(subnetDescription,["CacheSubnetGroup", "CacheSubnetGroupName"],'s').isVerifyError) {
        console.log("Subnet Group '" + subnetName + "' is already defined. Continuing with cash cluster creation.");
        callback(elasticacheName);
        return;
    } */
    // check to see if the name tag exists
    var nameTag = baseDefinitions.environment.AWSResourceNamePrefix + subnetName;
    console.log("Checking for subnet group with name '" + nameTag + "'");
    checkSubnetGroup(nameTag, subnetName, function(tagExists, results, tagName, subnetName) {
        if (tagExists) {
            console.log("Subnet group '" + tagName + "' exists. Updating local definitions with existing information.");
            // update VPC info with existing tag IDs
            baseDefinitions.elasticacheInfo.subnetGroups[subnetName].CacheSubnetGroup = results;
            // write out result
            writeOut("Could not update CacheSubnetGroup information for subnet group '" + subnetName + "'.", function () {
                callback(elasticacheName);
            });
        } else {
            console.log("Creating new subnet group with name '" + tagName + "'");
            createSubnetGroup(tagName, subnetName, function (err, tagName, subnetName) {
                if (err) {
                    console.log(err);
                    return;
                }
                writeOut("Could not update CacheSubnetGroup information for subnet group '" + subnetName + "'.", function () {
                    callback(elasticacheName);
                });
            });
        }
    });
}

function checkSubnetGroup(nameTag, subnetName, callback) {
    AWSRequest.createRequest({
        serviceName: "elasticache",
        functionName: "describe-cache-subnet-groups",
        parameters:{
            "cache-subnet-group-name": {type: "string", value: nameTag},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json'
    },
    function (request) {
        if (request.response.error) {
            callback(false, null, nameTag, subnetName);
            return;
        }
        if (!request.response.parsedJSON.CacheSubnetGroups || (request.response.parsedJSON.CacheSubnetGroups.length === 0)) {
            callback(false, null, nameTag, subnetName);
            return;
        }
        callback(true, request.response.parsedJSON.CacheSubnetGroups[0], nameTag, subnetName);
    }).startRequest();
}


function checkTagName(nameTag, elasticacheName, callback) {
    AWSRequest.createRequest({
        serviceName: "elasticache",
        functionName: "describe-cache-clusters",
        parameters:{
            "cache-cluster-id": {type: "string", value: nameTag},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json'
    },
    function (request) {
        if (request.response.error) {
            callback(false, null, nameTag, elasticacheName);
            return;
        }
        if (!request.response.parsedJSON.CacheClusters || (request.response.parsedJSON.CacheClusters.length === 0)) {
            callback(false, null, nameTag, elasticacheName);
            return;
        }
        callback(true, request.response.parsedJSON.CacheClusters[0], nameTag, elasticacheName);
    }).startRequest();
}

function createSubnetGroup(nameTag, subnetName, callback) {
    awsc.verifyPath(baseDefinitions,["elasticacheInfo", "subnetGroups", subnetName, "subnets"], 'a', "elastic cache subnet group definition '" + subnetName + "'").exitOnError();
    var subnets = baseDefinitions.elasticacheInfo.subnetGroups[subnetName].subnets;
    if (subnets.length < 1) {
        throw new Error("At least one subnet is requred to create subnet group '" + subnetName + "'");
    }
    var subnetIds = [];
    for (var index = 0; index < subnets.length; index ++) {
        awsc.verifyPath(baseDefinitions,["subnetInfo", "subnets", subnets[index], "SubnetId"], 's', "subnet '" + subnets[index] + "' in subnet group definition '" + subnetName + "'").exitOnError();
        subnetIds.push(baseDefinitions.subnetInfo.subnets[subnets[index]].SubnetId);
    }
    var subnetIdString = subnetIds.join(" ");
    AWSRequest.createRequest({
        serviceName: "elasticache",
        functionName: "create-cache-subnet-group",
        parameters:{
            "cache-subnet-group-name": {type: "string", value: nameTag},
            "cache-subnet-group-description": {type: "string", value: subnetName},
            "subnet-ids": {type: "string", value: subnetIdString},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json',
        returnValidation:[{path:['CacheSubnetGroup', 'CacheSubnetGroupName'], type:'s'}]
    },
    function (request) {
        if (request.response.error) {
            callback(request.response.error, nameTag, subnetName);
            return;
        }

        baseDefinitions.elasticacheInfo.subnetGroups[subnetName].CacheSubnetGroup = request.response.parsedJSON.CacheSubnetGroup;

        callback(null, nameTag, subnetName);

    }).startRequest();
}

function createCacheCluster(nameTag, elasticacheName, callback) {
    var secgroupNames;
    if (awsc.verifyPath(baseDefinitions,["elasticacheInfo", "elasticaches", elasticacheName, "securityGroups"], 'a', "elastic cache definition '" + elasticacheName + "'").isVerifyError) {
        secgroupNames = [];
    } else {
        secgroupNames = baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].securityGroups;
    }
    var secGroupIds = [];
    for (var index = 0; index < secgroupNames.length; index ++) {
        awsc.verifyPath(baseDefinitions,["securityGroupInfo", "securityGroups", secgroupNames[index], "GroupId"], 's', "for security group '" + secgroupNames[index] + "' in elastic cache definition '" + elasticacheName + "'").exitOnError();
        secGroupIds.push(baseDefinitions.securityGroupInfo.securityGroups[secgroupNames[index]].GroupId);
    }

    if (!awsc.verifyPath(baseDefinitions,["elasticacheInfo", "elasticaches", elasticacheName, "vpcDefaultSecurityGroups"], 'a', "elastic cache definition '" + elasticacheName + "'").isVerifyError) {
        var vpcs = baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].vpcDefaultSecurityGroups;
        vpcs.forEach(function (vpcName) {
           awsc.verifyPath(baseDefinitions,["vpcInfo", "vpcs", vpcName, "GroupId"], 's', "for security vpc default secrity group '" + vpcName + "' in elastic cache definition '" + elasticacheName + "'").exitOnError();
           secGroupIds.push(baseDefinitions.vpcInfo.vpcs[vpcName].GroupId);
        });
    }

    if (secGroupIds.length < 1) {
        throw new Error("At least on security group is requred to create cache clunster '" + elasticacheName + "'");
    }
    var securityGroupIds = secGroupIds.join(" ");
    awsc.verifyPath(baseDefinitions, ["elasticacheInfo", "elasticaches", elasticacheName, "subnetGroup"], 's', "elastic cache definition '" + elasticacheName + "'").exitOnError();
    var subnetGroup = baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].subnetGroup;
    awsc.verifyPath(baseDefinitions, ["elasticacheInfo", "subnetGroups", subnetGroup, "CacheSubnetGroup", "CacheSubnetGroupName"], 's', "subnet group '" + subnetGroup + "' in elastic cache definition '" + elasticacheName + "'").exitOnError();
    var subnetGroupName = baseDefinitions.elasticacheInfo.subnetGroups[subnetGroup].CacheSubnetGroup.CacheSubnetGroupName;
    AWSRequest.createRequest({
        serviceName: "elasticache",
        functionName: "create-cache-cluster",
        parameters:{
            "cache-cluster-id": {type: "string", value: nameTag},
            "num-cache-nodes": {type: "string", value: baseDefinitions.elasticacheInfo.elasticaches[elasticacheName]["num-cache-nodes"].toString()},
            "cache-node-type": {type: "string", value: baseDefinitions.elasticacheInfo.elasticaches[elasticacheName]["cache-node-type"]},
            "engine": {type: "string", value: baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].engine},
            "security-group-ids": {type: "string", value: securityGroupIds},
            "cache-subnet-group-name": {type: "string", value: subnetGroupName},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json',
        returnValidation:[{path:['CacheCluster', 'CacheClusterId'], type:'s'}]
    },
    function (request) {
        if (request.response.error) {
            callback(request.response.error, nameTag, elasticacheName);
            return;
        }

        baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].CacheCluster = request.response.parsedJSON.CacheCluster;

        callback(null, nameTag, elasticacheName);

    }).startRequest();
}

function waitForCacheClusterAvailable(elasticacheName, callback) {
    if (!retryCounters[elasticacheName]) {
        retryCounters[elasticacheName] = 1;
    }
    var maxRetry = 20;
    var status = baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].CacheCluster.CacheClusterStatus;
    console.log("Waiting for cache cluster '" + elasticacheName + "' available. Current status: '" + status + "'. Retry " + retryCounters[elasticacheName] + " of " + maxRetry);
    if (status === 'available') {
        callback(elasticacheName);
        return;
    }
    setTimeout(function () {
        checkTagName(baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].CacheCluster.CacheClusterId, elasticacheName , function(tagExists, results, tagName, elasticacheName) {
            if (!tagExists) {
                throw new Error("Cache cluster " + baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].CacheCluster.CacheClusterId + " has disappeared.");
            }
            var status2 = results.CacheClusterStatus;
            if (status2 === 'available') {
                baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].CacheCluster = results;
                // write out result
                writeOut("Could not update CacheCluster information for cache cluster '" + elasticacheName + "'.", function () {
                    callback(elasticacheName);
                });
            } else {
                retryCounters[elasticacheName] = retryCounters[elasticacheName] + 1;
                if (retryCounters[elasticacheName] > maxRetry) {
                    throw new Error("Waiting for 'avalable' status of cache cluster '" + elasticacheName + "' timed out.");
                }
                waitForCacheClusterAvailable(elasticacheName, callback);
            }
        });
    }, 30000);
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
