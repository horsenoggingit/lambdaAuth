#!/usr/bin/env node


const fs = require('fs');
const YAML = require('yamljs');
const exec = require('child_process').exec;
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'))
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

var yargs = require('yargs')
.usage('Create the lambdas for the project.\nIf a lambda with the same name already exists the operation will fail.\nUse "deleteLambda" first to remove the exisiting function.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that containes information about your API')
.default('s','./base.definitions.yaml')
.alias('l','clientDefinitionsDir')
.describe('l','directory that containes client definition files and implementations.')
.default('l','./clients')
.alias('n','clientName')
.describe('n','a specific client to process. If not specified all clients found will be uploaded')
.help('h')
.alias('h', 'help')
var argv = yargs.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
  console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.")
  yargs.showHelp("log");
  process.exit(1);
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

if (!fs.existsSync(argv.clientDefinitionsDir)) {
  yargs.showHelp("log");
  throw newError("Clients path \"" + argv.clientDefinitionsDir + "\" not found.")
}

var AWSCLIUserProfile = "default";
if (!awsc.verifyPath(baseDefinitions,['enviroment', 'AWSCLIUserProfile'],'s').isVerifyError) {
  AWSCLIUserProfile = baseDefinitions.enviroment.AWSCLIUserProfile;
} else {
  console.log("using \"default\" AWSCLIUserProfile");
}

var awsRequests = [];
forEachLambdaDefinition(function (fileName) {
  // here we would want to fork to do ops in parallel
  var definitions = YAML.load(path.join(argv.clientDefinitionsDir,fileName));
  if (typeof definitions != 'object') {
    throw new Error("Definitions file \"" + fileName + "\" could not be parsed");
  }
  var params = {
    'rest-api-id': {type: 'string', value:baseDefinitions.apiInfo.awsId},
    'stage-name': {type: 'string', value:baseDefinitions.apiInfo.defaultDeployStage},
    'sdk-type': {type: 'string', value:definitions.apiInfo.clientSDK.sdkType},
    profile: {type:'string', value:AWSCLIUserProfile}
  }

  if (typeof definitions.apiInfo.clientSDK.parameters == 'object') {
    var paramstrings = [];
    Object.keys(definitions.apiInfo.clientSDK.parameters).forEach(function (parameter) {
      paramstrings.push(parameter + "='" + definitions.apiInfo.clientSDK.parameters[parameter] + "'");
    });
    params['parameters'] = {type: 'string', value:paramstrings.join(',')};
  }
  awsRequests.push(
    AWSRequest.createRequest(
      {
        serviceName: "apigateway",
        functionName: "get-sdk",
        context:{fileName: fileName, downloadPath: definitions.apiInfo.clientSDK.downloadPath},
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
          console.log(request.response.error)
          someFailed = true;
        } else {
          console.log(request.response.parsedJSON)
          console.log("Successfully retrieved SDK for definitions file: " + request.context.fileName);
          exec("cd '" + path.join(argv.clientDefinitionsDir, request.context.downloadPath) + "'; unzip -o " + "api.zip", function (err, stdout, stderr) {
            if (err) {
              console.log(stdout);
              console.log(err);
              process.exitCode = 1;
            } else {
              console.log(stdout);
              console.log("Updated SDK for definitions file: " + request.context.fileName);
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



function forEachLambdaDefinition (callback, doneCallback) {
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
        if ((typeof argv.clientName == 'string') && (argv.clientName !== fileNameComponents[0])) {
          console.log("Not target API. Skipping.");
          writeOut = false;
        }
        if (writeOut) {
          callback(fileName)
        }
      }
    }
    doneCallback();
  });
}