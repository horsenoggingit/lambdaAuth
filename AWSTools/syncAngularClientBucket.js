#!/usr/bin/env node

const fs = require('fs');
const YAML = require('yamljs');
const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const AWSRequest = require(path.join(__dirname, 'AWSRequest'));

const yargs = require('yargs')
.usage('Syncs client angular files to their s3 bucket. Creates the bucket if needed and configures as static web host.\nUsage: $0 [options]')
.alias('s','baseDefinitionsFile')
.describe('s','yaml file that contains information about your API')
.default('s','./base.definitions.yaml')
.alias('l','clientDefinitionsDir')
.describe('l','directory that contains client definition files and implementations.')
.default('l','./clients')
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

console.log("Syncing angular client files to s3 bucket.");
forEachLambdaDefinition(function (fileName) {
    // here we would want to fork to do ops in parallel
    var definitions = YAML.load(path.join(argv.clientDefinitionsDir,fileName));
    if (typeof definitions !== 'object') {
        throw new Error("Definitions file \"" + fileName + "\" could not be parsed");
    }

    if (!awsc.verifyPath(definitions, ['s3Info', 'buckets'], 'o', 'in angular client definition file').isVerifyError) {
        Object.keys(definitions.s3Info.buckets).forEach(function (bucketPrefix) {
            var bucketInfo = definitions.s3Info.buckets[bucketPrefix];
            if ((!awsc.verifyPath(bucketInfo, ['name'], 's', 'in angular client definition file').isVerifyError) &&
            (!awsc.verifyPath(bucketInfo, ['fileSyncInfo', 'syncPath'], 's', 'in angular client definition file').isVerifyError)) {

                console.log("Syncing bucket \"" + bucketInfo.name + "\".");
                syncFiles(bucketInfo, function (err, bucketInfo) {
                    if (err) {
                        throw err;
                    } else {
                        console.log('Site URL is: http://' + bucketInfo.name + ".s3-website-" + bucketInfo.region + ".amazonaws.com");
                        console.log("Done.");
                    }
                });
            } else {
                console.log("Nothing to do.");
            }
        });
    }


});

function syncFiles(bucketInfo, callback) {

    var customParamString = path.join(argv.clientDefinitionsDir, bucketInfo.fileSyncInfo.syncPath);
    customParamString += " s3://" + bucketInfo.name;
    if (!awsc.verifyPath(bucketInfo, ['fileSyncInfo', 'syncExclusions'], 'a', 'in angular client bucket definition').isVerifyError) {
        for (var index = 0; index < bucketInfo.fileSyncInfo.syncExclusions.length; index ++) {
            customParamString += ' --exclude "' + bucketInfo.fileSyncInfo.syncExclusions[index] + '"';
        }
    }

    var params = {'profile' : {type: 'string', value: AWSCLIUserProfile}};
    if (!awsc.verifyPath(bucketInfo, ['fileSyncInfo', 'acl'], 's', 'in angular client bucket definition').isVerifyError) {
        params.acl = {type:'string', value: bucketInfo.fileSyncInfo.acl};
    }
    AWSRequest.createRequest(
        {
            serviceName: "s3",
            functionName: "sync",
            parameters: params,
            customParamString: customParamString,
            returnSchema: 'none'
        },
        function (request) {
            if (!request.response.error) {
                console.log(request.response.stdout);
            }
            callback(request.response.error, bucketInfo);
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
