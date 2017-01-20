#!/usr/bin/env node
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const fs = require('fs');
const YAML = require('yamljs');
const argv = require('yargs')
.usage('Create a json description of constants needed to access AWS services.\nUsage: $0 [options]')
.alias('l','definitionsDir')
.describe('l','directory containing definition yaml files')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your dynamodb (dynamodbInfo)')
.default('s','./base.definitions.yaml')
.alias('o','outputFilename')
.describe('o','name of file that will be added to each lambda directory')
.default('o','AWSConstants.json')
.alias('n','lambdaName')
.describe('n','update handler event params for only this lambda directory')
.alias('t', 'constantsType')
.describe('t', 'which constants to update [lambda | client]')
.choices('t', ['lambda', 'client'])
.demand(['t'])
.help('h')
.alias('h', 'help')
.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
  console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
  argv.showHelp("log");
  process.exit(1);
}
var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

var constantPathBase;
var definitionsBase;
switch (argv.constantsType) {
  case 'lambda':
    if (argv.definitionsDir) {
      constantPathBase = argv.definitionsDir;
    } else {
      constantPathBase = 'lambdas';
    }
    definitionsBase = 'lambdaInfo';
  break;
  case 'client':
  if (argv.definitionsDir) {
    constantPathBase = argv.definitionsDir;
  } else {
    constantPathBase = 'clients';
  }
  definitionsBase = 'clientInfo';
  break;
  default:
}

// required --lambdaDefinitionsDir directory
// required --outputFilename
// optional --lambdaName

// the "paths" component is in the lambdaDefinitions
// at apiInfo.path

forEachDefinition(function (fileName) {
  console.log("Processing: " + fileName);
  var definitions = YAML.load(path.join(constantPathBase,fileName));
  var logfunction = function (err1){
    console.log(err1.toString());
};
  var constantsJson = {};
  if (definitions[definitionsBase]) {
    awsc.verifyPath(definitions,[definitionsBase, 'awsResourceInfo', 'awsResources', 'type'], {oneOfs:['dynamodbInfo','cognitoIdentityPoolInfo']}, "definition file \"" + fileName + "\"").callbackOnError(logfunction);
    awsc.verifyPath(definitions,[definitionsBase, 'awsResourceInfo', 'awsResources', 'resourceName'], 's', "definition file \"" + fileName + "\"").callbackOnError(logfunction);
    definitions[definitionsBase].awsResourceInfo.awsResources.forEach(function (resource) {
      console.log("... adding resouce " + resource.type + ": " + resource.resourceName);

      var resourceRoot;
      var source;
      switch (resource.type) {
        case 'dynamodbInfo':
          if (typeof constantsJson.DYNAMO_DB !== 'object') {
            constantsJson.DYNAMO_DB = {};
          }
          resourceRoot = constantsJson.DYNAMO_DB;
          awsc.verifyPath(baseDefinitions,[resource.type, resource.resourceName, 'lambdaAliases', 'resource'], 's', "definition file \"" + argv.baseDefinitionsFile + "\"").callbackOnError(logfunction);
          source = baseDefinitions[resource.type][resource.resourceName].lambdaAliases;
        break;
        case 'cognitoIdentityPoolInfo':
          if (typeof constantsJson.COGNITO !== 'object') {
            constantsJson.COGNITO = {};
          }
          resourceRoot = constantsJson.COGNITO;
          awsc.verifyPath(baseDefinitions,[resource.type, 'identityPools', resource.resourceName, 'lambdaAliases', 'resource'], 's', "definition file \"" + argv.baseDefinitionsFile + "\"").callbackOnError(logfunction);
          source = baseDefinitions[resource.type].identityPools[resource.resourceName].lambdaAliases;
        break;
      }

      // attach any attributes here
      if (typeof source.attributes === 'object') {
        resourceRoot[source.resource] = source.attributes;
      } else {
        resourceRoot[source.resource] = {};
      }

      var resourceName;
      if (baseDefinitions.environment.AWSResourceNamePrefix) {
        resourceName = baseDefinitions.environment.AWSResourceNamePrefix + resource.resourceName;
      } else {
          throw new Error("Please assign a AWSResourceNamePrefix at 'environment.AWSResourceNamePrefix' in base definitions file '" + argv.baseDefinitionsFile + "'.");
      }

      resourceRoot[source.resource].name = resourceName;

      // custom required stuff here
      switch (resource.type) {
        case 'dynamodbInfo':
        break;
        case 'cognitoIdentityPoolInfo':
          resourceRoot[source.resource].authProviders = baseDefinitions[resource.type].identityPools[resource.resourceName].authProviders;
          resourceRoot[source.resource].identityPoolId = baseDefinitions[resource.type].identityPools[resource.resourceName].identityPoolId;
        break;
      }
      var outFname;
      switch (argv.constantsType) {
        case 'lambda':
          outFname = path.join(constantPathBase,definitions.lambdaInfo.functionName,argv.outputFilename);
        break;
        case 'client':
        awsc.verifyPath(definitions,['clientInfo', 'awsResourceInfo', 'resourceConstantPath'], 's', "definition file \"" + fileName + "\"").callbackOnError(logfunction);
        outFname = path.join(constantPathBase,definitions.clientInfo.awsResourceInfo.resourceConstantPath,argv.outputFilename);
        break;
        default:
      }
      fs.writeFile(outFname, JSON.stringify(constantsJson,null, '\t'));
  });
  }
});


function forEachDefinition (callback) {
  fs.readdir(constantPathBase, function (err, files) {
    if (err) {
      throw err;
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
