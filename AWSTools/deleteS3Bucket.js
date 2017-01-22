#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Deletes the s3 bucket and removes it from the client defiition file.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('l','clientDefinitionsDir')
.describe('l','directory that contains client definition files and implementations.')
.default('l','./clients')
.alias('t', 'type')
.describe('t','create client or lambda buckets.')
.choices('t', ['lambda', 'webClient'])
.require(['t'])
.help('h')
.alias('h', 'help');
const argv = yargs.argv;


if (!fs.existsSync(argv.baseDefinitionsFile)) {
    console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
    yargs.showHelp("log");
    process.exit(1);
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

if (!fs.existsSync(argv.clientDefinitionsDir)) {
    yargs.showHelp("log");
    throw new Error("Clients path \"" + argv.clientDefinitionsDir + "\" not found.");
}

var AWSCLIUserProfile = "default";
if (!awsc.verifyPath(baseDefinitions,['environment', 'AWSCLIUserProfile'],'s').isVerifyError) {
    AWSCLIUserProfile = baseDefinitions.environment.AWSCLIUserProfile;
} else {
    console.log("using \"default\" AWSCLIUserProfile");
}

if (argv.type === 'webClient') {
    forEachLambdaDefinition(function (fileName) {
        // here we would want to fork to do ops in parallel
        var definitions = YAML.load(path.join(argv.clientDefinitionsDir,fileName));
        deleteBucketForDefinitions(definitions, path.join(argv.clientDefinitionsDir,fileName));
    });
} else if (argv.type === 'lambda') {
    deleteBucketForDefinitions(baseDefinitions, argv.baseDefinitionsFile);
}

function deleteBucketForDefinitions(definitions, fileName) {
    if (typeof definitions !== 'object') {
        throw new Error("Definitions file \"" + fileName + "\" could not be parsed");
    }

    if (awsc.verifyPath(definitions, ['s3Info', 'buckets'], 'o', 'in angular client definition file').isVerifyError) {
        console.log("No buckets defined in '" + fileName + "'");
    }

    Object.keys(definitions.s3Info.buckets).forEach(function (bucketPrefix) {
        console.log("Deleting bucket '" + bucketPrefix + "'");

        if (!awsc.verifyPath(definitions, ['s3Info', 'buckets', bucketPrefix, 'name'], 's', 'in angular client definition file').isVerifyError) {
            deleteBucket(bucketPrefix, definitions, function (err, bucketPrefix, definitions) {
                if (err) {
                    console.log(err);
                }
                delete definitions.s3Info.buckets[bucketPrefix].name;
                delete definitions.s3Info.buckets[bucketPrefix].location;
                writeOut(fileName, definitions, "bucket name was not removed.", function () {
                    console.log("Done.");
                });
            });
        } else {
            console.log('No bucket name found. Nothing to remove.');
        }
    });
}

function deleteBucket(bucketPrefix, definitions, callback) {

    AWSRequest.createRequest(
        {
            serviceName: "s3",
            functionName: "rb",
            context:{bucketPrefix: bucketPrefix, definitions : definitions},
            parameters: {
                'force' : {type:'none', value:""},
                'profile' : {type:'string', value:AWSCLIUserProfile},
            },
            customParamString: "s3://" + definitions.s3Info.buckets[bucketPrefix].name,
            returnSchema: 'none',
        },
        function (request) {
            callback(request.response.error, request.context.bucketPrefix, request.context.definitions);
        }
    ).startRequest();
}

function forEachLambdaDefinition (callback, doneCallback) {
    fs.readdir(argv.clientDefinitionsDir, function (err, files) {
        if (err) {
            throw err;
        }

        for (var index = 0; index < files.length; index++) {
            var fileName = files[index];
            var fileNameComponents = fileName.split('.');
            if ((fileNameComponents.length === 3) && (fileNameComponents[0] === 'angular') && (fileNameComponents[1] === "definitions") && (fileNameComponents[2] === "yaml")) {
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
        if (doneCallback) {
            doneCallback();
        }
    });
}

function writeOut(fileName, data, errorMsg, callback) {
    awsc.updateFile(fileName, function () {
        return YAML.stringify(data, 15);
    }, function (backupErr, writeErr) {
        if (backupErr) {
            console.log("Could not create backup of \"" + fileName + "\". " + errorMsg);
            throw backupErr;
        }
        if (writeErr) {
            console.log("Unable to write updated definitions file.");
            throw writeErr;
        }
        callback();
    });
}
