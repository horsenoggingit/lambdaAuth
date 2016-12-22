#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const exec = require('child_process').exec;
const path = require('path');

var yargs = require('yargs')
.usage('Update project lambdas.\n"createLambda" should have been previously called.\n"Usage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('l','lambdaDefinitionsDir')
.describe('l','directory that contains lambda definition files and implementations')
.default('l','./lambdas')
.alias('l','lambdaDefinitionsDir')
.describe('l','directory that contains lambda definition files and implementations. <lambdaName>.zip archives will be placed here.')
.default('l','./lambdas')
.alias('n','lambdaName')
.describe('n','a specific lambda to process. If not specified all lambdas found will be uploaded')
.alias('a','archiveOnly')
.describe('a','Only perform archive operation. Do not upload')
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
    console.log("Definitions file \"" + fileName + "\" could not be parsed")
    process.exit(1)
  }
  if (typeof definitions.lambdaInfo != 'object') {
    console.log("The \"lambdaInfo\" object in definitions file \"" + fileName + "\" could not be found.")
    process.exit(1)
  }
  if (typeof definitions.lambdaInfo.arnLambda != 'string') {
    console.log("The \"arnLambda\" string in \"lambdaInfo\" object in definitions file \"" + fileName + "\" could not be found. Has this lambda been created? Try \"createLambda\".");
    process.exit(1)
  }
  if (typeof definitions.lambdaInfo.functionName != 'string') {
    console.log("The \"functionName\" string in \"lambdaInfo\" object in definitions file \"" + fileName + "\" could not be found. This should be the name of the lambda function");
    process.exit(1)
  }
  // remove older archives
  if (fs.existsSync(path.join(argv.lambdaDefinitionsDir, definitions.lambdaInfo.functionName + ".zip"))) {
    fs.unlinkSync(path.join(argv.lambdaDefinitionsDir, definitions.lambdaInfo.functionName + ".zip"))
  }
  // fitst zip the archive we can drop them into the lambdas directory
  var cdCommand = "cd \"" + path.join(argv.lambdaDefinitionsDir,definitions.lambdaInfo.functionName) + "\"; "
  var zipCommandString = (cdCommand + "zip -r " + path.join("..", definitions.lambdaInfo.functionName) + ".zip *");
  var params = ['lambda',
            'update-function-code',
            '--function-name ' + definitions.lambdaInfo.arnLambda,
            '--zip-file fileb://' + path.join(argv.lambdaDefinitionsDir, definitions.lambdaInfo.functionName) + ".zip",
            '--profile ' + AWSCLIUserProfile
          ];

  var uploadCommandString = ('aws ' + params.join(' '));
  // capture values here by creating a function
  zipAndUpload(zipCommandString, uploadCommandString);
});

function forEachLambdaDefinition (callback) {
  fs.readdir(argv.lambdaDefinitionsDir, function (err, files) {
    if (err) {
      console.log(err);
      process.exit(1);
    }

    for (var index = 0; index < files.length; index++) {
      var fileName = files[index];
      var fileNameComponents = fileName.split('.');
      if ((fileNameComponents.length == 3) && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
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

function zipAndUpload(zipCommand, uploadCommand) {
  exec(zipCommand, function (err, stdout, stderr) {
    if (err) {
      console.log(err)
      console.log(stdout);
      console.log(stderr);
      process.exit(1);
    }
    console.log(stdout);
    if (!argv.archiveOnly) {
      // lets upload!
      exec(uploadCommand, function (err, stdout, stderr) {
        if (err) {
          console.log(err)
          console.log(stdout);
          console.log(stderr);
          process.exit(1);
        }
        console.log(stdout)
      });
    }
  });
}
