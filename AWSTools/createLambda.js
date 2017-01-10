#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const exec = require('child_process').exec;
const path = require('path');
const vp = require(path.join(__dirname, 'awscommonutils'));
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

    if (vp.verifyPath(definitions,['lambdaInfo', 'arnLambda'], 's', "definitions file \"" + fileName + "\"").isValidationErrpr && !argv.updateArnLambda) {
        throw new Error("There is already a \"arnLambda\" string in \"lambdaInfo\" object in definitions file \"" + fileName + "\". To overwrite this value when created run with option \"--updateArnLambda\".");
    }

    vp.verifyPath(definitions,['lambdaInfo','functionName'],'s', "definitions file \"" + fileName + "\"", "This should be the name of the lambda function.").exitOnError();

    // remove older archives
    if (fs.existsSync(path.join(argv.lambdaDefinitionsDir, definitions.lambdaInfo.functionName + ".zip"))) {
        fs.unlinkSync(path.join(argv.lambdaDefinitionsDir, definitions.lambdaInfo.functionName + ".zip"));
    }
    // fitst zip the archive we can drop them into the lambdas directory
    var cdCommand = "cd \"" + path.join(argv.lambdaDefinitionsDir,definitions.lambdaInfo.functionName) + "\"; ";
    var zipCommandString = (cdCommand + "zip -r " + path.join("..", definitions.lambdaInfo.functionName) + ".zip *");

    vp.verifyPath(definitions,['implementationFiles'],'o', "definitions file \"" + fileName + "\"").exitOnError();


    var functionHandler = definitions.implementationFiles[definitions.lambdaInfo.functionName][0];
    if (typeof functionHandler !== 'string') {
        console.log("Cannot find \"lambdaInfo.functionName\" as a key in \"implementationFiles\" in \"" + fileName + "\".");
    }

    //vp.verifyPath(definitions,['lambdaInfo','arnRole'],'s', "definitions file \"" + fileName + "\"").exitOnError();
    vp.verifyPath(definitions,['lambdaInfo', 'roleName'], 's', "definitions file \"" + fileName + "\"").exitOnError();

    vp.verifyPath(definitions,['lambdaInfo','language'],'s', "definitions file \"" + fileName + "\"").exitOnError();

    vp.verifyPath(baseDefinitions,['lambdaInfo', 'roleDefinitions', definitions.lambdaInfo.roleName, 'arnRole'],'s',"base definition file " + argv.baseDefinitionsFile).exitOnError();
    var arnRole = baseDefinitions.lambdaInfo.roleDefinitions[definitions.lambdaInfo.roleName].arnRole;

    functionHandler = path.basename(functionHandler, path.extname(functionHandler)) + ".handler";

    var lambdaName;
    if (baseDefinitions.environment.AWSResourceNamePrefix) {
        lambdaName = baseDefinitions.environment.AWSResourceNamePrefix + definitions.lambdaInfo.functionName;
    } else {
        lambdaName = definitions.lambdaInfo.functionName;
    }

    var params = {
        'role': {type: 'string', value: arnRole},
        'region': {type: 'string', value: definitions.lambdaInfo.region},
        'handler': {type: 'string', value: functionHandler},
        'function-name': {type: 'string', value: lambdaName},
        'runtime' : {type: 'string', value: definitions.lambdaInfo.language},
        'zip-file' : {type: 'fileNameBinary', value: path.join(argv.lambdaDefinitionsDir, definitions.lambdaInfo.functionName) + ".zip"},
        'profile' : {type: 'string', value:AWSCLIUserProfile}
    };

    // check to make sure everything compiles at least
    vp.validatejs(definitions, path.join(argv.lambdaDefinitionsDir, definitions.lambdaInfo.functionName));

    // capture values here by creating a function
    zipAndUpload(definitions.lambdaInfo.functionName, zipCommandString, params, path.join(argv.lambdaDefinitionsDir,fileName));

});

function createLambda(functionName, reqParams, defaultsFileName) {
    // lets upload!

    AWSRequest.createRequest({
        serviceName: "lambda",
        functionName: "create-function",
        context: {reqParams:reqParams, defaultsFileName:defaultsFileName, functionName: functionName},
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
                deleteLambda(request.context.functionName, request.context.reqParams, request.context.defaultsFileName);
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
                    throw request.response.console.error;
                }
            } else {
                throw request.response.error;
            }
        }
        console.log("Updating defaults file: \"" + defaultsFileName + "\"");
        var localDefinitions = YAML.load(defaultsFileName);
        vp.updateFile(defaultsFileName, function () {
            localDefinitions.lambdaInfo.arnLambda = request.response.parsedJSON.FunctionArn;
            return YAML.stringify(localDefinitions, 15);
        }, function (backupErr, writeErr) {
            if (backupErr) {
                console.log("Could not create backup of \"" + defaultsFileName + "\". arnLambda was not updated.");
                throw backupErr;
            }
            if (writeErr) {
                console.log("Unable to write updated definitions file.");
                throw writeErr;
            }
            console.log("Done.");
        });

    }).startRequest();
}

function zipAndUpload(functionName, zipCommand, reqParams, defaultsFileName) {
    exec(zipCommand, function (err, stdout, stderr) {
        if (err) {
            console.log(stdout);
            console.log(stderr);
            throw err;
        }
        console.log(stdout);
        if (!argv.archiveOnly) {
            createLambda(functionName, reqParams, defaultsFileName);
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

function deleteLambda(functionName, createParams, defaultsFileName) {
    var params = {
        'function-name': {type: 'string', value: createParams['function-name'].value},
        'profile' : {type: 'string', value:AWSCLIUserProfile}
    };
    var deleteRequest = AWSRequest.createRequest({
        serviceName: "lambda",
        functionName: "delete-function",
        context:{createParams: createParams, defaultsFileName: defaultsFileName, functionName: functionName},
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
        createLambda(request.context.functionName, request.context.createParams, request.context.defaultsFileName);
    });

    deleteRequest.on('AwsRequestRetry', function () {
        console.log("Warning: unable to delete lambda \"" + this.parameters["function-name"].value + "\" due to \"ServiceException\". This happens occasionally when deleting a number of lambdas at once. Trying again...");
    });

    deleteRequest.startRequest();
}
