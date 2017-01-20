#!/usr/bin/env node

var path = require('path');
const awscommon = require(path.join(__dirname, 'awscommonutils'));
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
.describe('t', 'which roles to create [api | lambda | cognito]')
.choices('t', ['api', 'lambda', 'cognito'])
.demand(['t'])
.help('h')
.alias('h', 'help')
.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
    throw new Error("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
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

Object.keys(baseDefinitions[roleBase].roleDefinitions).forEach(function (roleKey) {
    var roleDef = baseDefinitions[roleBase].roleDefinitions[roleKey];
    // need a name, policyDocument and perhaps some policies
    awscommon.verifyPath(roleDef, ['policyDocument'], 'o', "role definition " + roleName).exitOnError();

    awscommon.verifyPath(roleDef, ['policies'], 'a', "role definition " + roleName).exitOnError();
    var policyArray = [];
    roleDef.policies.forEach(function (policy) {
        awscommon.verifyPath(policy, ['arnPolicy'], 's', "policy definition " + roleName).exitOnError();
        policyArray.push(policy.arnPolicy);
    });

    var roleName;
    if (baseDefinitions.environment.AWSResourceNamePrefix) {
        roleName = baseDefinitions.environment.AWSResourceNamePrefix + roleKey;
    } else {
        throw new Error("Please assign a AWSResourceNamePrefix at 'environment.AWSResourceNamePrefix' in base definitions file '" + argv.baseDefinitionsFile + "'.");
    }
    // all done verifying now lets have some fun
    var params = ['iam',
    'create-role',
    '--role-name ' + roleName,
    "--assume-role-policy-document '" + JSON.stringify(roleDef.policyDocument) + "'",
    '--profile ' + AWSCLIUserProfile];

    createRoleAndUploadPolicies('aws ' + params.join(" "), policyArray, roleKey, AWSCLIUserProfile, function (rlKey, rlARN, policyArr) {
        createRoleComplete++;
        if (rlKey && rlARN) {
            baseDefinitions[roleBase].roleDefinitions[rlKey].arnRole = rlARN;
            createRoleSuccess++;

            // start uploading policies
            var rlName;
            if (baseDefinitions.environment.AWSResourceNamePrefix) {
                rlName = baseDefinitions.environment.AWSResourceNamePrefix + rlKey;
            } else {
                throw new Error("Please assign a AWSResourceNamePrefix at 'environment.AWSResourceNamePrefix' in base definitions file '" + argv.baseDefinitionsFile + "'.");
            }

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
        console.log("Updating definitions file with results");
        if (createRoleComplete === Object.keys(baseDefinitions[roleBase].roleDefinitions).length) {
            awscommon.updateFile(argv.baseDefinitionsFile, function () {
                return YAML.stringify(baseDefinitions, 15);
            }, function (backupErr, writeErr) {
                if (backupErr) {
                    console.log("Could not create backup of \"" + argv.baseDefinitionsFile + "\". API Id was not updated.");
                    throw new Error(backupErr);
                }
                if (writeErr) {
                    console.log("Unable to write updated definitions file.");
                    throw new Error(writeErr);
                }
                if (createRoleSuccess !== createRoleComplete) {
                    console.log("Some creation operations failed.");
                }
                console.log("Done.");
            });
        }

    });

});


function createRoleAndUploadPolicies(createCommand, policyArray, roleKey, profileName, callback) {
    var roleName;
    if (baseDefinitions.environment.AWSResourceNamePrefix) {
        roleName = baseDefinitions.environment.AWSResourceNamePrefix + roleKey;
    } else {
        throw new Error("Please assign a AWSResourceNamePrefix at 'environment.AWSResourceNamePrefix' in base definitions file '" + argv.baseDefinitionsFile + "'.");
    }

    console.log("Creating role \"" + roleName + "\"");

    exec(createCommand, (err, stdout, stderr) => {
        if (err) {
            var existsMatches = stderr.toString('utf8').match(/EntityAlreadyExists/g);
            console.log(err);
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
                    processRoleResult(stdout, roleKey, policyArray, callback);
                });
            }
            return;
        }
        processRoleResult(stdout, roleKey, policyArray, callback);
    });

}

function processRoleResult(stdout, roleKey, policyArray, callback) {
    console.log(stdout);
    var result = JSON.parse(stdout);
    if (typeof result !== 'object') {
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
    callback(roleKey, result.Role.Arn, policyArray);
}
