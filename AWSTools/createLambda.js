#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const exec = require('child_process').exec;
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Create the lambdas for the project.\nIf a lambda with the same name already exists the operation will fail.\nUse "deleteLambda" first to remove the exisiting function.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('l','lambdaDefinitionsDir')
.describe('l','directory that contains lambda definition files and implementations. <lambdaName>.zip archives will be placed here.')
.default('l','./lambdas')
.alias('n','lambdaName')
.describe('n','a specific lambda to process. If not specified all lambdas found will be uploaded')
.alias('a','archiveOnly')
.describe('a','Only perform archive operation. Do not upload')
.alias('u','updateArnLambda')
.describe('u', 'ignore existing \"arnLambda\" in \"lambdaInfo\" section of definitions file and overwrite new value on success')
.help('h')
.alias('h', 'help');
const argv = yargs.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
    yargs.showHelp("log");
    throw new Error("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

console.log("## Creating Lambdas ##");

if (!fs.existsSync(argv.lambdaDefinitionsDir)) {
    yargs.showHelp("log");
    throw new Error("Lambda's path \"" + argv.lambdaDefinitionsDir + "\" not found.");
}

var AWSCLIUserProfile = "default";
if (typeof baseDefinitions.environment !== 'object') {
} else {
    if (typeof baseDefinitions.environment.AWSCLIUserProfile === 'string') {
        AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
    }
}

if (AWSCLIUserProfile === "default") {
    console.log("using \"default\" AWSCLIUserProfile");
}

forEachLambdaDefinition(function (fileName) {
    // here we would want to fork to do ops in parallel
    var definitions = YAML.load(path.join(argv.lambdaDefinitionsDir,fileName));
    if (typeof definitions !== 'object') {
        throw new Error("Definitions file \"" + fileName + "\" could not be parsed");
    }

    if (awsc.verifyPath(definitions,['lambdaInfo', 'arnLambda'], 's', "definitions file \"" + fileName + "\"").isValidationErrpr && !argv.updateArnLambda) {
        throw new Error("There is already a \"arnLambda\" string in \"lambdaInfo\" object in definitions file \"" + fileName + "\". To overwrite this value when created run with option \"--updateArnLambda\".");
    }

    awsc.verifyPath(definitions,['lambdaInfo','functionName'],'s', "definitions file \"" + fileName + "\"", "This should be the name of the lambda function.").exitOnError();

    // remove older archives
    if (fs.existsSync(path.join(argv.lambdaDefinitionsDir, definitions.lambdaInfo.functionName + ".zip"))) {
        fs.unlinkSync(path.join(argv.lambdaDefinitionsDir, definitions.lambdaInfo.functionName + ".zip"));
    }
    // fitst zip the archive we can drop them into the lambdas directory
    var cdCommand = "cd \"" + path.join(argv.lambdaDefinitionsDir,definitions.lambdaInfo.functionName) + "\"; ";
    var zipCommandString = (cdCommand + "zip -r " + path.join("..", definitions.lambdaInfo.functionName) + ".zip *");

    awsc.verifyPath(definitions,['implementationFiles'],'o', "definitions file \"" + fileName + "\"").exitOnError();


    var functionHandler = definitions.implementationFiles[definitions.lambdaInfo.functionName][0];
    if (typeof functionHandler !== 'string') {
        console.log("Cannot find \"lambdaInfo.functionName\" as a key in \"implementationFiles\" in \"" + fileName + "\".");
    }

    //awsc.verifyPath(definitions,['lambdaInfo','arnRole'],'s', "definitions file \"" + fileName + "\"").exitOnError();
    awsc.verifyPath(definitions,['lambdaInfo', 'roleName'], 's', "definitions file \"" + fileName + "\"").exitOnError();

    awsc.verifyPath(definitions,['lambdaInfo','language'],'s', "definitions file \"" + fileName + "\"").exitOnError();

    awsc.verifyPath(baseDefinitions,['lambdaInfo', 'roleDefinitions', definitions.lambdaInfo.roleName, 'arnRole'], 's', "base definition file " + argv.baseDefinitionsFile).exitOnError();
    var arnRole = baseDefinitions.lambdaInfo.roleDefinitions[definitions.lambdaInfo.roleName].arnRole;

    functionHandler = path.basename(functionHandler, path.extname(functionHandler)) + ".handler";

    var lambdaName;
    if (awsc.isValidAWSResourceNamePrefix(baseDefinitions, argv.baseDefinitionsFile)) {
        lambdaName = baseDefinitions.environment.AWSResourceNamePrefix + definitions.lambdaInfo.functionName;
    }

    var params = {
        'role': {type: 'string', value: arnRole},
        'timeout': {type: 'string', value: "30"},
        'region': {type: 'string', value: definitions.lambdaInfo.region},
        'handler': {type: 'string', value: functionHandler},
        'function-name': {type: 'string', value: lambdaName},
        'runtime' : {type: 'string', value: definitions.lambdaInfo.language},
        'zip-file' : {type: 'fileNameBinary', value: path.join(argv.lambdaDefinitionsDir, definitions.lambdaInfo.functionName) + ".zip"},
        'profile' : {type: 'string', value:AWSCLIUserProfile}
    };

    awsc.addLambdaVPCConfiguration(params, definitions, fileName, baseDefinitions, argv.baseDefinitionsFile);

    // check to make sure everything compiles at least
    awsc.validatejs(definitions, path.join(argv.lambdaDefinitionsDir, definitions.lambdaInfo.functionName));

    // capture values here by creating a function
    zipAndUpload(definitions, zipCommandString, params, path.join(argv.lambdaDefinitionsDir, fileName), function (definitions) {
        // now check to see if any s3 buckets trigger this lambda
        addS3Triggers(definitions, function () {

        });
    });

});

function addS3Triggers (definitions, callback){
    if (!awsc.verifyPath(definitions, ['s3Info', 'buckets'], 'o').isVerifyError) {
        Object.keys(definitions.s3Info.buckets).forEach(function (bucketName) {
            console.log("Adding events to s3 bucket '" + bucketName + "' for lambda '" + definitions.lambdaInfo.functionName + "'.");
            // check to make sure this bucket exists and has a real (instance) name
            if (!awsc.verifyPath(baseDefinitions, ['s3Info', 'buckets', bucketName, 'name'], 's').isVerifyError) {
                // check to make sure we actually have some triggers
                if (!awsc.verifyPath(definitions, ['s3Info', 'buckets', bucketName, 'Events'], 'a').isVerifyError) {
                    // first give the lambda the permission to be triggered by S3
                    AWSRequest.createRequest({
                        serviceName: "lambda",
                        functionName: "add-permission",
                        parameters: {
                            'function-name': {type: 'string', value: definitions.lambdaInfo.arnLambda},
                            'profile' : {type: 'string', value:AWSCLIUserProfile},
                            'statement-id' : {type: 'string', value: bucketName + "-" + definitions.lambdaInfo.functionName + "-" + "action"},
                            'action' : {type: 'string', value: "lambda:InvokeFunction"},
                            'principal' : {type: 'string', value: "s3.amazonaws.com"},
                            'source-arn' : {type: 'string', value: "arn:aws:s3:::" + baseDefinitions.s3Info.buckets[bucketName].name}
                        },
                        returnSchema:'none',
                    },
                    function (request) {
                        if (request.response.error) {
                            throw request.response.error;
                        }
                        // now we can create an object to convert to json for the event.
                        // eventually we'll want to collect all of the s3 info from all the lambdas to make this proper.
                        var notificationConfiguration = {
                            LambdaFunctionConfigurations: [{
                                Id: definitions.lambdaInfo.functionName,
                                LambdaFunctionArn: definitions.lambdaInfo.arnLambda,
                                Events: definitions.s3Info.buckets[bucketName].Events,
                            }]
                        };
                        AWSRequest.createRequest({
                            serviceName: "s3api",
                            functionName: "put-bucket-notification-configuration",
                            parameters: {
                                'bucket': {type: 'string', value: baseDefinitions.s3Info.buckets[bucketName].name},
                                'profile' : {type: 'string', value:AWSCLIUserProfile},
                                'notification-configuration' : {type: 'JSONObject', value: notificationConfiguration}
                            },
                            returnSchema:'none',
                        },
                        function (request) {
                            if (request.response.error) {
                                throw request.response.error;
                            }
                            if (callback) {
                                callback(definitions);
                            }
                        }).startRequest();
                   }).startRequest();
               } else {
                    console.log("No trigger events defined for bucket name '" + bucketName + "' when adding event for lambda '" + definitions.lambdaInfo.functionName + "'.");
                }
            } else {
                throw new Error("Invalid bucket name '" + bucketName + "' when adding event for lambda '" + definitions.lambdaInfo.functionName + "'.");
            }
        });
    }
}

function createLambda(definitions, reqParams, defaultsFileName, callback) {
    // lets upload!

    AWSRequest.createRequest({
        serviceName: "lambda",
        functionName: "create-function",
        context: {reqParams:reqParams, defaultsFileName:defaultsFileName, definitions: definitions},
        parameters:reqParams,
        returnSchema:'json',
        returnValidation:[{path:['FunctionArn'], type:'s'},
        {path:['FunctionName'], type:'s'}]
    },
    function (request) {
        if (request.response.error) {
            if (request.response.errorId === 'ResourceConflictException') {
                // delete and recreate the lambda
                console.log("Lambda \"" + request.context.reqParams['function-name'].value + "\" already exists. Deleting and re-creating.");
                deleteLambda(request.context.definitions, request.context.reqParams, request.context.defaultsFileName, callback);
                return;
            } else if (request.response.errorId === 'InvalidParameterValueException') {
                // retry
                if (request.retryCount < 3) {
                    console.log("retrying \"" + request.parameters['function-name'].value + "\"...");
                    setTimeout(function(){
                        request.retry();
                    }, 3000);
                    return;
                } else {
                    throw request.response.error;
                }
            } else {
                throw request.response.error;
            }
        }
        console.log("Updating defaults file: \"" + defaultsFileName + "\"");
        awsc.updateFile(defaultsFileName, function () {
            request.context.definitions.lambdaInfo.arnLambda = request.response.parsedJSON.FunctionArn;
            return YAML.stringify(request.context.definitions, 15);
        }, function (backupErr, writeErr) {
            if (backupErr) {
                console.log("Could not create backup of \"" + defaultsFileName + "\". arnLambda was not updated.");
                throw backupErr;
            }
            if (writeErr) {
                console.log("Unable to write updated definitions file.");
                throw writeErr;
            }
            callback(request.context.definitions);
        });

    }).startRequest();
}

function zipAndUpload(definitions, zipCommand, reqParams, defaultsFileName, callback) {
    exec(zipCommand, function (err, stdout, stderr) {
        if (err) {
            console.log(stdout);
            console.log(stderr);
            throw err;
        }
        console.log(stdout);
        if (!argv.archiveOnly) {
            createLambda(definitions, reqParams, defaultsFileName, callback);
        }
    });
}

function forEachLambdaDefinition (callback) {
    fs.readdir(argv.lambdaDefinitionsDir, function (err, files) {
        if (err) {
            console.log(err);
            process.exit(1);
        }

        for (var index = 0; index < files.length; index++) {
            var fileName = files[index];
            var fileNameComponents = fileName.split('.');
            if ((fileNameComponents.length === 3) && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
                console.log("Reading: " + fileName);
                var writeOut = true;
                if ((typeof argv.lambdaName === 'string') && (argv.lambdaName !== fileNameComponents[0])) {
                    console.log("Not target lambda. Skipping.");
                    writeOut = false;
                }
                if (writeOut) {
                    callback(fileName);
                }
            }
        }
    });
}

function deleteLambda(definitions, createParams, defaultsFileName, callback) {
    var params = {
        'function-name': {type: 'string', value: createParams['function-name'].value},
        'profile' : {type: 'string', value:AWSCLIUserProfile}
    };
    var deleteRequest = AWSRequest.createRequest({
        serviceName: "lambda",
        functionName: "delete-function",
        context:{createParams: createParams, defaultsFileName: defaultsFileName, definitions: definitions},
        parameters: params,
        retryCount: 3,
        retryErrorIds: ['ServiceException'],
        retryDelay: 2000,
        returnSchema:'none'
    },
    function (request) {
        if (request.response.error) {
            if (request.response.errorId === 'ResourceNotFoundException') {
                console.log("Warning: lambda \"" + request.parameters["function-name"].value + "\" not found.");
            } else {
                throw request.response.error;
            }
        }
        console.log("Deleted lambda \"" + request.parameters["function-name"].value + "\"");
        createLambda(definitions, request.context.createParams, request.context.defaultsFileName, callback);
    });

    deleteRequest.on('AwsRequestRetry', function () {
        console.log("Warning: unable to delete lambda \"" + definitions.lambdaInfo.functionName + "\" due to \"ServiceException\". This happens occasionally when deleting a number of lambdas at once. Trying again...");
    });

    deleteRequest.startRequest();
}
