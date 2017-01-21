#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const exec = require('child_process').exec;
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Get AWS API Gateway SDK for the project clients.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('l','clientDefinitionsDir')
.describe('l','directory that contains client definition files and implementations.')
.default('l','./clients')
.alias('n','clientName')
.describe('n','a specific client to process. If not specified all clients found will be uploaded')
.help('h')
.alias('h', 'help');
const argv = yargs.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
    console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
    yargs.showHelp("log");
    process.exit(1);
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

if (!fs.existsSync(argv.clientDefinitionsDir)) {
    yargs.showHelp("log");
    throw new Error("Clients path \"" + argv.clientDefinitionsDir + "\" not found.");
}

var AWSCLIUserProfile = "default";
if (!awsc.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
    AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
} else {
    console.log("using \"default\" AWSCLIUserProfile");
}

var awsRequests = [];
forEachClientDefinition(function (fileName) {
    // here we would want to fork to do ops in parallel
    var definitions = YAML.load(path.join(argv.clientDefinitionsDir,fileName));
    if (typeof definitions !== 'object') {
        throw new Error("Definitions file \"" + fileName + "\" could not be parsed");
    }
    var checks = [];
    checks.push(awsc.verifyPath(baseDefinitions,['apiInfo', 'awsId'], 's'));
    checks.push(awsc.verifyPath(baseDefinitions,['apiInfo', 'defaultDeployStage'], 's'));
    checks.push(awsc.verifyPath(definitions,['apiInfo', 'clientSDK', 'sdkType'], 's'));
    checks.push(awsc.verifyPath(definitions,['apiInfo', 'clientSDK', 'downloadPath'], 's'));

    var shouldSkip = false;
    checks.forEach(function (check){
        if (check.isVerifyError) {
            console.log(check);
            shouldSkip = true;
        }
    });

    if (shouldSkip) {
        console.log("Skipping '" + fileName + "'.");
        return;
    }

    var params = {
        'rest-api-id': {type: 'string', value:baseDefinitions.apiInfo.awsId},
        'stage-name': {type: 'string', value:baseDefinitions.apiInfo.defaultDeployStage},
        'sdk-type': {type: 'string', value:definitions.apiInfo.clientSDK.sdkType},
        profile: {type:'string', value:AWSCLIUserProfile}
    };

    // if there are parameters add them
    if (!awsc.verifyPath(definitions,['apiInfo', 'clientSDK', 'parameters'], 'o').isVerifyError) {
        var paramstrings = [];
        Object.keys(definitions.apiInfo.clientSDK.parameters).forEach(function (parameter) {
            paramstrings.push(parameter + "='" + definitions.apiInfo.clientSDK.parameters[parameter] + "'");
        });
        params.parameters = {type: 'string', value:paramstrings.join(',')};
    }

    awsc.createPath(path.join(argv.clientDefinitionsDir, definitions.apiInfo.clientSDK.downloadPath));

    awsRequests.push(
        AWSRequest.createRequest(
            {
                serviceName: "apigateway",
                functionName: "get-sdk",
                context:{fileName: fileName, downloadPath: definitions.apiInfo.clientSDK.downloadPath, clientDefinitions: definitions},
                parameters: params,
                outFile: path.join(argv.clientDefinitionsDir, definitions.apiInfo.clientSDK.downloadPath, "api.zip"),
                returnSchema: 'json',
                returnValidation:[{path:['contentType'], type:'s'},
                {path:['contentDisposition'], type:'s'}]
            }
        )
    );
},
function() {
    AWSRequest.createBatch(awsRequests, function (batchRequest){
        var someFailed = false;
        batchRequest.requestArray.forEach(function (request) {
            if (request.response.error) {
                console.log("Failed to retrieve SDK for definitions file: " + request.context.fileName);
                console.log(request.response.error);
                someFailed = true;
            } else {
                console.log(request.response.parsedJSON);
                console.log("Successfully retrieved SDK for definitions file: " + request.context.fileName);
                exec("cd '" + path.join(argv.clientDefinitionsDir, request.context.downloadPath) + "'; unzip -o " + "api.zip", function (err, stdout) {
                    if (err) {
                        console.log(stdout);
                        console.log(err);
                        process.exitCode = 1;
                    } else {
                        console.log(stdout);
                        console.log("Updated SDK for definitions file: " + request.context.fileName);
                        // iOS clients may want to change the class name of the auth client because
                        // it is composed of Prefix+APIName+AuthClient
                        renameAuthClientClass(request.context.clientDefinitions, request.context.fileName, path.join(argv.clientDefinitionsDir, request.context.downloadPath));
                   }
                });
            }
        });
        if (someFailed) {
            process.exitCode = 1;
        }
    }).startRequest();
}
);

function forEachClientDefinition (callback, doneCallback) {
    fs.readdir(argv.clientDefinitionsDir, function (err, files) {
        if (err) {
            throw err;
        }

        for (var index = 0; index < files.length; index++) {
            var fileName = files[index];
            var fileNameComponents = fileName.split('.');
            if ((fileNameComponents.length === 3) && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
                console.log("Reading: " + fileName);
                var writeOut = true;
                if ((typeof argv.clientName === 'string') && (argv.clientName !== fileNameComponents[0])) {
                    console.log("Not target API. Skipping.");
                    writeOut = false;
                }
                if (writeOut) {
                    callback(fileName);
                }
            }
        }
        doneCallback();
    });
}

function renameAuthClientClass(definitions, fileName, basePath) {
    if (definitions.apiInfo.clientSDK.sdkType === 'objectivec' &&
    !awsc.verifyPath(definitions,['apiInfo', 'clientSDK', 'renameAuthClientClass'], 's').isVerifyError) {
        var check = awsc.verifyPath(definitions,['apiInfo', 'clientSDK', 'parameters', 'classPrefix'], 's');
        if (check.isVerifyError) {
            console.log(check);
            return;
        }
        var currentName = definitions.apiInfo.clientSDK.parameters.classPrefix;
        currentName = currentName.toUpperCase();
        // now add the api name from the base definitions file (need to capitalize first letter)
        var apiName;
        if (awsc.isValidAWSResourceNamePrefix(baseDefinitions, argv.baseDefinitionsFile)) {
          apiName = baseDefinitions.environment.AWSResourceNamePrefix + baseDefinitions.apiInfo.title;
        }
        if (apiName && apiName.length >= 0) {
            apiName = apiName.charAt(0).toUpperCase() + apiName.slice(1);
            currentName += apiName + "Client";
            var classPath = path.join(basePath, "aws-apigateway-ios", "generated-src");
            renameObjcClass(classPath, currentName, definitions.apiInfo.clientSDK.renameAuthClientClass);
        } else {
            console.log("Invalid API Name when renaming the Auth Client for definitions file " + fileName);
            return;
        }
   }
}

function renameObjcClass(classPath, currentClassName, newClassName) {
    [".m", ".h"].forEach(function (ext) {
        var oldFileName = path.join(classPath, currentClassName + ext);
        var newFileName = path.join(classPath, newClassName + ext);
        var inFile = fs.readFileSync(oldFileName, "utf8");
        var regexp = new RegExp( "([^@][^\"])" + currentClassName, "g");
        console.log("Looking for '" + currentClassName + "'");
        var outFile =  inFile.replace(regexp, "$1" + newClassName);
        var regexp2 = new RegExp("([^@]\")" + currentClassName, "g");
        outFile = outFile.replace(regexp2,  "$1" + newClassName);
        saveNewDeletingOld(outFile, newFileName, oldFileName, function (err, newFileName) {
            if (err) {
                console.log("Couldn't save updated Client class " + newClassName);
            } else {
                console.log("Updated Client class to " + newFileName);
            }
        });

    });
 }

function saveNewDeletingOld(outFile, newFileName, oldFileName, callback) {
    fs.writeFile(newFileName, outFile, function(err) {
        if (err) {
           callback(err, newFileName);
        } else {
            fs.unlinkSync(oldFileName);
            callback(null, newFileName);
        }
    });
}
