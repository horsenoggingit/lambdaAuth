#!/usr/bin/env node

var path = require('path');
const awscommon = require(path.join(__dirname, 'awscommonutils'))
var fs = require('fs');
var YAML = require('yamljs');
const exec = require('child_process').exec;

var YAML = require('yamljs');
var argv = require('yargs')
.usage('Create project roles and attach policies.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('t', 'roleType')
.describe('t', 'which roles to create [api | lambda]')
.choices('t', ['api', 'lambda', 'cognito'])
.demand(['t'])
.help('h')
.alias('h', 'help')
.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
  console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.")
  process.exit(1);
}

var roleBase;
switch (argv.roleType) {
  case 'api':
    roleBase = 'apiInfo';
    break;
  case 'lambda':
    roleBase = 'lambdaInfo';
  break;
  case 'cognito':
    roleBase = 'cognitoIdentityPoolInfo';
  break;
  default:
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);
awscommon.verifyPath(baseDefinitions, [roleBase, 'roleDefinitions'], 'o', "definitions file \"" + argv.baseDefinitionsFile+"\"").exitOnError();

var AWSCLIUserProfile = "default";
if (!awscommon.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
  AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
}

var createRoleComplete = 0;
var createRoleSuccess = 0;

var roleNames = Object.keys(baseDefinitions[roleBase].roleDefinitions).forEach(function (roleName) {
  var roleDef = baseDefinitions[roleBase].roleDefinitions[roleName];
  // need a name, policyDocument and perhaps some policies
  awscommon.verifyPath(roleDef, ['policyDocument'], 'o', "role definition " + roleName).exitOnError();

  awscommon.verifyPath(roleDef, ['policies'], 'a', "role definition " + roleName).exitOnError();
  var policyArray = [];
  roleDef.policies.forEach(function (policy) {
    awscommon.verifyPath(policy, ['arnPolicy'], 's', "policy definition " + roleName).exitOnError();
    policyArray.push(policy.arnPolicy);
  })
  // all done verifying now lets have some fun
  var params = ['iam',
  'create-role',
  '--role-name ' + roleName,
  "--assume-role-policy-document '" + JSON.stringify(roleDef.policyDocument) + "'",
  '--profile ' + AWSCLIUserProfile];

  createRoleAndUploadPolicies('aws ' + params.join(" "), policyArray, roleName, AWSCLIUserProfile, function (rlName, rlARN, policyArr) {
    createRoleComplete++;
    if (rlName && rlARN) {
      baseDefinitions[roleBase].roleDefinitions[rlName]["arnRole"] = rlARN;
      createRoleSuccess++;

      // start uploading policies
      //
      policyArr.forEach(function (policyArn) {
        var params = ['iam',
        'attach-role-policy',
        '--role-name ' + rlName,
        "--policy-arn " + policyArn,
        '--profile ' + AWSCLIUserProfile];
        var command = 'aws ' + params.join(" ");
        function execReq(command, policyArn, rlName) {
          exec(command, (err, stdout, stderr) => {
            if (err) {
              console.log(stdout);
              console.log(stderr);
              console.log("Failed policy attach: " + policyArn + " on " + rlName + ".");
              return;
            }
            console.log("Policy attach completed: " + policyArn + " on " + rlName + ".");
          });
        }
        execReq(command, policyArn, rlName);
      });
    }
    console.log("Updating definitions file with results")
    if (createRoleComplete === Object.keys(baseDefinitions[roleBase].roleDefinitions).length) {
      awscommon.updateFile(argv.baseDefinitionsFile, function () {
        return YAML.stringify(baseDefinitions, 15);
      }, function (backupErr, writeErr) {
        if (backupErr) {
          console.log(backupErr);
          console.log("Could not create backup of \"" + argv.baseDefinitionsFile + "\". API Id was not updated.");
          process.exit(1);
        }
        if (writeErr) {
          console.log(writeErr);
          console.log("Unable to write updated definitions file.");
          process.exit(1)
        }
        if (createRoleSuccess != createRoleComplete) {
          console.log("Some creation operations failed.")
        }
        console.log("Done.")
      });
    }

  });

});


function createRoleAndUploadPolicies(createCommand, policyArray, roleName, profileName, callback) {
  console.log("Creating role \"" + roleName + "\"");

  exec(createCommand, (err, stdout, stderr) => {
    if (err) {
      var existsMatches = stderr.toString('utf8').match(/EntityAlreadyExists/g);
      console.log(err)
      console.log(stderr);
      if (existsMatches && existsMatches.length > 0) {
        console.log("Role already exists.");
        // perhas we should go and get the info
        var params = ['iam',
        'get-role',
        '--role-name ' + roleName,
        '--profile ' + profileName];
        exec('aws ' + params.join(" "), (err, stdout, stderr) => {
          if (err) {
            console.log(err);
            console.log(stderr);
            console.log("Couldn't read role \"" + roleName + "\"");
            callback(null,null);
            return;
          }
          processRoleResult(stdout, roleName, policyArray, callback);
        });
      }
      return;
    }
    processRoleResult(stdout, roleName, policyArray, callback);
  });

}

function processRoleResult(stdout, roleName, policyArray, callback) {
  console.log(stdout);
  var result = JSON.parse(stdout);
  if (typeof result != 'object') {
    console.log("AWS result could not be parsed. Command may have failed. roleArn was not updated in \"" + argv.baseDefinitionsFile + "\".");
    callback(null,null);
    return;
  }

  var verifyResult = awscommon.verifyPath(result,['Role','Arn'],'s','amazon role creation result');

  if (verifyResult.isVerifyError) {
    console.log(verifyResult.toString());
    callback(null,null);
    return;
  }
  callback(roleName, result.Role.Arn, policyArray);

}
