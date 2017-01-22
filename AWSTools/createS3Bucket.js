#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Creates an s3 bucket if needed and configures as static web host.\nUsage: $0 [options]')
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
var argv = yargs.argv;


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
        var definitions = YAML.load(path.join(argv.clientDefinitionsDir, fileName));
        createBucketForDefinitions(definitions, path.join(argv.clientDefinitionsDir,fileName));
    });
} else if (argv.type === 'lambda') {
    createBucketForDefinitions(baseDefinitions, argv.baseDefinitionsFile);
}

function createBucketForDefinitions(definitions, fileName) {
    if (typeof definitions !== 'object') {
        throw new Error("Definitions file \"" + fileName + "\" could not be parsed");
    }

    if (awsc.verifyPath(definitions, ['s3Info', 'buckets'], 'o', 'in angular client definition file').isVerifyError) {
        console.log("No buckets defined in '" + fileName + "'");
    }

    Object.keys(definitions.s3Info.buckets).forEach(function (bucketPrefix) {
       console.log("Creating bucket '" + bucketPrefix + "'");
       if (awsc.verifyPath(definitions, ['s3Info', 'buckets', bucketPrefix, 'name'], 's', 'in angular client definition file').isVerifyError) {
            // no bucket - lets create one.
            createBucket(bucketPrefix, definitions, fileName, function (err, bucketPrefix, definitions, fileName) {
                if (err) {
                    throw err;
                }
                enableWeb(bucketPrefix, definitions, function (err, bucketPrefix) {
                    if (err) {
                        delete definitions.s3Info.buckets[bucketPrefix].name;
                        delete definitions.s3Info.buckets[bucketPrefix].Location;
                        writeOut(fileName, definitions, "bucket name was not removed.", function () {
                            throw err;
                        });
                        return;
                    }
                    addBucketPolicy(bucketPrefix, definitions, function (err) {
                        if (err) {
                            delete definitions.s3Info.buckets[bucketPrefix].name;
                            delete definitions.s3Info.buckets[bucketPrefix].Location;
                            writeOut(fileName, definitions, "bucket name was not removed.", function () {
                                throw err;
                            });
                            return;
                        }
                        console.log('Done.');
                    });
                });
            });
        } else {
            console.log('Bucket already defined. Use "deleteAngularClientBucket.js" first.');
        }
    });
}

function createBucket(bucketPrefix, definitions, fileName, callback, attemptNo) {
    var bucketName = bucketPrefix;

    if (awsc.isValidAWSResourceNamePrefix(baseDefinitions, argv.baseDefinitionsFile)) {
        bucketName = baseDefinitions.environment.AWSResourceNamePrefix + bucketName;
    }

    awsc.verifyPath(definitions, ['s3Info', 'buckets', bucketPrefix, 'region'], 's', 'angular definition object').exitOnError();
    if (typeof attemptNo !== 'undefined') {
        bucketName = bucketName + zeroPadInteger(6, Math.floor(Math.random() * 100000));
    } else {
        attemptNo = 0;
    }
    AWSRequest.createRequest(
        {
            serviceName: "s3api",
            functionName: "create-bucket",
            context:{bucketPrefix: bucketPrefix, fileName: fileName, attemptNo: attemptNo, callback: callback, definitions : definitions},
            parameters: {
                'bucket' : {type:'string', value:bucketName},
                'region' : {type:'string', value:definitions.s3Info.buckets[bucketPrefix].region},
                'profile' : {type:'string', value:AWSCLIUserProfile}
            },
            returnSchema: 'json',
            returnValidation:[{path:['Location'], type:'s'}]
        },
        function (request) {
            if (request.response.error) {
                // try to create one with another name
                if (attemptNo > 4) {
                    throw request.response.error;
                }
                createBucket(request.context.bucketPrefix, request.context.definitions, request.context.fileName, request.context.callback, request.context.attemptNo + 1);
            } else {
                console.log(request.response.parsedJSON);
                request.context.definitions.s3Info.buckets[bucketPrefix].name = request.parameters.bucket.value;
                request.context.definitions.s3Info.buckets[bucketPrefix].location = request.response.parsedJSON.Location;
                writeOut(request.context.fileName, request.context.definitions, "Bucket name was not updated.", function () {
                    callback(null, request.context.bucketPrefix, request.context.definitions, request.context.fileName);
                });
            }
        }
    ).startRequest();
}

function zeroPadInteger(n, value) {
    value = Math.floor(value);
    var nd = Math.floor(Math.log10(value)) + 1;
    if (n <= nd) {
        return value.toString();
    } else {
        var pre = (new Array(n-nd)).fill('0');
        return pre.join('') + value;
    }
}

function enableWeb(bucketPrefix, definitions, callback) {
    if (!awsc.verifyPath(definitions,['s3Info', 'buckets', bucketPrefix, 'websiteConfiguration'],'o').isVerifyError) {
        console.log("Found bucket websiteConfiguration.");
        AWSRequest.createRequest(
            {
                serviceName: "s3api",
                functionName: "put-bucket-website",
                parameters: {
                    'bucket' : {type:'string', value: definitions.s3Info.buckets[bucketPrefix].name},
                    'website-configuration' : {type:'JSONObject', value: definitions.s3Info.buckets[bucketPrefix].websiteConfiguration},
                    'profile' : {type:'string', value:AWSCLIUserProfile}
                },
                returnSchema: 'none',
            },
            function (request) {
                if (request.response.error) {
                    callback(request.response.error, null);
                } else {
                    console.log("Put bucket websiteConfiguration.");
                    console.log('Site URL is: http://' + definitions.s3Info.buckets[bucketPrefix].name + ".s3-website-" + definitions.s3Info.buckets[bucketPrefix].region + ".amazonaws.com");
                    callback(null, bucketPrefix);
                }
            }
        ).startRequest();
    } else {
        callback(null, bucketPrefix);
    }
}

function addBucketPolicy(bucketPrefix, definitions, callback) {
    if (!awsc.verifyPath(definitions,['s3Info', 'buckets', bucketPrefix, 'policy'],'o').isVerifyError) {
        console.log("Found bucket policy.");
        // substitute any occurrence of $name in Resources with bucket name.
        var policy = definitions.s3Info.buckets[bucketPrefix].policy;
        for (var index = 0; index < policy.Statement.length; index++) {
            policy.Statement[index].Resource = policy.Statement[index].Resource.replace('$name', definitions.s3Info.buckets[bucketPrefix].name);
        }
        AWSRequest.createRequest(
            {
                serviceName: "s3api",
                functionName: "put-bucket-policy",
                parameters: {
                    'bucket' : {type:'string', value: definitions.s3Info.buckets[bucketPrefix].name},
                    'policy' : {type:'JSONObject', value: definitions.s3Info.buckets[bucketPrefix].policy},
                    'profile' : {type:'string', value:AWSCLIUserProfile}
                },
                returnSchema: 'none',
            },
            function (request) {
                if (request.response.error) {
                    callback(request.response.error, null);
                } else {
                    console.log("Put bucket policy.");
                    callback(null, bucketPrefix);
                }
            }
        ).startRequest();
    } else {
        callback(null, bucketPrefix);
    }
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
