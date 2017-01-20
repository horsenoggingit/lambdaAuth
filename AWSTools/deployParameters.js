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
//.command('apply <fileName>', 'overwrite current parameters with saved file', {}, function (argv2) {command = 'apply'; commandFileName = argv2.fileName;})
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
    ["dynamodbInfo", "*", "Table"]
];

forEachClientDefinition(function (fileName) {
    paths[path.join(argv.clientDefinitionsDir, fileName)] = [
        ["s3Info", "bucketInfo", "name"],
        ["s3Info", "bucketInfo", "location"]
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

function delObj(base, pathString, context) {
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
            if (saveFile) {
                if (saveFile) {
                    vp.updateFile(fileName, function ()
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
            }
        });
    });

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
