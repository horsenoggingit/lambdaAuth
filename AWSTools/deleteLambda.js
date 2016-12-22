#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const exec = require('child_process').exec;
const path = require('path');
const vp = require(path.join(__dirname, 'awscommonutils'))
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

var yargs = require('yargs')
.usage('Delete the project lambdas.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('l','lambdaDefinitionsDir')
.describe('l','directory that contains lambda definition files and implementations. <lambdaName>.zip archives will be placed here.')
.default('l','./lambdas')
.alias('n','lambdaName')
.describe('n','a specific lambda to process. If not specified all lambdas found will be uploaded')
.help('h')
.alias('h', 'help')
var argv = yargs.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
  console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.")
  yargs.showHelp("log");
  process.exit(1);
}
var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

if (!fs.existsSync(argv.lambdaDefinitionsDir)) {
  console.log("Lambda's path \"" + argv.lambdasPath + "\" not found.")
  yargs.showHelp("log");
  process.exit(1);
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

var AWSCLIUserProfile = "default"
if (typeof baseDefinitions.environment != 'object') {
} else {
  if (typeof baseDefinitions.environment.AWSCLIUserProfile == 'string') {
    AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
  }
}

if (AWSCLIUserProfile === "default") {
  console.log("using \"default\" AWSCLIUserProfile");
}

forEachLambdaDefinition(function (fileName) {
  // here we would want to fork to do ops in parallel
  var definitions = YAML.load(path.join(argv.lambdaDefinitionsDir,fileName));
  if (typeof definitions != 'object') {
    throw new Error("Definitions file \"" + fileName + "\" could not be parsed")
  }

  if (vp.verifyPath(definitions,['lambdaInfo', 'arnLambda'], 's', "definitions file \"" + fileName + "\"").isValidationErrpr) {
    throw new Error("There is no a \"arnLambda\" string in \"lambdaInfo\" object in definitions file \"" + fileName + "\".");
  }

  vp.verifyPath(definitions,['lambdaInfo', 'functionName'], 's', "definitions file \"" + fileName + "\"").exitOnError();

  var params = {
    'function-name': {type: 'string', value: definitions.lambdaInfo.functionName},
    'profile' : {type: 'string', value:AWSCLIUserProfile}
  };

  // capture values here by creating a function
  deleteLambda(params, path.join(argv.lambdaDefinitionsDir,fileName));

});

function deleteLambda(reqParams, defaultsFileName) {
  var deleteRequest = AWSRequest.createRequest({
    serviceName: "lambda",
    functionName: "delete-function",
    parameters:reqParams,
    retryCount: 3,
    retryErrorIds: ['ServiceException'],
    retryDelay: 2000,
    returnSchema:'none'
  },
  function (request) {
    if (request.response.error) {
      if (request.response.errorId === 'ResourceNotFoundException') {
        console.log("Warning: lambda \"" + request.parameters["function-name"].value + "\" not found.")
      } else {
        throw request.response.error;
      }
    }
    console.log("Deleted lambda \"" + request.parameters["function-name"].value + "\"")
    console.log("Updating defaults file: \"" + defaultsFileName + "\"");
    var localDefinitions = YAML.load(defaultsFileName);
    vp.updateFile(defaultsFileName, function () {
      delete localDefinitions.lambdaInfo["arnLambda"];
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
  });

  deleteRequest.on('AwsRequestRetry', function () {
    console.log("Warning: unable to delete lambda \"" + this.parameters["function-name"].value + "\" due to \"ServiceException\". This happens occasionally when deleting a number of lambdas at once. Trying again...");
  });

  deleteRequest.startRequest();
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
        if ((typeof argv.lambdaName == 'string') && (argv.lambdaName !== fileNameComponents[0])) {
          console.log("Not target lambda. Skipping.");
          writeOut = false;
        }
        if (writeOut) {
          callback(fileName)
        }
      }
    }
  });
}
