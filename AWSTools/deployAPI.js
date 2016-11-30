#!/usr/bin/env node

var fs = require('fs');
var YAML = require('yamljs');
const exec = require('child_process').exec;
const path = require('path')
const awsc = require(path.join(__dirname, 'awscommonutils'));

var YAML = require('yamljs');
var yargs = require('yargs')
.usage('Deploy API to a stage.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that containes information about your API')
.default('s','./base.definitions.yaml')
.alias('d','description')
.describe('d','The description for the  Deployment resource to create.')
.default('d', 'Yet another deploy...')
.alias('t','stageName')
.describe('t','The name of the Stage resource for the Deployment resource to create.')
.default('t','dev')
.help('h')
.alias('h', 'help')
var argv = yargs.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
  console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.")
  yargs.showHelp("log");
  process.exit(1);
}
var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);
if (typeof baseDefinitions.apiInfo == 'object') {
  if (typeof baseDefinitions.apiInfo.awsId != 'string') {
    console.log("\"awsId\" in \"apiInfo\" section of base definitions file \"" + argv.baseDefinitionsFile + "\" was not found. Was the API already deleted?");
    process.exit(1);
  }
}

var AWSCLIUserProfile = "default"
if (typeof baseDefinitions.enviroment != 'object') {
} else {
  if (typeof baseDefinitions.enviroment.AWSCLIUserProfile == 'string') {
    AWSCLIUserProfile = baseDefinitions.enviroment.AWSCLIUserProfile;
  }
}

if (AWSCLIUserProfile === "default") {
  console.log("Using \"default\" AWSCLIUserProfile");
}

if (typeof baseDefinitions.apiInfo.defaultDeployStage == 'string') {
  console.log("Using \"defaultDeployStage\" specified in  \"argv.baseDefinitionsFile\".");
  argv.stageName = baseDefinitions.apiInfo.defaultDeployStage;
}

var params = ['apigateway',
              'create-deployment',
              '--rest-api-id ' + baseDefinitions.apiInfo.awsId,
              '--stage-name ' + argv.stageName,
              '--description ' + "\"" + argv.description + "\"",
              '--profile ' + AWSCLIUserProfile];

console.log("Deploying API")

const child = exec('aws ' + params.join(" "), (err, stdout, stderr) => {
  if (err) {
    // parse error to see if resource exists
    console.log(err)
    console.log(stderr);
    var existsMatches = stderr.toString('utf8').match(/NotFoundException/g);
    if (existsMatches && existsMatches.length > 0) {
      console.log("API was not found. Perhaps it is deleted?");
    }
    var tooManyReqMatches = stderr.toString('utf8').match(/TooManyRequestsException/g);
    if (tooManyReqMatches && tooManyReqMatches.length > 0) {
      console.log("Too many requests to delete. Try again later?");
    }

    process.exit(1);
  }
  console.log(stdout);

  // no response on delete

  console.log("Deployed API \"" + baseDefinitions.apiInfo.awsId + "\" to \"" + argv.stageName + "\"")

  if (stdout) {
    var parsedOutput = JSON.parse(stdout);
    if (parsedOutput) {
      console.log("Updating defaults file: \"" + argv.baseDefinitionsFile + "\" with \"apiInfo.lastDeploy\"");

      awsc.updateFile(argv.baseDefinitionsFile, function () {
        baseDefinitions.apiInfo["lastDeploy"] = {};
        baseDefinitions.apiInfo.lastDeploy["uploadResult"] = parsedOutput;
        baseDefinitions.apiInfo.lastDeploy["invokeURL"] = 'https://' + baseDefinitions.apiInfo.awsId + ".execute-api." + baseDefinitions.apiInfo.region + ".amazonaws.com/" + argv.stageName;
        console.log("Invocation URL: \"" + baseDefinitions.apiInfo.lastDeploy["invokeURL"] + "\"");
        return YAML.stringify(baseDefinitions, 15);
      }, function (backupErr, writeErr) {
        if (backupErr) {
          console.log(backupErr);
          console.log("Could not create backup of \"" + argv.baseDefinitionsFile + "\". \"apiInfo.lastDeploy\" was not updated.");
          process.exit(1);
        }
        if (writeErr) {
          console.log(writeErr);
          console.log("Unable to write updated definitions file.");
          process.exit(1)
        }
        console.log("Done.")
      });
    }
  }
});
