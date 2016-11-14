#!/usr/bin/env node

var YAML = require('yamljs');
var argv = require('yargs')
.usage('Removes and re-creates link files base on linkFiles in [your_lambda].definitions.yaml.\nUsage: $0 [options]')
.alias('l','lambdaDefinitionsDir')
.describe('l','Directory containing lambda definition yaml files')
.default('l','./lambdas')
.alias('n','lambdaName')
.describe('n','Only process links for this lambda')
.alias('c','cleanOnly')
.describe('c','Just delete the links')
.help('h')
.alias('h', 'help')
.argv;
var fs = require('fs')
var path = require('path')

// the "paths" component is in the lambdaDefinitions
// at apiInfo.path
console.log("Updating Link Files")
fs.readdir(argv.lambdaDefinitionsDir, function (err, files) {
  if (err) {
    console.log(err);
    process.exit(1);
  }
  var writtenLambdaCount = 0;
  // iterate through all the definition files
  for (var index = 0; index < files.length; index++) {
    var fileName = files[index];
    var fileNameComponents = fileName.split('.');
    if ((fileNameComponents.length === 3) && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
      console.log("Reading: " + fileName);
      var definitions = YAML.load(path.join(argv.lambdaDefinitionsDir,fileName));
        // process the linkFiles
        if (typeof definitions.linkFiles == 'object') {
          var dirName;
          var allkeys = Object.keys(definitions.linkFiles);
          if (Array.isArray(allkeys) && (allkeys.length > 0)) {
            var writeOut = true;
            if ((typeof argv.lambdaName == 'string') && (argv.lambdaName !== Object.keys(definitions.implementationFiles)[0])) {
              console.log("Not target lambda. Skipping.");
              writeOut = false;
            }
            // if we should act on this lambda delete old links and create new ones
            if (writeOut) {
              for (var indexKey = 0; indexKey < allkeys.length; indexKey++) {
                for (var fNameIndex = 0; fNameIndex < definitions.linkFiles[allkeys[indexKey]].length; fNameIndex++) {

                  var sourceFile = path.join(argv.lambdaDefinitionsDir, allkeys[indexKey] ,definitions.linkFiles[allkeys[indexKey]][fNameIndex]);

                  console.log(path.join(argv.lambdaDefinitionsDir, Object.keys(definitions.implementationFiles)[0],definitions.linkFiles[allkeys[indexKey]][fNameIndex]));
                  var lnkPath = path.join(argv.lambdaDefinitionsDir, Object.keys(definitions.implementationFiles)[0],definitions.linkFiles[allkeys[indexKey]][fNameIndex]);
                  if (fs.existsSync(lnkPath)) {
                    fs.unlinkSync(lnkPath)
                  } else {
                    console.log("Cound not find ${lnkPath} to delete")
                  }
                  if (!argv.cleanOnly) {
                    fs.linkSync(sourceFile, lnkPath)
                  }
                }
              }
            }
          } else {
            console.log("Expected linkFiles bag with at least 1 key. Skipping.");
          }
        } else {
          console.log("Expected linkFiles bag. Skipping.");
        }
    }
  }
  console.log("Done")
});
