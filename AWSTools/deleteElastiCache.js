#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Creates ElastiCache clusters.\nUsage: $0 [options]')
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


console.log("## Deleting ElastiCache clusters ##");
console.log("This command may take up to 5 minutes to complete because cache subnet group deletion must wait for cache clusters to be deleted.");

if (awsc.verifyPath(baseDefinitions,['elasticacheInfo', 'elasticaches'],'o').isVerifyError) {
    console.log("Nothing to do.");
    return;
}
// create subnet groups


// create cache clusters
var deleteCacheClusterRequests = [];
Object.keys(baseDefinitions.elasticacheInfo.elasticaches).forEach(function (elasticacheName) {
    var elasticacheDescription = baseDefinitions.elasticacheInfo.elasticaches[elasticacheName];
    if (awsc.verifyPath(elasticacheDescription,["CacheCluster", "CacheClusterId"],'s').isVerifyError) {
        return;
    }
    deleteCacheClusterRequests.push(deleteCacheClusterRequest(elasticacheName));
});

if (deleteCacheClusterRequests.length > 0) {
    AWSRequest.createBatch(deleteCacheClusterRequests, function () {

        writeOut("Couldn't updated deleted cache cluster information.", function () {
            deleteSubnetGroups();
        });

    }).startRequest();
} else {
    deleteSubnetGroups();
}

function deleteSubnetGroups() {
    console.log("Deleting subnet groups clusters");
    var deleteSubnetGroupRequests = [];
    Object.keys(baseDefinitions.elasticacheInfo.subnetGroups).forEach(function (subnetGroupName) {
        var elasticacheDescription = baseDefinitions.elasticacheInfo.subnetGroups[subnetGroupName];
        if (awsc.verifyPath(elasticacheDescription,["CacheSubnetGroup", "CacheSubnetGroupName"],'s').isVerifyError) {
            return;
        }
        deleteSubnetGroupRequests.push(deleteSubnetGroupRequest(subnetGroupName));
    });
    if (deleteSubnetGroupRequests.length > 0) {
        AWSRequest.createBatch(deleteSubnetGroupRequests, function () {

            writeOut("Couldn't updated deleted subnet group information.", function () {

            });
        }).startRequest();
    }
}

function deleteCacheClusterRequest(elasticacheName) {
    var request = AWSRequest.createRequest({
        serviceName: "elasticache",
        functionName: "delete-cache-cluster",
        parameters:{
            "cache-cluster-id": {type: "string", value: baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].CacheCluster.CacheClusterId},
            "profile": {type: "string", value: AWSCLIUserProfile},
        },
        returnSchema:'json',
        retryDelay: 30000,
        retryCount: 20,
        retryErrorIds: ["InvalidCacheClusterState"]
    },
    function (request) {
        if (request.response.error) {
            console.log(request.response.error);
            return;
        }
        delete baseDefinitions.elasticacheInfo.elasticaches[elasticacheName].CacheCluster;
    });
    request.on("AwsRequestRetry", function (request) {
        console.log("Retry " + request.retryAttempt + " of " + request.retryCount + " for '" + request.functionName + "' ");
    });
    return request;
}

function deleteSubnetGroupRequest(subnetGroupName) {
    var request =  AWSRequest.createRequest({
        serviceName: "elasticache",
        functionName: "delete-cache-subnet-group",
        parameters:{
            "cache-subnet-group-name": {type: "string", value: baseDefinitions.elasticacheInfo.subnetGroups[subnetGroupName].CacheSubnetGroup.CacheSubnetGroupName},
            "profile": {type: "string", value: AWSCLIUserProfile}
         },
        returnSchema:'json',
        retryDelay: 30000,
        retryCount: 20,
        retryErrorIds: ["CacheSubnetGroupInUse"]
    },
    function (request) {
        if (request.response.error && (request.response.errorId === "CacheSubnetGroupNotFoundFault")) {
            delete baseDefinitions.elasticacheInfo.subnetGroups[subnetGroupName].CacheSubnetGroup;
            return;
        }
        if (request.response.error) {
            console.log(request.response.error);
            return;
        }

        delete baseDefinitions.elasticacheInfo.subnetGroups[subnetGroupName].CacheSubnetGroup;
    });
    request.on("AwsRequestRetry", function (request) {
        console.log("Retry " + request.retryAttempt + " of " + request.retryCount + " for '" + request.functionName + "' ");
    });
    return request;
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
