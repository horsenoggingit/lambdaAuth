"use strict";

const fs = require("fs");
const path = require("path");
const LintStream = require("jslint").LintStream;
const linter = "jshint";
const JSHINT = require("jshint");

class VerifyResultString extends Object {
    constructor (errorMessage, isVerifyError) {
        super();
        if (typeof isVerifyError === "boolean") {
            this.isVerifyError = isVerifyError;
        } else {
            this.isVerifyError = false;
        }

        this.errorMessage = errorMessage;
    }
    toString() {
        return this.errorMessage;
    }
    exitOnError() {
        if (this.isVerifyError) {
            throw new Error(this.errorMessage);
        }
    }
    callbackOnError(callback) {
        if (this.isVerifyError) {
            callback(this);
        }
        return(this);
    }
}

exports.VerifyResultString = VerifyResultString;

exports.verifyPath = function verifyPath(structure, pathArray, leafTypeKey, itemName, extraString) {
    var leafTypes = {"s" : "string",
    "n" : "number",
    "o" : "object",
    "a" : "array",
    "f" : "function",
    "b" : "boolean"
};

if (!extraString) {
    extraString = "";
}

var result = checkPath(structure, pathArray, leafTypeKey);
if (!result) {
    return new VerifyResultString();
}
var path = pathArray.join(".");
var errorString;
var key1String;
var key2String;
if (typeof leafTypeKey === "object") {
    errorString = "Failed validation of action \"" + result.failAction + "\". ";
    if (result.failIndex === 0) {
        switch (result.failAction) {
            case "oneOfs":
            key1String = "string ([" + leafTypeKey.oneOfs.join("|") + "])";
            key2String = leafTypes[getTypeKey(structure)];
            break;
            default:
        }
    }
} else {
    errorString = "";
    key1String = leafTypes[leafTypeKey];
    key2String = leafTypes[getTypeKey(structure)];
}
if (result.failIndex === 0) {
    errorString += "The item \"" + path + "\" of expected type \"" + key1String + "\" was not found because the \"" + itemName + "\" was of type " + key2String + ". " + extraString;
} else if (result.failIndex < pathArray.length) {
    errorString += "The item \"" + path + "\" of expected type \"" + key1String + "\" in the " + itemName + " was not found because \"" + pathArray[result.failIndex - 1] + "\" was not an object. It was of type \"" + leafTypes[result.failType] + "\". " + extraString;
} else {
    errorString += "The item \"" + path + "\" of expected type \"" + key1String + "\" in the " + itemName + " was not found because \"" + pathArray[result.failIndex - 1] + "\" was of type \"" + leafTypes[result.failType] + "\"." + extraString;
}

var x = new VerifyResultString(errorString, true);
return x;
};

function checkPath(structure, pathArray, leafTypeKey) {
    var items = [structure];
    var index = 0;
    var typeResult = "x";
    for (; index < pathArray.length; index++) {
        var nextItems = [];
        var breakOut = false;
        for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
            var item = items[itemIndex];
            typeResult = getTypeKey(item);
            switch (typeResult) {
            case "a":
                // if it is an array push each item for verification on the next pass
                item.forEach(function (arrayItem) {
                    nextItems.push(arrayItem[pathArray[index]]);
                });
                break;
            case "o":
                // when * is encountere on the path we push each item regardles of key.
                if (pathArray[index] === "*") {
                    Object.keys(item).forEach(function (itemKey) {
                        nextItems.push(item[itemKey]);
                    });
                } else {
                    nextItems.push(item[pathArray[index]]);
                }
                break;
            default:
                breakOut = true;
            }
            if (breakOut) {
                break;
            }
        }
        if (breakOut) {
            break;
        }
        items = nextItems;
    }
    if (index !== pathArray.length) {
        return {failIndex:index, failType:typeResult};
    }
    for (var itemIndex2 = 0; itemIndex2 < items.length; itemIndex2++) {
        var item2 = items[itemIndex2];
        typeResult = getTypeKey(item2);
        // if the leadTypeKey is an object check to see which command should be executed
        if (typeof leafTypeKey === "object") {
            var actions = Object.keys(leafTypeKey);
            for (var oneOfsIndex = 0; oneOfsIndex < actions.length; oneOfsIndex ++) {
                var action = actions[oneOfsIndex];
                switch (action) {
                case "oneOfs":
                    // value for oneOfs is an array of strings.
                    if ((typeResult !== "s") || (leafTypeKey[action].indexOf(item2)) < 0) {
                        return {failIndex:index, failType:typeResult, failAction:action};
                    }
                    break;
                default:
                    console.log("Unrecognized leafTypeKey command: " + action);
                }

            }
        } else if (typeResult !== leafTypeKey) {
            return {failIndex:index, failType:typeResult};
        }
    }
    return null;
}

function getTypeKey(item) {
    var typeKey = "u";
    switch (typeof item) {
        case "string":
        typeKey = "s";
        break;
        case "number":
        typeKey = "n";
        break;
        case "boolean":
        typeKey = "b";
        break;
        case "object":
        // null
        if (!item) {
            typeKey = "n";
        } else if (Array.isArray(item)) {
            typeKey = "a";
        } else {
            typeKey = "o";
        }
        break;
        case "undefined":
        typeKey = "u";
        break;
        case "function":
        typeKey = "f";
        break;
        case "symbol":
        typeKey = "s";
        break;
        default:
        typeKey = "u";
    }
    return typeKey;
}

exports.updateFile = function updateFile(fName, dataCallback, callback) {
    if (fs.existsSync(fName + ".old")) {
        fs.unlinkSync(fName + ".old");
    }
    setTimeout(function () {
        fs.rename(fName, fName + ".old", function (err){
            if (err) {
                callback(err,null);
                return;
            }
            setTimeout(function () {
                fs.writeFile(fName, dataCallback(), function (err) {
                    if (err) {
                        callback(null,err);
                        return;
                    }
                    callback(null,null);
                });
            },250);
        });
    }, 250);
};

exports.validatejs = function(lambdaDefintitions, lambdaPath) {
    var implementationFiles=[];
    var addFile = function(filePath) {
        if (path.extname(filePath) === ".js") {
            implementationFiles.push(filePath);
        }
    };
    // make a file list from the definitions
    // get the base implementation files first
    lambdaDefintitions.implementationFiles[lambdaDefintitions.lambdaInfo.functionName].forEach(addFile);
    // now add the link file skipping directories
    if (lambdaDefintitions.linkFiles) {
        Object.keys(lambdaDefintitions.linkFiles).forEach(function(fileArrayKey) {
            lambdaDefintitions.linkFiles[fileArrayKey].forEach(addFile);
        });
    }

    if (linter==="jslint") {
        var options = {
            "length": 100,
            "node": true,
            "fudge": true,
            "edition": "latest",
            "es6": true,
            "stupid": true,
            "for": true
        };
        var l = new LintStream(options);
        l.on("data", function (chunk, encoding, callback) {
            // chunk is an object

            // chunk.file is whatever you supplied to write (see above)
            console.log(chunk.file);
            console.log(chunk.linted.errors);

            // chunk.linted is an object holding the result from running JSLint
            // chunk.linted.ok is the boolean return code from JSLINT()
            // chunk.linted.errors is the array of errors, etc.
            // see JSLINT for the complete contents of the object
            if (callback) {
                callback();
            }
        });
        implementationFiles.forEach(function(file){
            console.log(path.join(lambdaPath, file));
            var code = fs.readFileSync(path.join(lambdaPath, file), "utf8");
            l.write({file: file, body: code});
        });
    }
    if (linter === "jshint") {
        implementationFiles.forEach(function(file){
            console.log(path.join(lambdaPath, file));
            var code = fs.readFileSync(path.join(lambdaPath, file), "utf8");
            JSHINT.JSHINT(code,{
                node: true,
                esversion: 6,
                undef: true,
                unused: true,
                eqeqeq: true
            },{});
            if (!JSHINT.JSHINT.data().errors) {
                console.log("No lint errors!");
            } else {
                console.log(JSHINT.JSHINT.data().errors);
            }
        });
    }
};

exports.createPath = function (pathString) {
    // make sure the download path exists. If not create it.
    var downloadPath;
    if (!path.isAbsolute(pathString)) {
        downloadPath = path.join(path.resolve(), pathString);
    } else {
        downloadPath = pathString;
    }
    downloadPath = path.normalize(downloadPath);

    var downloadPathComponents = downloadPath.split(path.sep);
    var mkPath = path.sep;
    downloadPathComponents.forEach(function (pathComponent) {
        mkPath = path.join(mkPath, pathComponent);
        if (!fs.existsSync(mkPath)){
            fs.mkdirSync(mkPath);
        }
    });
};
