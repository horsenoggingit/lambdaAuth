"use strict";

const fs = require("fs");
const path = require("path");
const LintStream = require("jslint").LintStream;
const linter = "jshint";
const JSHINT = require("jshint");
const AWSRequest = require(path.join(__dirname, 'AwsRequest'));

class VerifyResultString extends Object {
    constructor (errorMessage, isVerifyError) {
        super();
        if (typeof isVerifyError === "boolean") {
            this.isVerifyError = isVerifyError;
        } else {
            this.isVerifyError = false;
        }

        this.errorMessage = errorMessage;
    }
    toString() {
        return this.errorMessage;
    }
    exitOnError() {
        if (this.isVerifyError) {
            throw new Error(this.errorMessage);
        }
    }
    callbackOnError(callback) {
        if (this.isVerifyError) {
            callback(this);
        }
        return(this);
    }
}

exports.VerifyResultString = VerifyResultString;


function verifyPath(structure, pathArray, leafTypeKey, itemName, extraString) {
    var leafTypes = {"s" : "string",
        "n" : "number",
        "o" : "object",
        "a" : "array",
        "f" : "function",
        "b" : "boolean"
    };

    if (!extraString) {
        extraString = "";
    }

    var result = checkPath(structure, pathArray, leafTypeKey);
    if (!result) {
        return new VerifyResultString();
    }
    var path = pathArray.join(".");
    var errorString;
    var key1String;
    var key2String;
    if (typeof leafTypeKey === "object") {
        errorString = "Failed validation of action \"" + result.failAction + "\". ";
        if (result.failIndex === 0) {
            switch (result.failAction) {
                case "oneOfs":
                key1String = "string ([" + leafTypeKey.oneOfs.join("|") + "])";
                key2String = leafTypes[getTypeKey(structure)];
                break;
                default:
            }
        }
    } else {
        errorString = "";
        key1String = leafTypes[leafTypeKey];
        key2String = leafTypes[getTypeKey(structure)];
    }
    if (result.failIndex === 0) {
        errorString += "The item \"" + path + "\" of expected type \"" + key1String + "\" was not found because the \"" + itemName + "\" was of type " + key2String + ". " + extraString;
    } else if (result.failIndex < pathArray.length) {
        errorString += "The item \"" + path + "\" of expected type \"" + key1String + "\" in the " + itemName + " was not found because \"" + pathArray[result.failIndex - 1] + "\" was not an object. It was of type \"" + leafTypes[result.failType] + "\". " + extraString;
    } else {
        errorString += "The item \"" + path + "\" of expected type \"" + key1String + "\" in the " + itemName + " was not found because \"" + pathArray[result.failIndex - 1] + "\" was of type \"" + leafTypes[result.failType] + "\"." + extraString;
    }

    var x = new VerifyResultString(errorString, true);
    return x;
}

exports.verifyPath = verifyPath;

function checkPath(structure, pathArray, leafTypeKey) {
    var items = [structure];
    var index = 0;
    var typeResult = "x";
    for (; index < pathArray.length; index++) {
        var nextItems = [];
        var breakOut = false;
        for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
            var item = items[itemIndex];
            typeResult = getTypeKey(item);
            switch (typeResult) {
                case "a":
                // if it is an array push each item for verification on the next pass
                item.forEach(function (arrayItem) {
                    nextItems.push(arrayItem[pathArray[index]]);
                });
                break;
                case "o":
                // when * is encountere on the path we push each item regardles of key.
                if (pathArray[index] === "*") {
                    Object.keys(item).forEach(function (itemKey) {
                        nextItems.push(item[itemKey]);
                    });
                } else {
                    nextItems.push(item[pathArray[index]]);
                }
                break;
                default:
                breakOut = true;
            }
            if (breakOut) {
                break;
            }
        }
        if (breakOut) {
            break;
        }
        items = nextItems;
    }
    if (index !== pathArray.length) {
        return {failIndex:index, failType:typeResult};
    }
    for (var itemIndex2 = 0; itemIndex2 < items.length; itemIndex2++) {
        var item2 = items[itemIndex2];
        typeResult = getTypeKey(item2);
        // if the leadTypeKey is an object check to see which command should be executed
        if (typeof leafTypeKey === "object") {
            var actions = Object.keys(leafTypeKey);
            for (var oneOfsIndex = 0; oneOfsIndex < actions.length; oneOfsIndex ++) {
                var action = actions[oneOfsIndex];
                switch (action) {
                    case "oneOfs":
                    // value for oneOfs is an array of strings.
                    if ((typeResult !== "s") || (leafTypeKey[action].indexOf(item2)) < 0) {
                        return {failIndex:index, failType:typeResult, failAction:action};
                    }
                    break;
                    default:
                    console.log("Unrecognized leafTypeKey command: " + action);
                }

            }
        } else if (typeResult !== leafTypeKey) {
            return {failIndex:index, failType:typeResult};
        }
    }
    return null;
}

function getTypeKey(item) {
    var typeKey = "u";
    switch (typeof item) {
        case "string":
        typeKey = "s";
        break;
        case "number":
        typeKey = "n";
        break;
        case "boolean":
        typeKey = "b";
        break;
        case "object":
        // null
        if (!item) {
            typeKey = "n";
        } else if (Array.isArray(item)) {
            typeKey = "a";
        } else {
            typeKey = "o";
        }
        break;
        case "undefined":
        typeKey = "u";
        break;
        case "function":
        typeKey = "f";
        break;
        case "symbol":
        typeKey = "s";
        break;
        default:
        typeKey = "u";
    }
    return typeKey;
}

exports.updateFile = function updateFile(fName, dataCallback, callback, retry) {
    if (fs.existsSync(fName + ".old")) {
        fs.unlinkSync(fName + ".old");
    }
    fs.rename(fName, fName + ".old", function (err){
        if (err) {
            // file does not exist... likely someone else trying to write it.
            if (retry === 5) {
                callback(err,null);
                return;
            }
            if (!retry) {
                retry = 0;
            }
            setTimeout(function() {
                exports.updateFile(fName, dataCallback, callback, retry + 1);
            }, 250);
            return;
        }
        fs.writeFile(fName, dataCallback(), function (err) {
            if (err) {
                callback(null,err);
                return;
            }
            callback(null,null);
        });
    });
};

exports.validatejs = function(lambdaDefintitions, lambdaPath) {
    var implementationFiles=[];
    var addFile = function(filePath) {
        if (path.extname(filePath) === ".js") {
            implementationFiles.push(filePath);
        }
    };
    // make a file list from the definitions
    // get the base implementation files first
    lambdaDefintitions.implementationFiles[lambdaDefintitions.lambdaInfo.functionName].forEach(addFile);
    // now add the link file skipping directories
    if (lambdaDefintitions.linkFiles) {
        Object.keys(lambdaDefintitions.linkFiles).forEach(function(fileArrayKey) {
            lambdaDefintitions.linkFiles[fileArrayKey].forEach(addFile);
        });
    }

    if (linter==="jslint") {
        var options = {
            "length": 100,
            "node": true,
            "fudge": true,
            "edition": "latest",
            "es6": true,
            "stupid": true,
            "for": true
        };
        var l = new LintStream(options);
        l.on("data", function (chunk, encoding, callback) {
            // chunk is an object

            // chunk.file is whatever you supplied to write (see above)
            console.log(chunk.file);
            console.log(chunk.linted.errors);

            // chunk.linted is an object holding the result from running JSLint
            // chunk.linted.ok is the boolean return code from JSLINT()
            // chunk.linted.errors is the array of errors, etc.
            // see JSLINT for the complete contents of the object
            if (callback) {
                callback();
            }
        });
        implementationFiles.forEach(function(file){
            console.log(path.join(lambdaPath, file));
            var code = fs.readFileSync(path.join(lambdaPath, file), "utf8");
            l.write({file: file, body: code});
        });
    }
    if (linter === "jshint") {
        implementationFiles.forEach(function(file){
            console.log(path.join(lambdaPath, file));
            var code = fs.readFileSync(path.join(lambdaPath, file), "utf8");
            JSHINT.JSHINT(code,{
                node: true,
                esversion: 6,
                undef: true,
                unused: true,
                eqeqeq: true
            },{});
            if (!JSHINT.JSHINT.data().errors) {
                console.log("No lint errors!");
            } else {
                console.log(JSHINT.JSHINT.data().errors);
            }
        });
    }
};

exports.createPath = function (pathString) {
    // make sure the download path exists. If not create it.
    var downloadPath;
    if (!path.isAbsolute(pathString)) {
        downloadPath = path.join(path.resolve(), pathString);
    } else {
        downloadPath = pathString;
    }
    downloadPath = path.normalize(downloadPath);

    var downloadPathComponents = downloadPath.split(path.sep);
    var mkPath = path.sep;
    downloadPathComponents.forEach(function (pathComponent) {
        mkPath = path.join(mkPath, pathComponent);
        if (!fs.existsSync(mkPath)){
            fs.mkdirSync(mkPath);
        }
    });
};

exports.isValidAWSResourceNamePrefix = function (baseDefinitions, fileName) {
    var prefix = baseDefinitions.environment.AWSResourceNamePrefix;
    if (!prefix) {
        throw new Error("Please assign a AWSResourceNamePrefix at 'environment.AWSResourceNamePrefix' in base definitions file '" + fileName + "'. AWSResourceNamePrefix unfortunately must be all lower case [a-z] characters.");
    }
    var testPattern = /^[a-z]+$/;
    if (!testPattern.test(prefix)) {
        throw new Error("Invalid AWSResourceNamePrefix at AWSResourceNamePrefix in 'environment.AWSResourceNamePrefix' in base definitions file '" + fileName + "'. AWSResourceNamePrefix unfortunately must be all lower case [a-z] characters.");
    }
    return true;
};

exports.addLambdaVPCConfiguration = function(params, definitions, fileName, baseDefinitions, baseDefinitionsFileName) {
    var secgroupNames;

    if (verifyPath(definitions,["lambdaInfo", "securityGroups"], 'a').isVerifyError) {
        secgroupNames = [];
    } else {
        secgroupNames = definitions.lambdaInfo.securityGroups;
    }
    var secGroupIds = [];
    for (var index = 0; index < secgroupNames.length; index ++) {
        verifyPath(baseDefinitions, ["securityGroupInfo", "securityGroups", secgroupNames[index], "GroupId"], 's', "for security group '" + secgroupNames[index] + "' in lambda definitions file '" + fileName + "'").exitOnError();
        secGroupIds.push(baseDefinitions.securityGroupInfo.securityGroups[secgroupNames[index]].GroupId);
    }

    if (!verifyPath(definitions,["lambdaInfo", "vpcDefaultSecurityGroups"], 'a').isVerifyError) {
        var vpcs = definitions.lambdaInfo.vpcDefaultSecurityGroups;
        vpcs.forEach(function (vpcName) {
           verifyPath(baseDefinitions,["vpcInfo", "vpcs", vpcName, "GroupId"], 's', "for security vpc default secrity group '" + vpcName + "' in lambda definitions file '" + fileName + "'").exitOnError();
           secGroupIds.push(baseDefinitions.vpcInfo.vpcs[vpcName].GroupId);
        });
    }

    // see if we have enough information to add VPC
    var pathErrorSubnets = verifyPath(definitions,["lambdaInfo", "subnets"], 'a', "definitions file \"" + fileName + "\"");

    var subnetIds = [];
    if (!pathErrorSubnets.isVerifyError) {
        var subnets = definitions.lambdaInfo.subnets;
        subnets.forEach(function (subnetName) {
            verifyPath(baseDefinitions, ["subnetInfo", "subnets", subnetName, "SubnetId"], "s", "base definition file " + baseDefinitionsFileName).exitOnError();
            subnetIds.push(baseDefinitions.subnetInfo.subnets[subnetName].SubnetId);
        });
    }

    if ((secGroupIds.length === 0) && (subnetIds.length === 0)) {
        // nothing to do
        return;
    }

    if (((secGroupIds.length === 0) && (subnetIds.length !== 0)) || ((secGroupIds.length !== 0) && (subnetIds.length === 0))) {
        throw new Error("VPC configuration requires both a security group (either defined in secuityGroupInfo or a VPC default security group) and subnet in definitions file \"" + fileName + "\"");
    }
    // make a list if sec group ids

    console.log("Adding VPC configuration");

    var vpcConfigString = "SubnetIds=" + subnetIds.join(",") + ",SecurityGroupIds=" + secGroupIds.join(",");

    params["vpc-config"]= {type: "string", value: vpcConfigString};
};

function checkEc2ResourceTagName(nameTag, resourceName, AWSCLIUserProfile, callback) {
    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "describe-tags",
        parameters:{
            "filters": {type: "string", value: "Name=value,Values=" + nameTag},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json',
    },
    function (request) {
        if (request.response.error) {
            callback(false, null, nameTag, resourceName);
            return;
        }
        if (!request.response.parsedJSON.Tags || (request.response.parsedJSON.Tags.length === 0)) {
            callback(false, null, nameTag, resourceName);
            return;
        }
        callback(true, request.response.parsedJSON.Tags, nameTag, resourceName);
    }).startRequest();
}

exports.checkEc2ResourceTagName = checkEc2ResourceTagName;

function describeEc2ResourceForService(describeCommand, resourceResult, name, VpcId, AWSCLIUserProfile, waitForAtLeastOneResult, callback, retryCount) {
    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: describeCommand,
        parameters:{
            "filters": {type: "string", value: "Name=" + name + ",Values=" + VpcId},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'json',
        retryCount: 3,
        retryDelay: 5000
    },
    function (request) {
        if (!retryCount) {
            retryCount = 0;
        }
        if (request.response.error || retryCount === 3) {
            console.log(request.response.error);
            console.log("Unable to fetch " + resourceResult);
            if (request.response.error) {
                callback(request.response.error);
                return;
            }
            callback(new Error("Unable to fetch " + resourceResult));
            return;
        }
        if (waitForAtLeastOneResult && request.response.parsedJSON[resourceResult].length === 0) {
            setTimeout(function() {describeEc2ResourceForService(describeCommand, resourceResult, name, VpcId, AWSCLIUserProfile, waitForAtLeastOneResult, callback, retryCount + 1);}, 5000);
            return;
        }
        callback(null, request.response.parsedJSON[resourceResult]);
   }).startRequest();
}

exports.describeEc2ResourceForService = describeEc2ResourceForService;

function createEc2ResourceTag(resourceId, nameTag, AWSCLIUserProfile, callback) {
    AWSRequest.createRequest({
        serviceName: "ec2",
        functionName: "create-tags",
        parameters:{
            "resource": {type: "string", value: resourceId},
            "tags": {type: "string", value: "Key=Name,Value=" + nameTag},
            "profile": {type: "string", value: AWSCLIUserProfile}
        },
        returnSchema:'none',
        retryCount: 3,
        retryDelay: 5
    },
    function (request) {
        callback(request.response.error);
    }).startRequest();

}

exports.createEc2ResourceTag = createEc2ResourceTag;
