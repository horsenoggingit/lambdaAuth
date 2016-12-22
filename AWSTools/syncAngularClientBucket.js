#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'))
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

var yargs = require('yargs')
.usage('Syncs client angular files to their s3 bucket. Creates the bucket if needed and configures as static web host.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('l','clientDefinitionsDir')
.describe('l','directory that contains client definition files and implementations.')
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
if (!awsc.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
  AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
} else {
  console.log("using \"default\" AWSCLIUserProfile");
}

var awsRequests = [];
console.log("Syncing angular client files to s3 bucket.")
forEachLambdaDefinition(function (fileName) {
  // here we would want to fork to do ops in parallel
  var definitions = YAML.load(path.join(argv.clientDefinitionsDir,fileName));
  if (typeof definitions != 'object') {
    throw new Error("Definitions file \"" + fileName + "\" could not be parsed");
  }

  if ((!awsc.verifyPath(definitions, ['s3Info', 'bucketInfo', 'name'], 's', 'in angular client definition file').isVerifyError) &&
      (!awsc.verifyPath(definitions, ['s3Info', 'fileSyncInfo', 'syncPath'], 's', 'in angular client definition file').isVerifyError)) {

    console.log("Syncing bucket \"" + definitions.s3Info.bucketInfo.name + "\".");
    syncFiles(definitions, function (err, definitions) {
      if (err) {
        throw err;
      } else {
        console.log('Site URL is: http://' + definitions.s3Info.bucketInfo.name + ".s3-website-" + definitions.s3Info.bucketInfo.region + ".amazonaws.com")
        console.log("Done.")
      }
    });
  } else {
    console.log("Nothing to do.")
  }
})

function syncFiles(definitions, callback) {
  var customParamString = path.join(argv.clientDefinitionsDir,definitions.s3Info.fileSyncInfo.syncPath);
  customParamString += " s3://" + definitions.s3Info.bucketInfo.name;
  if (!awsc.verifyPath(definitions, ['s3Info', 'fileSyncInfo', 'syncExclusions'], 'a', 'in angular client definition file').isVerifyError) {
    for (var index = 0; index < definitions.s3Info.fileSyncInfo.syncExclusions.length; index ++) {
      customParamString += ' --exclude "' + definitions.s3Info.fileSyncInfo.syncExclusions[index] + '"';
    }
  }

  var params = {'profile' : {type:'string', value:AWSCLIUserProfile}};
  if (!awsc.verifyPath(definitions, ['s3Info', 'fileSyncInfo', 'acl'], 's', 'in angular client definition file').isVerifyError) {
    params['acl'] = {type:'string', value:definitions.s3Info.fileSyncInfo.acl};
  }
  AWSRequest.createRequest(
    {
      serviceName: "s3",
      functionName: "sync",
      parameters: params,
      customParamString: customParamString,
      returnSchema: 'none'
    },
    function (request) {
      if (!request.response.error) {
        console.log(request.response.stdout)
      }
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
