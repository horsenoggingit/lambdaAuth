#!/usr/bin/env node

const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AwsRequest = require(path.join(__dirname, 'AwsRequest'));
const fs = require('fs');
const YAML = require('yamljs');

var yargs = require('yargs')
.usage('Create the tables required for the project.\nIf a table with the same name already exists a new table \nwill not be create and the exising table informaiton will be used.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that containes information about your dynamodb (dynamodbInfo)')
.default('s','./base.definitions.yaml')
.alias('n','dynamoTableName')
.describe('n','a specific dynamo table name to process. If not specified all lambdas found will be created')
.help('h')
.alias('h', 'help')
var argv = yargs.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
  console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.")
  yargs.showHelp("log");
  process.exit(1);
}
var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

var AWSCLIUserProfile = "default";
if (!awsc.verifyPath(baseDefinitions,['enviroment', 'AWSCLIUserProfile'],'s').isVerifyError) {
  AWSCLIUserProfile = baseDefinitions.enviroment.AWSCLIUserProfile;
} else {
  console.log("using \"default\" AWSCLIUserProfile");
}

getTableNameArray(function(tableNames) {
  // go through and see if there are any matches with tables we have here.
  // if there are table names that match but no ARN impoet the ARN.
  // if the ARNs are the same, do nothing.
  // if they are different notify the user to see if they want to update the local info.
  awsc.verifyPath(baseDefinitions,['dynamodbInfo', '*', 'attributeDefinitions'],'a', "definitions file \"" + argv.baseDefinitionsFile + "\"").exitOnError();
  awsc.verifyPath(baseDefinitions,['dynamodbInfo', '*', 'keySchema','AttributeName'],'s', "definitions file \"" + argv.baseDefinitionsFile + "\"").exitOnError();
  awsc.verifyPath(baseDefinitions,['dynamodbInfo', '*', 'provisionedThroughput','ReadCapacityUnits'],'n', "definitions file \"" + argv.baseDefinitionsFile + "\"").exitOnError();
  awsc.verifyPath(baseDefinitions,['dynamodbInfo', '*', 'provisionedThroughput','WriteCapacityUnits'],'n', "definitions file \"" + argv.baseDefinitionsFile + "\"").exitOnError();

  var localNames = Object.keys(baseDefinitions.dynamodbInfo);
  if (argv.dynamoTableName) {
    awsc.verifyPath(baseDefinitions,['dynamodbInfo', argv.dynamoTableName], 'a', "definitions file \"" + argv.baseDefinitionsFile + "\"").exitOnError();
    localNames = [argv.dynamoTableName];
  }

  var requests = [];

  for (var keyIndex = 0; keyIndex < localNames.length; keyIndex++) {
    var tableName = localNames[keyIndex];
    // does the name exist in the name server name list
    if (tableNames.indexOf(tableName) >=0) {
      console.log("Getting description of existing table \"" + tableName + "\"");
      requests.push(getTableDescriptionRequest(tableName, function (tblName, description) {
        console.log("Received existing table \"" + tblName + "\" description. Updating local definition");
        baseDefinitions.dynamodbInfo[tblName]['Table'] = description;
      }));
    } else {
      // send out a request to create a new table.
      console.log("Creating new table \"" + tableName + "\"");
    requests.push(getTableCreationRequest(tableName, function (tblName, description) {
        console.log("Created table \"" + tblName + "\" description. Updating local definition");
        baseDefinitions.dynamodbInfo[tblName]['Table'] = description;
      }));
    }
  }

  AwsRequest.createBatch(requests, function (batch) {
    // write out the table.
    var failCount = 0;
    batch.requestArray.forEach(function (request) {
      if (request.response.error) {
        console.log(request.response.error);
        failCount ++;
      }
    })
    if (failCount) {
      console.log("Failed to complete " + failCount + "/" + batch.requestArray.length + " requests.")
    } else {
      console.log("Successfully completed all requests.")
    }
    writeout();
  }).startRequest();
});

function getTableCreationRequest (tableName, callback) {
  return AwsRequest.createRequest({
    serviceName: "dynamodb",
    functionName: "create-table",
    parameters:{
      'attribute-definitions': {type: 'JSONObject', value:baseDefinitions.dynamodbInfo[tableName].attributeDefinitions},
      'table-name': {type: 'string', value:tableName},
      'key-schema': {type: 'JSONObject', value:baseDefinitions.dynamodbInfo[tableName].keySchema},
      'provisioned-throughput': {type: 'JSONObject', value:baseDefinitions.dynamodbInfo[tableName].provisionedThroughput},
      'profile' : {type: 'string', value:AWSCLIUserProfile}
    },
    context:{tableName:tableName},
    returnSchema:'json',
    returnValidation:[{path:['TableDescription'], type:'o'},
    {path:['TableDescription', 'TableArn'], type:'s'}]
  },
  function (request) {
    if (request.response.error) {
      throw request.response.error;
    }
    callback(tableName, request.response.parsedJSON.TableDescription);
  });
}

function getTableDescriptionRequest (tableName, callback) {
  return AwsRequest.createRequest({
    serviceName: "dynamodb",
    functionName: "describe-table",
    parameters:{
      'table-name': {type: 'string', value:tableName},
      'profile' : {type: 'string', value:AWSCLIUserProfile}
    },
    context:{tableName:tableName},
    returnSchema:'json',
    returnValidation:[{path:['Table'], type:'o'},
    {path:['Table', 'TableArn'], type:'s'}]
  },
  function (request) {
    if (request.response.error) {
      throw request.response.error;
    }
    callback(tableName, request.response.parsedJSON.Table);
  });
}

function getTableNameArray (callback){
  AwsRequest.createRequest({
    serviceName: "dynamodb",
    functionName: "list-tables",
    parameters:{
      'max-items': {type: 'string', value:'20'},
      'profile' : {type: 'string', value:AWSCLIUserProfile}
    },
    returnSchema:'json',
    returnValidation:[{path:['TableNames'], type:'a'}]
  },
  function (request) {
    if (request.response.error) {
      throw request.response.error;
    }
    callback(request.response.parsedJSON.TableNames);
  }).startRequest();
}

function writeout() {
  // now delete role
  awsc.updateFile(argv.baseDefinitionsFile, function () {
    return YAML.stringify(baseDefinitions, 6);
  }, function (backupErr, writeErr) {
    if (backupErr) {
      console.log("Could not create backup of \"" + argv.baseDefinitionsFile + "\". configuration was not updated.");
      throw backupErr;
    }
    if (writeErr) {
      console.log("Unable to write updated definitions file.");
      throw writeErr;
    }
    console.log("Done.")
  });
}
