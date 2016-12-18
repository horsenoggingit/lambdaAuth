#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'))
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

var yargs = require('yargs')
.usage('Deletes the s3 bucket and removes it from the client defiition file.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that containes information about your API')
.default('s','./base.definitions.yaml')
.alias('l','clientDefinitionsDir')
.describe('l','directory that containes client definition files and implementations.')
.default('l','./clients')
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

  if (!awsc.verifyPath(definitions, ['s3Info', 'bucketInfo', 'name'], 's', 'in angular client definition file').isVerifyError) {
    awsc.verifyPath(definitions, ['s3Info', 'bucketInfo', 'namePrefix'], 's', 'in angular client definition file').exitOnError();
    // no bucket - lets create one.
    deleteBucket(definitions, function (err, definitions) {
      delete definitions.s3Info.bucketInfo.name;
      delete definitions.s3Info.bucketInfo.location;
      writeOut(path.join(argv.clientDefinitionsDir, fileName), definitions, "bucket name was not removed.", function () {
        console.log("Done.")
      });
    })
  } else {
    console.log('No bucket name found.');
  }
})

function deleteBucket(definitions, callback) {

  AWSRequest.createRequest(
    {
      serviceName: "s3api",
      functionName: "delete-bucket",
      context:{definitions : definitions},
      parameters: {
        'bucket' : {type:'string', value:definitions.s3Info.bucketInfo.name},
        'profile' : {type:'string', value:AWSCLIUserProfile}
      },
      returnSchema: 'none',
    },
    function (request) {
      callback(request.response.error, definitions);
    }
  ).startRequest();
}

function forEachLambdaDefinition (callback, doneCallback) {
  fs.readdir(argv.clientDefinitionsDir, function (err, files) {
    if (err) {
      throw err;
    }

    for (var index = 0; index < files.length; index++) {
      var fileName = files[index];
      var fileNameComponents = fileName.split('.');
      if ((fileNameComponents.length === 3) && (fileNameComponents[0] === 'angular') && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
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
    if (doneCallback) {
      doneCallback();
    }
  });
}

function writeOut(fileName, data, errorMsg, callback) {
  awsc.updateFile(fileName, function () {
    return YAML.stringify(data, 15);
  }, function (backupErr, writeErr) {
    if (backupErr) {
      console.log("Could not create backup of \"" + fileName + "\". " + errorMsg);
      throw backupErr;
    }
    if (writeErr) {
      console.log("Unable to write updated definitions file.");
      throw writeErr;
    }
    callback();
  });
}
