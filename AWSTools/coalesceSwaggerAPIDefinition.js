#!/usr/bin/env node

const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const argv = require('yargs')
.usage('Create a single API definitions file to upload to AWS.\nx-amazon-apigateway-integration fields are updated with latest role and lambda arn.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains top level definitions including swagger template header')
.default('s','./base.definitions.yaml')
.alias('l','lambdaDefinitionsDir')
.describe('l','directory containing lambda definition yaml files')
.default('l','./lambdas')
.alias('o','outputFilename')
.describe('o','coalesced yaml file for upload to AWS')
.default('o','swaggerAPI.yaml')
.alias('c','commonModelDefinitionFile')
.describe('c','yaml file with common definitions of models')
.help('h')
.alias('h', 'help')
.argv;

var fs = require('fs');

// load the swagger base file
var baseDefinitions = YAML.load(argv.baseDefinitionsFile);
if (typeof baseDefinitions.apiInfo !== 'object') {
    throw new Error("Missing apiInfo in base definitions file");
}
if (typeof baseDefinitions.apiInfo.AWSSwaggerHeader !== 'object') {
    throw new Error("Missing AWS API swagger template header in base definitions file");
}

var swaggerBaseFile = baseDefinitions.apiInfo.AWSSwaggerHeader;
// update the title to include the resource.
awsc.verifyPath(baseDefinitions,['apiInfo', 'title'], 's', "in base definitions file", "This is needed to identify the API").exitOnError();

if (baseDefinitions.environment.AWSResourceNamePrefix) {
    baseDefinitions.apiInfo.AWSSwaggerHeader.info.title = baseDefinitions.environment.AWSResourceNamePrefix + baseDefinitions.apiInfo.title;
} else {
    throw new Error("Please assign a AWSResourceNamePrefix at 'environment.AWSResourceNamePrefix' in base definitions file '" + argv.baseDefinitionsFile + "'.");
}

if (fs.existsSync(argv.outputFilename)) {
    fs.unlinkSync(argv.outputFilename);
}

// the "paths" component is in the lambdaDefinitions
// at apiInfo.path
console.log("Coalescing API");
fs.readdir(argv.lambdaDefinitionsDir, function (err, files) {
    if (err) {
        console.log(err);
        process.exit(1);
    }
    swaggerBaseFile.paths = {};
    swaggerBaseFile.definitions = {};
    swaggerBaseFile.securityDefinitions = {};
    // see if there are any common definitions and use them to start.
    // individual paths can also create their own defitions, but these will
    // overwrite the existing ones.
    if (typeof baseDefinitions.apiInfo.sharedDefinitions === 'object') {
        swaggerBaseFile.definitions = baseDefinitions.apiInfo.sharedDefinitions;
    }
    if (typeof baseDefinitions.apiInfo.sharedSecurityDefinitions === 'object') {
        swaggerBaseFile.securityDefinitions = baseDefinitions.apiInfo.sharedSecurityDefinitions;
    }

    for (var index = 0; index < files.length; index++) {
        var fileName = files[index];
        var fileNameComponents = fileName.split('.');
        if ((fileNameComponents.length === 3) && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
            console.log("Reading: " + fileName);
            var definitions = YAML.load(path.join(argv.lambdaDefinitionsDir,fileName));
            // We need to update all lambda uri in apiInfo.paths.*.*.uri to include the lambda arn
            updateLambadInvocation(definitions);
            updateCredentials(baseDefinitions,definitions);
            if (typeof definitions.apiInfo.paths === 'object') {
                Object.keys(definitions.apiInfo.paths).forEach(function(key) {
                    swaggerBaseFile.paths[key] = definitions.apiInfo.paths[key];
                });
            }
            // I'm going to assume that all model defitions are going to be under "definitions"
            if (typeof definitions.definitions === 'object') {
                Object.keys(definitions.definitions).forEach(function(key) {
                    swaggerBaseFile.definitions[key] = definitions.definitions[key];
                });
            }
            // I'm going to assume that all security defitions are going to be under "definitions"
            if (typeof definitions.securityDefinitions === 'object') {
                Object.keys(definitions.securityDefinitions).forEach(function(key) {
                    swaggerBaseFile.securityDefinitions[key] = definitions.securityDefinitions[key];
                });
            }
        }
    }
    if (typeof argv.commonModelDefinitionFile === 'string') {
        var modelDefinitions = YAML.load(argv.commonModelDefinitionFile);
        Object.keys(modelDefinitions.definitions).forEach(function(key) {
            swaggerBaseFile.definitions[key] = definitions.definitions[key];
        });
    }
    // now that we have a full file, lets

    fs.writeFile(argv.outputFilename, YAML.stringify(swaggerBaseFile, 15), function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log("Done!");
        }
    });

});

function updateLambadInvocation(definitions) {
    if (awsc.verifyPath(definitions,['lambdaInfo', 'arnLambda'], 's', "").isVerifyError) {
        throw new Error("No lambda ARN found, cannot make x-amazon-apigateway-integration with lambda \"" + definitions.lambdaInfo.functionName + "\"");
    }
    //all apiInfo.paths.*.*.uri
    var pathKeys = Object.keys(definitions.apiInfo.paths);
    pathKeys.forEach(function (pathKey) {
        var methodKeys = Object.keys(definitions.apiInfo.paths[pathKey]);
        methodKeys.forEach(function (methodKey) {
            var methodDef = definitions.apiInfo.paths[pathKey][methodKey];
            if (awsc.verifyPath(methodDef,['x-amazon-apigateway-integration'], 'o',"").isVerifyError) {
                methodDef['x-amazon-apigateway-integration'] = {};
            }
            // if there isn;t an integration type already integrate the lambda
            if (awsc.verifyPath(methodDef,['x-amazon-apigateway-integration','type'], 's',"").isVerifyError) {
                var uri = 'arn:aws:apigateway:' + definitions.lambdaInfo.region + ':lambda:path//2015-03-31/functions/' + definitions.lambdaInfo.arnLambda + '/invocations';
                methodDef['x-amazon-apigateway-integration'].uri = uri;
                methodDef['x-amazon-apigateway-integration'].type = 'aws';
                methodDef['x-amazon-apigateway-integration'].httpMethod = 'POST';
            }
        });
    });
}

function updateCredentials(baseDefinitions, definitions) {
    //all apiInfo.paths.*.*.uri
    var pathKeys = Object.keys(definitions.apiInfo.paths);
    pathKeys.forEach(function (pathKey) {
        var methodKeys = Object.keys(definitions.apiInfo.paths[pathKey]);
        methodKeys.forEach(function (methodKey) {
            var methodDef = definitions.apiInfo.paths[pathKey][methodKey];
            if (awsc.verifyPath(methodDef,['x-amazon-apigateway-integration','credentials'], 's',"").isVerifyError) {
                console.log("No credentials to update.");
                return; // nothing to do
            }
            awsc.verifyPath(baseDefinitions, ['apiInfo', 'roleDefinitions', methodDef['x-amazon-apigateway-integration'].credentials, 'arnRole'], 's', "apiInfo Role Definitions");
            methodDef['x-amazon-apigateway-integration'].credentials = baseDefinitions.apiInfo.roleDefinitions[methodDef['x-amazon-apigateway-integration'].credentials].arnRole;
        });
    });
}
