#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const vp = require(path.join(__dirname, 'awscommonutils'));

const yargs = require('yargs')
.usage('Print or delete deploy parameters from project.\nWARNING: You cannot recover these settings and will have to remove the deploy manually in the AWS console once deleted.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('l','lambdaDefinitionsDir')
.describe('l','directory that contains lambda definition files and implementations.')
.default('l','./lambdas')
.alias('c','clientDefinitionsDir')
.describe('c','directory that contains client definition files and implementations.')
.default('c','./clients')
.alias('d','delete')
.describe('d','delete the deploy parameters')
.alias('p','print')
.describe('p','print the deploy parameters')
.help('h')
.alias('h', 'help');
const argv = yargs.argv;

if (!argv.print || argv.delete) {
    yargs.showHelp("log");
    process.exit(1);
}

if (!fs.existsSync(argv.baseDefinitionsFile)) {
    yargs.showHelp("log");
    throw new Error("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

if (!fs.existsSync(argv.lambdaDefinitionsDir)) {
    yargs.showHelp("log");
    throw new Error("Lambda's path \"" + argv.lambdaDefinitionsDir + "\" not found.");
}

function logobj(base, pathString) {
    console.log(pathString + " = " + JSON.stringify(base[pathString],null, "\t"));
}

function delObj(base, pathString) {
    delete base[pathString];
}

if (argv.print) {
    allParams(logobj, false);
}

if (argv.delete) {
    allParams(delObj, true);
}

function allParams(action, saveFile) {
    lastNode(baseDefinitions,["cognitoIdentityPoolInfo", "roleDefinitions", "*", "arnRole"], action);

    lastNode(baseDefinitions,["cognitoIdentityPoolInfo", "identityPools", "*", "identityPoolId"], action);

    lastNode(baseDefinitions,["lambdaInfo", "roleDefinitions", "*", "arnRole"], action);

    lastNode(baseDefinitions,["apiInfo", "roleDefinitions", "*", "arnRole"], action);

    lastNode(baseDefinitions,["apiInfo", "awsId"], action);

    lastNode(baseDefinitions,["apiInfo", "lastDeploy"], action);

    lastNode(baseDefinitions,["dynamodbInfo", "*", "Table"], action);

    if (saveFile) {
        vp.updateFile(argv.baseDefinitionsFile, function ()
        {
            return YAML.stringify(baseDefinitions, 15);
        }, function(err1, err2){
            if (err1 || err2) {
                console.log("Could not update " + argv.baseDefinitionsFile);
                return;
            }
            console.log("Saved " + argv.baseDefinitionsFile);
        });
    }

    //clients
    forEachClientDefinition(function (fileName) {
        var definitions = YAML.load(path.join(argv.clientDefinitionsDir,fileName));
        if (typeof definitions !== 'object') {
            throw new Error("Definitions file \"" + fileName + "\" could not be parsed");
        }
        lastNode(definitions,["s3Info", "bucketInfo", "name"], action);
        lastNode(definitions,["s3Info", "bucketInfo", "location"], action);
        if (saveFile) {
            vp.updateFile(path.join(argv.clientDefinitionsDir,fileName), function ()
            {
                return YAML.stringify(definitions, 15);
            }, function(err1, err2){
                if (err1 || err2) {
                    console.log("Could not update " + fileName);
                    return;
                }
                console.log("Saved " + fileName);
            });
        }

    });

    //lambdas
    forEachLambdaDefinition(function (fileName) {
        var definitions = YAML.load(path.join(argv.lambdaDefinitionsDir,fileName));
        if (typeof definitions !== 'object') {
            throw new Error("Definitions file \"" + fileName + "\" could not be parsed");
        }
        lastNode(definitions,["lambdaInfo", "arnLambda"], action);
        if (saveFile) {
            vp.updateFile(path.join(argv.lambdaDefinitionsDir,fileName), function (){
                return YAML.stringify(definitions, 15);
            }, function(err1, err2){
                if (err1 | err2) {
                    console.log("Could not update " + fileName);
                    return;
                }
                console.log("Saved " + fileName);
            });
        }
    });
}

function forEachLambdaDefinition (callback) {
    fs.readdir(argv.lambdaDefinitionsDir, function (err, files) {
        if (err) {
            console.log(err);
            process.exit(1);
        }

        for (var index = 0; index < files.length; index++) {
            var fileName = files[index];
            var fileNameComponents = fileName.split('.');
            if ((fileNameComponents.length === 3) && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
                console.log("Reading: " + fileName);
                var writeOut = true;
                if ((typeof argv.lambdaName === 'string') && (argv.lambdaName !== fileNameComponents[0])) {
                    console.log("Not target lambda. Skipping.");
                    writeOut = false;
                }
                if (writeOut) {
                    callback(fileName);
                }
            }
        }
    });
}

function forEachClientDefinition (callback) {
    fs.readdir(argv.clientDefinitionsDir, function (err, files) {
        if (err) {
            throw err;
        }

        for (var index = 0; index < files.length; index++) {
            var fileName = files[index];
            var fileNameComponents = fileName.split('.');
            if ((fileNameComponents.length === 3) && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
                console.log("Reading: " + fileName);
                var writeOut = true;
                if ((typeof argv.clientName === 'string') && (argv.clientName !== fileNameComponents[0])) {
                    console.log("Not target API. Skipping.");
                    writeOut = false;
                }
                if (writeOut) {
                    callback(fileName);
                }
            }
        }
    });
}

function lastNode(base, pathArray, callback) {
    if (!base) {
        return;
    }
    if (pathArray.length === 1) {
        if (Array.isArray(base)) {
            base.forEach(function (newBase) {
                callback(newBase, pathArray[0]);
            });
            return;
        }
        callback(base, pathArray[0]);
        return;
    }
    var target = pathArray.shift();
    if (Array.isArray(base)) {
        base.forEach(function (newBase) {
            lastNode(newBase, target, pathArray);
        });
        return;
    }
    if (target === '*') {
        Object.keys(base).forEach(function (newItem) {
            lastNode(base[newItem], pathArray, callback);
        });
        return;
    }
    lastNode(base[target], pathArray, callback);
}
