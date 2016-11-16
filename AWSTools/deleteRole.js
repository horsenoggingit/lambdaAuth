#!/usr/bin/env node

const path = require('path');
const awscommon = require(path.join(__dirname, 'awscommonutils'))
const fs = require('fs');
const YAML = require('yamljs');
const exec = require('child_process').exec;

var argv = require('yargs')
.usage('Delete a role, detaching policies first.\nNote: at the moment this script only detaches policies specified\nin config files.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that containes information about your API')
.default('s','./base.definitions.yaml')
.alias('t', 'roleType')
.describe('t', 'which roles to delete')
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

awscommon.verifyPath(baseDefinitions, [roleBase, 'roleDefinitions'], 'o', "definitions file \""+argv.baseDefinitionsFile+"\"").exitOnError();

var AWSCLIUserProfile = "default";
if (!awscommon.verifyPath(baseDefinitions,['enviroment', 'AWSCLIUserProfile'],'s').isVerifyError) {
  AWSCLIUserProfile = baseDefinitions.enviroment.AWSCLIUserProfile;
}

var numRoles = Object.keys(baseDefinitions[roleBase].roleDefinitions).length;
var successDecCount = numRoles;

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
  deletePolicies(policyArray, roleName, AWSCLIUserProfile);
});

function deletePolicies(policyArray, roleName, userProfile) {
  var policyArrayLength = policyArray.length;
  policyArray.forEach(function (policy){

    var params = ['iam',
    'detach-role-policy',
    '--role-name ' + roleName,
    '--policy-arn ' + policy,
    '--profile ' + AWSCLIUserProfile];
    function execPolDelete (params, policy, doneCallback) {
      exec('aws ' + params.join(" "), (err, stdout, stderr) => {
        doneCallback(policy, err);
      });
    }
    execPolDelete(params, policy, function (pol, err) {
      if (err) {
        console.log(err)
        console.log("Failed to detach policy" + pol + " from " + roleName + ".");
      } else {
        console.log("Successfully detached policy" + pol + " from " + roleName + ".");
      }

      policyArrayLength --;

      if (policyArrayLength === 0) {
        // now delete role
        var params = ['iam',
        'delete-role',
        '--role-name ' + roleName,
        '--profile ' + AWSCLIUserProfile];
        function execRoleDelete (params, rlName, doneCallback) {
          exec('aws ' + params.join(" "), (err, stdout, stderr) => {
            doneCallback(rlName, err);
          });
        }
        execRoleDelete(params, roleName, function (pol, err) {
          if (err) {
            console.log(err);
            console.log("Failed to delete role " + pol + ".");
          } else {
            console.log("Successfully deleted role " + pol + ".");
            delete baseDefinitions[roleBase].roleDefinitions[roleName].arnRole;
            successDecCount --;
          }
          numRoles --;
          if (numRoles == 0) {
            awscommon.updateFile(argv.baseDefinitionsFile, function () {
              return YAML.stringify(baseDefinitions, 6);
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
              if (successDecCount != 0) {
                console.log("Some creation operations failed.")
              }
              console.log("Done.")
            });

          }
        });

      }
    });

  });

}
