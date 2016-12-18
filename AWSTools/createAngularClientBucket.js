#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'))
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

var yargs = require('yargs')
.usage('Creates an s3 bucket if needed and configures as static web host.\nUsage: $0 [options]')
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

  if (awsc.verifyPath(definitions, ['s3Info', 'bucketInfo', 'name'], 's', 'in angular client definition file').isVerifyError) {
    awsc.verifyPath(definitions, ['s3Info', 'bucketInfo', 'namePrefix'], 's', 'in angular client definition file').exitOnError();
    // no bucket - lets create one.
    createBucket(fileName, definitions, function (err, definitions) {
      if (err) {
        throw err;
      }
      enableWeb(definitions, function (err) {
        if (err) {
          delete definitions.s3Info.bucketInfo.name;
          delete definitions.s3Info.bucketInfo.Location;
          writeOut(path.join(argv.clientDefinitionsDir, fileName), definitions, "bucket name was not removed.", function () {
              throw err;
          });
          return;
        }
        addBucketPolicy(definitions, function (err) {
          if (err) {
            delete definitions.s3Info.bucketInfo.name;
            delete definitions.s3Info.bucketInfo.Location;
            writeOut(path.join(argv.clientDefinitionsDir, fileName), definitions, "bucket name was not removed.", function () {
                throw err;
            });
            return;
          }
          console.log('Site URL is: http://' + definitions.s3Info.bucketInfo.name + ".s3-website-" + definitions.s3Info.bucketInfo.region + ".amazonaws.com")
          console.log('Done.')
        });
      })
    })
  } else {
    console.log('Bucket already defined. Use "deleteAngularClientBucket.js" first.');
  }
})

function createBucket(fileName, definitions, callback, attemptNo) {
  var bucketName = definitions.s3Info.bucketInfo.namePrefix;
  awsc.verifyPath(definitions, ['s3Info', 'bucketInfo', 'region'], 's', 'in angular client definition file').exitOnError();

  if (typeof attemptNo != 'undefined') {
    bucketName = bucketName + zeroPadInteger(4,Math.floor(Math.random() * 10000));
  } else {
    attemptNo = 0;
  }
  AWSRequest.createRequest(
    {
      serviceName: "s3api",
      functionName: "create-bucket",
      context:{fileName: fileName, attemptNo: attemptNo, callback: callback, definitions : definitions},
      parameters: {
        'bucket' : {type:'string', value:bucketName},
        'region' : {type:'string', value:definitions.s3Info.bucketInfo.region},
        'profile' : {type:'string', value:AWSCLIUserProfile}
      },
      returnSchema: 'json',
      returnValidation:[{path:['Location'], type:'s'}]
    },
    function (request) {
      if (request.response.error) {
        // try to create one with another name
        if (attemptNo > 4) {
          throw request.response.error;
        }
        createBucket(request.context.fileName, request.context.definitions, request.context.callback, request.context.attemptNo + 1);
      } else {
        console.log(request.response.parsedJSON);
        request.context.definitions.s3Info.bucketInfo['name'] = request.parameters.bucket.value;
        request.context.definitions.s3Info.bucketInfo['location'] = request.response.parsedJSON.Location;
        writeOut(path.join(argv.clientDefinitionsDir, request.context.fileName), request.context.definitions, "Bucket name was not updated.", function () {
          callback(null, definitions);
        });
      }
    }
  ).startRequest();
}

function zeroPadInteger(n, value) {
  value = Math.floor(value);
  var nd = Math.floor(Math.log10(value)) + 1;
  if (n <= nd) {
    return value.toString();
  } else {
    var pre = (new Array(n-nd)).fill('0');
    return pre.join('') + value;
  }
}

function enableWeb(definitions, callback) {
  if (!awsc.verifyPath(definitions,['s3Info', 'bucketInfo', 'websiteConfiguration'],'o').isVerifyError) {
    console.log("Found bucket websiteConfiguration.")
    AWSRequest.createRequest(
      {
        serviceName: "s3api",
        functionName: "put-bucket-website",
        parameters: {
          'bucket' : {type:'string', value:definitions.s3Info.bucketInfo.name},
          'website-configuration' : {type:'JSONObject', value:definitions.s3Info.bucketInfo.websiteConfiguration},
          'profile' : {type:'string', value:AWSCLIUserProfile}
        },
        returnSchema: 'none',
      },
      function (request) {
        if (request.response.error) {
          callback(request.response.error)
        } else {
          console.log("Put bucket websiteConfiguration.")
          callback(null);
        }
      }
    ).startRequest();
  } else {
    callback(null);
  }
}

function addBucketPolicy(definitions, callback) {
  if (!awsc.verifyPath(definitions,['s3Info', 'bucketInfo', 'policy'],'o').isVerifyError) {
    console.log("Found bucket policy.")
    // substitue any occurance of $name in Resources with bucket name.
    var policy = definitions.s3Info.bucketInfo.policy;
    for (index = 0; index < policy.Statement.length; index++) {
      policy.Statement[index].Resource = policy.Statement[index].Resource.replace('$name', definitions.s3Info.bucketInfo.name);
    }
    AWSRequest.createRequest(
      {
        serviceName: "s3api",
        functionName: "put-bucket-policy",
        parameters: {
          'bucket' : {type:'string', value:definitions.s3Info.bucketInfo.name},
          'policy' : {type:'JSONObject', value:definitions.s3Info.bucketInfo.policy},
          'profile' : {type:'string', value:AWSCLIUserProfile}
        },
        returnSchema: 'none',
      },
      function (request) {
        if (request.response.error) {
          callback(request.response.error)
        } else {
          console.log("Put bucket policy.")
          callback(null);
        }
      }
    ).startRequest();
  } else {
    callback(null);
  }
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
