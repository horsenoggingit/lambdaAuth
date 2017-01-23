#!/usr/bin/env node
var command;
var commandFileName;
const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const vp = require(path.join(__dirname, 'awscommonutils'));
const yargs = require('yargs')
.usage('Print or delete deploy parameters from project.\nWARNING: You cannot recover these settings and will have to remove the deploy manually in the AWS console once deleted.\nUsage: $0 <command> [options] filename')
.command('print', 'print current parameters', {}, function () {command = 'print';})
.command('delete', 'remove current parameters', {}, function () {command = 'delete';})
.command('save <fileName>', 'store parameters in YAML format to file', {}, function (argv2) {command = 'save'; commandFileName = argv2.fileName;})
.command('apply <fileName>', 'overwrite current parameters with saved file', {}, function (argv2) {command = 'apply'; commandFileName = argv2.fileName;})
.example('$0 save foo.js', 'save parameters to the given file')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('l','lambdaDefinitionsDir')
.describe('l','directory that contains lambda definition files and implementations.')
.default('l','./lambdas')
.alias('c','clientDefinitionsDir')
.describe('c','directory that contains client definition files and implementations.')
.default('c','./clients')
.global(['s','l','c'])
.help('h')
.alias('h', 'help');
const argv = yargs.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
    yargs.showHelp("log");
    throw new Error("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
}

if (!fs.existsSync(argv.lambdaDefinitionsDir)) {
    yargs.showHelp("log");
    throw new Error("Lambda's path \"" + argv.lambdaDefinitionsDir + "\" not found.");
}

var paths = {};
paths[argv.baseDefinitionsFile] =[
    ["environment", "AWSResourceNamePrefix"],
    ["cognitoIdentityPoolInfo", "roleDefinitions", "*", "arnRole"],
    ["cognitoIdentityPoolInfo", "identityPools", "*", "identityPoolId"],
    ["lambdaInfo", "roleDefinitions", "*", "arnRole"],
    ["apiInfo", "roleDefinitions", "*", "arnRole"],
    ["apiInfo", "awsId"],
    ["apiInfo", "lastDeploy"],
    ["dynamodbInfo", "*", "Table"],
    ["s3Info", "buckets", "*", "name"],
    ["s3Info", "buckets", "*", "location"],
    ["vpcInfo","vpcs", "*", "VpcId"],
    ["securityGroupInfo","securityGroups", "*", "GroupId"],
    ["subnetInfo", "subnets", "*", "SubnetId"]
];

forEachClientDefinition(function (fileName) {
    paths[path.join(argv.clientDefinitionsDir, fileName)] = [
        ["s3Info", "buckets", "*", "name"],
        ["s3Info", "buckets", "*", "location"]
    ];
}, getLambdaDefinitions);

function getLambdaDefinitions() {
    forEachLambdaDefinition(function (fileName) {
        paths[path.join(argv.lambdaDefinitionsDir, fileName)] = [
            ["lambdaInfo", "arnLambda"]
        ];
    }, runCommands);
}

function runCommands() {
    var paramObj = {};
    if (command === "print") {
        allParams(logobj, false, {paramObj: paramObj});
        console.log(YAML.stringify(paramObj, 10));
    }
    if (command === "delete") {
        allParams(delObj, true);
    }
    if (command === "save") {
        allParams(logobj, false, {paramObj: paramObj});
        fs.writeFile(commandFileName, YAML.stringify(paramObj, 10));
    }
    if (command === "apply") {
        YAML.load(commandFileName);
        applyFileParams(YAML.load(commandFileName));
    }
}

function logobj(base, pathString, context, actualPath, pathType) {
    if (!context.paramObj[context.fileName]) {
        context.paramObj[context.fileName] = {};
    }
    var fullPath = actualPath.concat([pathString]);
    var item = context.paramObj[context.fileName];
    fullPath.forEach(function (pathName, index) {
        if (index === fullPath.length - 1) {
            item[pathName] = base[pathString];
        } else if (pathType[index] === 'a') {
            if (!item[pathName]) {
                item[pathName] = [];
            }
            item = {};
            item[pathName].push(item);
        } else {
            if (!item[pathName]) {
                item[pathName] = {};
            }
            item = item[pathName];
        }
    });
}

function delObj(base, pathString) {
    delete base[pathString];
}


function allParams(action, saveFile, context) {
    if (!context) {
        context = {};
    }

    Object.keys(paths).forEach(function (fileName) {
        var definitions = YAML.load(fileName);
         paths[fileName].forEach(function (pathArray) {
            context.fileName = fileName;
            lastNode(definitions, pathArray, action, context);
        });
        if (saveFile) {
            vp.updateFile(fileName, function ()
            {
                return YAML.stringify(definitions, 15);
            }, function(err1, err2){
                if (err1) {
                    console.log(err1);
                    return;
                }
                if (err2) {
                    console.log(err2);
                    return;
                }
                console.log("Saved " + fileName);
            });
        }
    });
}

function applyFileParams (params) {
    Object.keys(params).forEach(function (fileName) {
        var definitions = YAML.load(fileName);
        applyParams(definitions, params[fileName]);
        vp.updateFile(fileName, function ()
        {
            return YAML.stringify(definitions, 15);
        }, function(err1, err2){
            if (err1) {
                console.log(err1);
                return;
            }
            if (err2) {
                console.log(err2);
                return;
            }
            console.log("Saved " + fileName);
        });
    });
}

function applyParams(base, params) {
    if (typeof params === 'object') {
        Object.keys(params).forEach(function (name) {
            var item = params[name];
            if (Array.isArray(item)) {
                // basically do the best we can to update using the existing order
                if (!base[name]) {
                    base[name] = item;
                } else {
                    if (!Array.isArray(base[name])) {
                        throw new Error("Expected array at '" + name + "'");
                    }
                    if (base[name].length !== item.length) {
                        throw new Error("Array item has miss-matched length at '" + name + "'");
                    }
                    base[name].forEach(function (arrayItem, index) {
                        applyParams(arrayItem, item[index]);
                    });
                }
            } else if (typeof item === 'object') {
                if (!base[name]) {
                    base[name] = item;
                } else {
                    if (typeof (base[name]) !== 'object') {
                        throw new Error("Expected object at '" + name + "'");
                    }
                    applyParams(base[name], item);
                }
            } else {
                base[name] = item;
            }
        });
    } else {
        throw new Error("unexpected item passed as params: " + params);
    }
}

function forEachLambdaDefinition (callback, doneCallback) {
    fs.readdir(argv.lambdaDefinitionsDir, function (err, files) {
        if (err) {
            console.log(err);
            process.exit(1);
        }

        for (var index = 0; index < files.length; index++) {
            var fileName = files[index];
            var fileNameComponents = fileName.split('.');
            if ((fileNameComponents.length === 3) && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
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
        doneCallback();
    });
}

function forEachClientDefinition (callback, doneCallback) {
    fs.readdir(argv.clientDefinitionsDir, function (err, files) {
        if (err) {
            throw err;
        }

        for (var index = 0; index < files.length; index++) {
            var fileName = files[index];
            var fileNameComponents = fileName.split('.');
            if ((fileNameComponents.length === 3) && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
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
        doneCallback();
    });
}

function lastNode(base, pathArray, callback, context, actualPath, pathType) {
    if (!context) {
        context = {};
    }
    if (!pathType) {
        pathType = [];
    } else {
        pathType = pathType.slice();
    }
    if (!actualPath) {
        actualPath = [];
    } else {
        actualPath = actualPath.slice();
    }

    if (!base) {
        return;
    }
    if (pathArray.length === 1) {
        if (Array.isArray(base)) {
            pathType.push('a');
            base.forEach(function (newBase) {
                callback(newBase, pathArray[0], context, actualPath, pathType);
            });
            return;
        }
        callback(base, pathArray[0], context, actualPath, pathType);
        return;
    }
    var target = pathArray.shift();
    if (Array.isArray(base)) {
        actualPath.push(target);
        pathType.push('a');
        base.forEach(function (newBase) {
            lastNode(newBase, target, pathArray, context, actualPath, pathType);
        });
        return;
    }
    pathType.push('o');
    if (target === '*') {
         Object.keys(base).forEach(function (newItem) {
             lastNode(base[newItem], pathArray, callback, context, actualPath.concat([newItem]), pathType);
         });
         return;
     }
     lastNode(base[target], pathArray, callback, context, actualPath.concat([target]), pathType);
}
