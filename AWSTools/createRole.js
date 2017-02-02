#!/usr/bin/env node

const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const fs = require('fs');
const YAML = require('yamljs');
const AwsRequest = require(path.join(__dirname, 'AwsRequest'));
const argv = require('yargs')
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

console.log("## Creating " + roleBase + " roles ##");

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);
awsc.verifyPath(baseDefinitions, [roleBase, 'roleDefinitions'], 'o', "definitions file \"" + argv.baseDefinitionsFile+"\"").exitOnError();

var AWSCLIUserProfile = "default";
if (!awsc.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
    AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
}

Object.keys(baseDefinitions[roleBase].roleDefinitions).forEach(function (roleKey) {
    var roleDef = baseDefinitions[roleBase].roleDefinitions[roleKey];
    // need a name, policyDocument and perhaps some policies
    awsc.verifyPath(roleDef, ['policyDocument'], 'o', "role definition " + roleBase).exitOnError();

    awsc.verifyPath(roleDef, ['policies'], 'a', "role definition " + roleBase).exitOnError();
    var policyArray = [];
    roleDef.policies.forEach(function (policy) {
        awsc.verifyPath(policy, ['arnPolicy'], 's', "policy definition " + roleBase).exitOnError();
        policyArray.push(policy.arnPolicy);
    });

    createRoleAndUploadPolicies(roleDef.policyDocument, policyArray, roleKey, function (rlKey, rlARN, policyArr) {
        if (rlKey && rlARN) {
            baseDefinitions[roleBase].roleDefinitions[rlKey].arnRole = rlARN;

            // start uploading policies
            var rlName;
            if (awsc.isValidAWSResourceNamePrefix(baseDefinitions, argv.baseDefinitionsFile)) {
                rlName = baseDefinitions.environment.AWSResourceNamePrefix + rlKey;
            }

            policyArr.forEach(function (policyArn) {
                AwsRequest.createRequest({
                    serviceName: 'iam',
                    functionName: 'attach-role-policy',
                    parameters: {
                        'role-name': {type: 'string', value: rlName},
                        'policy-arn': {type: 'string', value: policyArn},
                        profile: {type: 'string', value: AWSCLIUserProfile}
                    },
                    returnSchema: 'none',
                }, function (request) {
                    if (request.response.error) {
                        console.log("Failed policy attach: " + policyArn + " on " + rlName + ".");
                        throw request.response.error;
                    }
                    console.log("Policy attach completed: " + policyArn + " on " + rlName + ".");

                }).startRequest();
            });
        }
        awsc.updateFile(argv.baseDefinitionsFile, function () {
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
        });
    });
});


function createRoleAndUploadPolicies(policyDocument, policyArray, roleKey, callback) {
    var roleName;
    if (awsc.isValidAWSResourceNamePrefix(baseDefinitions, argv.baseDefinitionsFile)) {
        roleName = baseDefinitions.environment.AWSResourceNamePrefix + roleKey;
    }

    console.log("Creating role \"" + roleName + "\"");
    AwsRequest.createRequest({
        serviceName: 'iam',
        functionName: 'create-role',
        parameters: {
            'role-name': {type: 'string', value: roleName},
            'assume-role-policy-document': {type: 'JSONObject', value: policyDocument},
            profile: {type: 'string', value: AWSCLIUserProfile},
        },
        returnSchema: 'json',
        returnValidation:[{path: ['Role','Arn'], type: 's'}],
    }, function (request) {
        if (request.response.error) {
            if (request.response.errorId === "EntityAlreadyExists") {
                console.log("Role '" + roleName + "' exists. Updating configuration.");
                AwsRequest.createRequest({
                    serviceName: 'iam',
                    functionName: 'get-role',
                    parameters: {
                        'role-name': {type: 'string', value: roleName},
                        profile: {type: 'string', value: AWSCLIUserProfile},
                    },
                    returnSchema: 'json',
                    returnValidation:[{path:['Role','Arn'], type:'s'}],
                }, function (request) {
                    if (request.response.error) {
                        throw request.response.error;
                    }
                    callback(roleKey, request.response.parsedJSON.Role.Arn, policyArray);
                }).startRequest();
            } else {
                throw request.response.error;
            }
        } else {
            callback(roleKey, request.response.parsedJSON.Role.Arn, policyArray);
        }
    }).startRequest();
}
