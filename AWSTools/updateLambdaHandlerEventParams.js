#!/usr/bin/env node

const YAML = require('yamljs');
const argv = require('yargs')
.usage('Create a json description compatible with APIParamVerify.js to validate lambda input arguments from API.\nUsage: $0 [options]')
.alias('l','lambdaDefinitionsDir')
.describe('l','directory containing lambda definition yaml files')
.default('l','./lambdas')
.alias('o','outputFilename')
.describe('o','name of file that will be added to each lambda directory')
.default('o','eventParams.json')
.alias('n','lambdaName')
.describe('n','update handler event params for only this lambda directory')
.help('h')
.alias('h', 'help')
.argv;

const fs = require('fs');
const path = require('path');

// required --lambdaDefinitionsDir directory
// required --outputFilename
// optional --lambdaName

// the "paths" component is in the lambdaDefinitions
// at apiInfo.path
console.log("## Updating Handler Event Parameters ##");
fs.readdir(argv.lambdaDefinitionsDir, function (err, files) {
    if (err) {
        console.log(err);
        process.exit(1);
    }
    var writtenLambdaCount = 0;
    for (var index = 0; index < files.length; index++) {
        var fileName = files[index];
        var fileNameComponents = fileName.split('.');
        if ((fileNameComponents.length === 3) && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
            console.log("Reading: " + fileName);
            var definitions = YAML.load(path.join(argv.lambdaDefinitionsDir,fileName));
            if (typeof definitions.lambdaInfo.eventParamPaths === 'object') {
                if (typeof definitions.implementationFiles === 'object') {
                    var allkeys = Object.keys(definitions.implementationFiles);
                    if (Array.isArray(allkeys) && (allkeys.length > 0)) {
                        var writeOut = true;
                        if ((typeof argv.lambdaName === 'string') && (argv.lambdaName !== allkeys[0])) {
                            console.log("Not target lambda. Skipping.");
                            writeOut = false;
                        }
                        if (writeOut) {
                            fs.writeFile(path.join(argv.lambdaDefinitionsDir, allkeys[0] ,argv.outputFilename), JSON.stringify(definitions.lambdaInfo.eventParamPaths, null, '\t'));
                            writtenLambdaCount ++;
                        }
                    } else {
                        console.log("Expected implementationFile bag with at least 1 key. Skipping.");
                    }
                } else {
                    console.log("Expected implementationFile bag. Skipping.");
                }
            } else {
                console.log("Expected lambdaInfo.paths of type 'object'. Skipping.");
            }
        }
    }
    if (writtenLambdaCount === 0 && files.length > 0) {
        console.log("Nothing written. Failed");
        process.exit(1);
    }
});
