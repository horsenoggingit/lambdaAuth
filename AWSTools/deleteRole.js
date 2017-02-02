#!/usr/bin/env node

const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const fs = require('fs');
const YAML = require('yamljs');
const AwsRequest = require(path.join(__dirname, 'AwsRequest'));

const argv = require('yargs')
.usage('Delete a role, detaching policies first.\nNote: at the moment this script only detaches policies specified\nin config files.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('t', 'roleType')
.describe('t', 'which roles to delete')
.choices('t', ['api', 'lambda', 'cognito'])
.demand(['t'])
.help('h')
.alias('h', 'help')
.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
    console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
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

console.log("## Deleting Roles (" + argv.roleType + ") ##");

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

awsc.verifyPath(baseDefinitions, [roleBase, 'roleDefinitions'], 'o', "definitions file \""+argv.baseDefinitionsFile+"\"").exitOnError();

var AWSCLIUserProfile = "default";
if (!awsc.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
    AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
}

Object.keys(baseDefinitions[roleBase].roleDefinitions).forEach(function (roleKey) {
    var roleDef = baseDefinitions[roleBase].roleDefinitions[roleKey];
    // need a name, policyDocument and perhaps some policies
    awsc.verifyPath(roleDef, ['policyDocument'], 'o', "role definition " + roleKey).exitOnError();

    awsc.verifyPath(roleDef, ['policies'], 'a', "role definition " + roleKey).exitOnError();
    var policyArray = [];
    roleDef.policies.forEach(function (policy) {
        awsc.verifyPath(policy, ['arnPolicy'], 's', "policy definition " + roleKey).exitOnError();
        policyArray.push(policy.arnPolicy);
    });
    // all done verifying now lets have some fun
    deletePolicies(policyArray, roleKey, AWSCLIUserProfile);
});

function deletePolicies(policyArray, roleKey) {
    var roleName;
    if (awsc.isValidAWSResourceNamePrefix(baseDefinitions, argv.baseDefinitionsFile)) {
        roleName = baseDefinitions.environment.AWSResourceNamePrefix + roleKey;
    }

    var policyArrayLength = policyArray.length;
    policyArray.forEach(function (policy){

        AwsRequest.createRequest({
            serviceName: 'iam',
            functionName: 'detach-role-policy',
            parameters: {
                'role-name': {type: 'string', value: roleName},
                'policy-arn': {type: 'string', value: policy},
                profile: {type: 'string', value: AWSCLIUserProfile}
            },
            returnSchema: 'none',
        }, function (request) {
            if (request.response.error && request.response.errorId !== "NoSuchEntity") {
                console.log("Failed to detach policy" + request.parameters["policy-arn"].value + " from " + roleName + ".");
                console.log(request.response.error);
            } else {
                console.log("Successfully detached policy " + request.parameters["policy-arn"].value + " from " + roleName + ".");
            }

            policyArrayLength --;

            if (policyArrayLength === 0) {
                // now delete role
                AwsRequest.createRequest({
                    serviceName: 'iam',
                    functionName: 'delete-role',
                    parameters: {
                        'role-name': {type: 'string', value: roleName},
                        profile: {type: 'string', value: AWSCLIUserProfile}
                    },
                    returnSchema: 'none',
                }, function (request) {
                    if (request.response.error && request.response.errorId !== "NoSuchEntity") {
                         console.log("Failed to delete role " + roleKey + ".");
                         throw request.response.error;
                    }

                    console.log("Successfully deleted role " + roleKey + ".");
                    delete baseDefinitions[roleBase].roleDefinitions[roleKey].arnRole;

                    awsc.updateFile(argv.baseDefinitionsFile, function () {
                        return YAML.stringify(baseDefinitions, 15);
                    }, function (backupErr, writeErr) {
                        if (backupErr) {
                            console.log(backupErr);
                            console.log("Could not create backup of \"" + argv.baseDefinitionsFile + "\". API Id was not updated.");
                            process.exit(1);
                        }
                        if (writeErr) {
                            console.log("Unable to write updated definitions file.");
                            throw new Error(writeErr);
                        }
                    });

                }).startRequest();

            }
        }).startRequest();

    });
}
