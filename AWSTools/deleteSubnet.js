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

awsc.isValidAWSResourceNamePrefix(baseDefinitions, argv.baseDefinitionsFile);

var AWSCLIUserProfile = "default";
if (!awsc.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
    AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
} else {
    console.log("using \"default\" AWSCLIUserProfile");
}

console.log("## Deleting Subnets ##");
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
    fetchNetworkInterfaces(subnetName, function (subnetName, networkInterfaces) {
        deleteNetworkInterfaces(subnetName, networkInterfaces, function (subnetName) {
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
                    callback(request.response.error, nameTag, subnetName);
                    return;
                }

                delete baseDefinitions.subnetInfo.subnets[subnetName].SubnetId;
                console.log("Deleted Subnet '" + subnetName + "'");
                callback(null, nameTag, subnetName);

            }).startRequest();
        });
    });
}


function fetchNetworkInterfaces(subnetName, callback) {
    awsc.describeEc2ResourceForService("describe-network-interfaces",
                                        "NetworkInterfaces",
                                        "subnet-id",
                                        baseDefinitions.subnetInfo.subnets[subnetName].SubnetId,
                                        AWSCLIUserProfile,
                                        false,
                                        function (err, resourceResult) {
                                            if (err) {
                                                throw err;
                                            }
                                            callback(subnetName, resourceResult);
                                        });
}

function deleteNetworkInterfaces(subnetName, networkInterfaces, callback) {
    if (!networkInterfaces || (networkInterfaces.length === 0)) {
        callback(subnetName);
        return;
    }
    var networkInterfaceDetachRequests = [];
    var networkInterfaceDeleteRequests = [];
    networkInterfaces.forEach(function (networkInterface) {
        if (!awsc.verifyPath(networkInterface, ["Attachment", "AttachmentId"], 's').isVerifyError) {
            networkInterfaceDetachRequests.push(
                AWSRequest.createRequest(
                    {
                        serviceName: "ec2",
                        functionName: "detach-network-interface",
                        context: {NetworkInterfaceId: networkInterface.NetworkInterfaceId},
                        parameters:{
                            "attachment-id": {type: "string", value: networkInterface.Attachment.AttachmentId},
                            "profile": {type: "string", value: AWSCLIUserProfile}
                        },
                        returnSchema:'none',
                    },
                    function (request) {
                        console.log("Detached networkInterface with ID '" + request.parameters["attachment-id"].value + "'");
                    }
                )
            );
        }
        networkInterfaceDeleteRequests.push(
            AWSRequest.createRequest(
                {
                    serviceName: "ec2",
                    functionName: "delete-network-interface",
                    parameters:{
                        "network-interface-id": {type: "string", value: networkInterface.NetworkInterfaceId},
                        "profile": {type: "string", value: AWSCLIUserProfile}
                    },
                returnSchema:'none',
                },
                    function (request) {
                    console.log("Deleted networkInterface with ID '" + request.parameters["network-interface-id"].value + "'");
                }
            )
        );
    });

    // utility to batch delete NI
    function deleteRequests () {
        if (networkInterfaceDeleteRequests.length > 0) {
            AWSRequest.createBatch(networkInterfaceDeleteRequests, function (batchRequest) {
                var errorCount = 0;
                batchRequest.requestArray.forEach(function (request) {
                    if (request.response.error) {
                        errorCount += 1;
                        console.log(request.response.error);
                    }
                });
                if (errorCount > 0) {
                    process.exit(1);
                }
                callback(subnetName);
            }).startRequest();
        } else {
            callback(subnetName);
        }
    }

    // utility to wait for NI to be detached
    function waitForNIDDetached(describeRequests, doneCallback, retry) {
        if (!retry) {
            retry = 1;
        }
        if (describeRequests.length === 0) {
            doneCallback();
            return;
        }
        AWSRequest.createBatch(describeRequests, function (batchRequest) {
            var finishedCount = 0;
            var errorCount = 0;
            batchRequest.requestArray.forEach(function (request) {
                if (request.response.error) {
                    console.log(request.response.error);
                    errorCount ++;
                } else {
                    if (!awsc.verifyPath(request.response.parsedJSON,["NetworkInterfaces"],'a').isVerifyError) {
                        if (request.response.parsedJSON.NetworkInterfaces.length > 0) {
                            if (awsc.verifyPath(request.response.parsedJSON.NetworkInterfaces[0], ["Attachment", "AttachmentId"], 's').isVerifyError) {
                                finishedCount ++;
                            }
                        } else {
                            // didn't get any feedback for the NID... assume deleted.
                            finishedCount ++;
                        }
                    } else {
                        // these no longer exist... must have been deleted
                        finishedCount ++;
                    }
                }
                request.reset();
            });
            if (errorCount > 0) {
                process.exit(1);
            }
            if (finishedCount === describeRequests.length) {
                doneCallback();
            } else {
                if (retry === 10) {
                    throw new Error("Too many retries waiting for Network Interfaces to detach.");
                }
                setTimeout(function () {
                    console.log("Waiting for Network Interfaces to detach. Retry " + retry + " of 10.");
                    waitForNIDDetached(describeRequests, doneCallback, retry + 1);
                }, 3000);
            }
        }).startRequest();
    }

    if (networkInterfaceDetachRequests.length > 0) {
        AWSRequest.createBatch(networkInterfaceDetachRequests, function (batchRequest) {
            var errorCount = 0;
            var attachementWaitRequests = [];
            // need to wait for NIDs to detach
            batchRequest.requestArray.forEach(function (request) {
                if (request.response.error) {
                    errorCount += 1;
                    console.log(request.response.error);
                } else {
                    attachementWaitRequests.push(
                        AWSRequest.createRequest(
                            {
                                serviceName: "ec2",
                                functionName: "describe-network-interfaces",
                                parameters:{
                                    "network-interface-ids": {type: "string", value: request.context.NetworkInterfaceId},
                                    "profile": {type: "string", value: AWSCLIUserProfile}
                                },
                                returnSchema:"json"
                            },
                            function (request) {
                                console.log("Detached networkInterface with ID '" + request.parameters["network-interface-ids"].value + "'");
                            }
                       )
                    );
                }
            });
            if (errorCount > 0) {
                process.exit(1);
            }
            // wait for detachment before deleting
            waitForNIDDetached(attachementWaitRequests, deleteRequests);

        }).startRequest();
    } else {
        deleteRequests();
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
