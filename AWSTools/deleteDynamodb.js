#!/usr/bin/env node

const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AwsRequest = require(path.join(__dirname, 'AwsRequest'));
const fs = require('fs');
const YAML = require('yamljs');

var yargs = require('yargs')
.usage('Delete project dynamodb.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your dynamodb (dynamodbInfo)')
.default('s','./base.definitions.yaml')
.alias('k','dynamoTableKey')
.describe('n','a specific dynamo table key to process. If not specified all tables found will be deleted')
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
if (!awsc.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
  AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
} else {
  console.log("using \"default\" AWSCLIUserProfile");
}


var localDbKeys = Object.keys(baseDefinitions.dynamodbInfo);
if (argv.dynamoTableKey) {
  awsc.verifyPath(baseDefinitions,['dynamodbInfo', argv.dynamoTableKey], 'a', "definitions file \"" + argv.baseDefinitionsFile + "\"").exitOnError();
  localDbKeys = [argv.dynamoTableKey];
}

var requests = [];

for (var keyIndex = 0; keyIndex < localDbKeys.length; keyIndex++) {
  var tableKey = localDbKeys[keyIndex];
  var tableName;
  if (baseDefinitions.environment.AWSResourceNamePrefix) {
    tableName = baseDefinitions.environment.AWSResourceNamePrefix + tableKey;
  } else {
    tableName = tableKey;
  }

  // send out a request to delete a new table.
  console.log("Deleting table \"" + tableName + "\"");
  requests.push(getTableDeletionRequest(tableKey, tableName, function (tblKey, tblName, description) {
    console.log("Deleted table \"" + tblName + "\" description. Updating local definition");
    delete baseDefinitions.dynamodbInfo[tblKey].Table;
  }));
};

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


function getTableDeletionRequest (tableKey, tableName, callback) {
  return AwsRequest.createRequest({
    serviceName: "dynamodb",
    functionName: "delete-table",
    parameters:{
      'table-name': {type: 'string', value:tableName},
      'profile' : {type: 'string', value:AWSCLIUserProfile}
    },
    context:{tableName: tableName, tableKey: tableKey},
    returnSchema:'json',
    returnValidation:[{path:['TableDescription'], type:'o'},
    {path:['TableDescription', 'TableArn'], type:'s'}]
  },
  function (request) {
    if (request.response.error) {
      throw request.response.error;
    }
    callback(request.context.tableKey, request.context.tableName, request.response.parsedJSON.Table);
  });
}

function writeout() {
  // now delete role
  awsc.updateFile(argv.baseDefinitionsFile, function () {
    return YAML.stringify(baseDefinitions, 15);
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
