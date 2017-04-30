# lambdaAuth
A framework for full stack native and web applications on AWS using Lambda, Api Gateway, DynamoDB, Cognito Auth, S3 and ElastiCache (memcached).

This project started from a desire to learn about creating apps using AWS lambda as a backend for web and native clients. I also wanted to learn more about lambda (node) and integration with API Gateway, S3, DynamoDB and Cognito for developer authenticated federated identity pools as well as how to manage permissions across AWS resources. Additionally I wanted to learn about the strengths and weaknesses of the AWS CLI for configuration.

The resulting project tackles these goals and provides a simple framework for rapidly deploying APIs backed by lambdas and managing AWS resources so that a project's deployment can be easily recreated, torn down and shared between developers. This framework also supports multiple deployments of a project on a single AWS account. (Currently working on allowing shared resources on an AWS account, for example a shared User table, that might be useful for development).

The default configuration of this project creates a series of API endpoints (/signup, /login, /token, /user/me/get, user/photo/uploadurl/get) with associated lambdas, DynamoDB tables, s3 buckets and a federated identity pool that allow a user to create accounts and handle the transition from unauthenticated to authenticated API requests. The /signup endpoint also uses ElastiCache (memcached) to perform rudimentary throttling. Since ElastiCache requires the lambda to work in a VPC this endpoint also shows how to configure a lambda to work both inside a VPC and have access to non VPC services on the open internet. This default configuration allows users to upload photos and shows how to configure s3 bucket events to trigger lambdas.

For convenience angular, iOS (and Android coming soon) iOS clients have been provided. The angular client can run locally, but is automatically hosted on S3 for convenience (see the last installation step) - if you want to be fancy you can easly configure cloudfront to serve the site using https and other features. I will discuss this further in the web client section.

# Installation

1. If it isn't installed on your machine install node.js from https://nodejs.org (node is used for local AWS tools as well as lambdas - npm rules!).
2. Create an AWS free account.
3. Add an IAM user in the us-east-1 region to act as proxy (it isn’t good to use your master user day to day)
  * http://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html
4. Install the AWS CLI
  * http://docs.aws.amazon.com/cli/latest/userguide/installing.html
  * Configure the CLI
    http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html
  * Configure a local profile
    http://docs.aws.amazon.com/cli/latest/userguide/cli-roles.html
    for convenience call the profile “adminuser” (instead of “marketingadmin” as in the example).
5. In the root project directory (it will have a package.json file) run: “npm install”
  * this installs all the node packages needed for the utility files and the lambdas.
6. Install the Angular client components.
  * Change directory to "clients/angular/lambda-auth” (this is the root folder of the angular web client) and run “npm install” (this installs all the components of the angular app)
7. Build the backend
  * go back to the "root project folder” (“cd ..; cd ..; cd ..”)
  * run "npm start”
    * This will build the backend configuration and upload the angular app to s3. The last line will give you the URL of the site that you can just paste into a browser. e.g. http://testlambdaauth.s3-website-us-east-1.amazonaws.com
  * run "npm stop" to remove everything that was built with "npm start".

Now you can signup and login to the test app through the Angular client. To configure the iOS client do the following:

1. You are going to need to install Xcode (from the app store) and CocoaPods (https://cocoapods.org)
2. "cd" to "clients/iOS/lambdaAuth"
3. Run "pod install" in this directory.
  * this can take a really long time the first time doing a "pod install". Look here to accelerate the process: http://stackoverflow.com/questions/21022638/pod-install-is-staying-on-setting-up-cocoapods-master-repo
4. Build and Run in Xcode!

Android coming soon...

# Documentation #
This project started as my Hello World app for javascript and node.js. As such there is an evident evolution of coding patterns as I became familiar with the language. I will be improving the situation. By and large you will likely see that this project is written by a long time client developer, so please be forgiving.

## Framework Overview ##
When working with the AWS web gui to build services and configure how services should work together it became quickly apparent that managing and re-creating an infrastucture (collection of services) would become very complex. Also, managing how services are accessed by the business logic in lambdas did not see well defined (e.g. which lambdas have access to which services).

To tackle this issue I've taken the some common AWS services for building an application (dynamoDB, cognito, API Gateway, lambda) and managed their configuration with easy to read and edit yaml definitions files. All the AWS Utilities described in the section below use these definitions files as their primary configuration source.

In the **root** directory of the project you will find **base.definitions.yaml**. This configuration file holds all the information to create the supporting application infrastructure. Here you configure your dynamo tables, identity pools, API Gateway top level information as well as roles and policies for accessing these services from lambda.

**Next introduce the definitions.yaml files in the lambda and client directories**

## Adding a New Endpoint ##
To help get the ball rolling new API endpoints can be easily added using a command line tool. After going through the installation process outlined above it should only take a few minutes to add another endpoint and update the clients.

In the root project folder run the command "AWSTools/newEndpoint.js -h".

You will get the following text and parameter definitions. "Helper script to get started with a new endpoint. This script will initialize a new lambda configuration file and setup a boilerplate lambda node.js file. You can start with either post or get method, authed or unauthed, and specify request and response parameters/schema."

In this excersize we will create a new authenticated get endpoint that accepts a parameter and makes a new response object.

Lets say we want to have an endpoint that returns a specific number of users we'd like to introduce to currently authenticated user, we'll call it /intro/random and it will accept a required parameter "quantity" that is a number representing  how many "user" objects we wish to be returned. We already have a "user" model defined in this project (see the file base.definitions.yaml in the root project directory) so we would like to piggyback off that in the response.

The comand for this is:

`AWSTools/newEndpoint.js --endpoint "/intro/random" --methodExecution "get" --response '{"type": "array", "items": {"$ref": "#/definitions/user"}}' --queryParameters '[{"name":"quantity","type":"number", "required": true}]' --authenticated`

In this command string you can see represented all the requirements we wanted to add:
* `--endpoint` parameter used to specify a path for the request
* `--methodExecution` indicates that we would like to use the get method.
* `--response` is a simple json schema object that follows http://json-schema.org and references the already define "user" object
* `--queryParameters` is another simple json array that creates a query parameter "quantity" of type "number" that is required
* `--authenticated` means that only authenticated users can access this endpoint.

After execution you should see that the definitions file `lambdas/introRandom.definitions.yaml` is created along with a node.js template lambda file called `lambdas/introRandom/introRandom.js`.

The `lambdas/introRandom.definitions.yaml` holds all the information about which resources the lambda leverages (supporting node.js files, aws resoures like congito or dynamoDB) as well as permission configurations. You can change these to suit your needs. By default the new enpoint's lambda is configured to use parameter validation, and have access to the `Users` dynamo table. Also these command-line created endpoints will support CORS and have a number of error responses defined.

Next we'll get this endpoint into the cloud!

Since the endpoint uses AWS resource we should update the automatically generated constants file by executing:

 `AWSTools/updateAWSConstants.js --constantsType lambda`

This adds constants files to all the lambda function directories that reflect the resources specified in their definitions files. Check out `lambdas/introRandom/AWSConstants.json` to see the newly created constant file that has definitions for the `Users` dynamoDB table.

 Next we want to pull in all the utilities and suport files for our new lambda by executing:

  `AWSTools/updateLinkedFiles.js --lambdaName introRandom`

You don't have to add the `--lambdaName` parameter if you want to just update all lambdas. This goes for all AWSTools commands. The file `lambdas/introRandom/APIParamVerify.js` has been introduced to the directory as specified in the definitions file. This will assist in doing parameter checking.

Next we want to pull into the lambda infomation about the input parameters that it should expect from APIGateway:

 `AWSTools/updateLambdaHandlerEventParams.js`

You'll see that the file `lambdas/introRandom/eventParams.json` has been added to the project. If you take a look at this JSON object you will see that our input parameters `quanitiy` is defined under `"queryParams"` as well as information about the authenticated user from cognito under `awsParams`.

Now we can create the lambda in our AWS environment:

 `AWSTools/createLambda.js --lambdaName introRandom`

This command lints the files being uploaded (you can ignor warnings about unused variable definitions) and creates a new lambda function. The new lambda ARN is stored in the `lambdas/introRandom.definitions.yaml` file so it can be referenced by other services. You can see the new lambda in the [AWS Lambda console](https://console.aws.amazon.com/lambda/home?region=us-east-1#/functions?display=list).

Now we can package the updated API:

 `AWSTools/coalesceSwaggerAPIDefinition.js`

You will see that that the file `swaggerAPI.yaml` file in the root directory has been updated with the new definition.

Finally we upload the API and deploy it:

 `AWSTools/uploadRestAPI.js`

 `AWSTools/deployAPI.js`

Now our new lambda backed API is live and ready to go!

Since the API is deployed we can update the client SDKs by downloading the new auto generated API clients:

 `AWSTools/getClientSDK.js`

This command updates all client SDKs that are defined in the client directory (for the moment Angular and iOS).

At the moment this API doens't 'do' anything except return errors if required parameters are not specified. Now you can add the business logic you want in `lambdas/introRandom/introRandom.js`.

You can copy and paste the following to the command line to do everthing in one shot:
```
AWSTools/newEndpoint.js --endpoint "/intro/random" --methodExecution "get" --response '{"type": "array", "items": {"$ref": "#/definitions/user"}}' --queryParameters '[{"name":"quantity","type":"number", "required": true}]' --authenticated;  
AWSTools/updateAWSConstants.js --constantsType lambda;  
AWSTools/updateLinkedFiles.js --lambdaName introRandom;  
AWSTools/updateLambdaHandlerEventParams.js;  
AWSTools/createLambda.js --lambdaName introRandom;  
AWSTools/coalesceSwaggerAPIDefinition.js;  
AWSTools/uploadRestAPI.js;  
AWSTools/deployAPI.js;  
AWSTools/getClientSDK.js; 
```

## AWS Utilities ##

The follwing utilities parse the various definitions files to create or destroy AWS resources. They are intended to be executed in the project root folder and their defaults should be sufficient for most cases. If a lambda or client is not specified the action will occur on all lambdas or clients in scope.

```
** coalesceSwaggerAPIDefinition.js **
Create a single API definitions file to upload to AWS.
x-amazon-apigateway-integration fields are updated with latest role and lambda
arn.
Usage: coalesceSwaggerAPIDefinition.js [options]

Options:
  -s, --baseDefinitionsFile        yaml file that contains top level definitions
                                   including swagger template header
                                            [default: "./base.definitions.yaml"]
  -l, --lambdaDefinitionsDir       directory containing lambda definition yaml
                                   files                  [default: "./lambdas"]
  -o, --outputFilename             coalesced yaml file for upload to AWS
                                                    [default: "swaggerAPI.yaml"]
  -c, --commonModelDefinitionFile  yaml file with common definitions of models
  -h, --help                       Show help                           [boolean]

** createDynamodb.js **
Create the tables required for the project.
If a table with the same name already exists a new table
will not be create and the existing table information will be used.
Usage: createDynamodb.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your
                             dynamodb (dynamodbInfo)
                                            [default: "./base.definitions.yaml"]
  -k                         a specific dynamo table key to process (the name of
                             the db is environment.AWSResourceNamePrefix + key).
                             If not specified all db found will be created
  -h, --help                 Show help                                 [boolean]

** createElastiCache.js **
Creates ElastiCache clusters. This method will wait until the cache cluster is
'available' (necessary so configurationEndpoint is defined).
Usage: createElastiCache.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** createIdentityPool.js **
Create the identity pools required for the project.
If identity pools with the same name already exist a new pool will not be
created and the existing pool infomation will be used.
Usage: createIdentityPool.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** createInternetGateway.js **
Creates Internet Gateways and assignes them to a VPC.
Usage: createInternetGateway.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** createLambda.js **
Create the lambdas for the project.
If a lambda with the same name already exists the operation will fail.
Use "deleteLambda" first to remove the exisiting function.
Usage: createLambda.js [options]

Options:
  -s, --baseDefinitionsFile   yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -l, --lambdaDefinitionsDir  directory that contains lambda definition files
                              and implementations. <lambdaName>.zip archives
                              will be placed here.        [default: "./lambdas"]
  -n, --lambdaName            a specific lambda to process. If not specified all
                              lambdas found will be uploaded
  -a, --archiveOnly           Only perform archive operation. Do not upload
  -u, --updateArnLambda       ignore existing "arnLambda" in "lambdaInfo"
                              section of definitions file and overwrite new
                              value on success
  -h, --help                  Show help                                [boolean]

** createNatGateway.js **
Creates NAT Gateways and assignes them to a VPC.
Usage: createNatGateway.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** createRestAPI.js **
Create a new API
Usage: createRestAPI.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -a, --apiDefinitionFile    yaml swagger API file to upload to AWS
                                                  [default: "./swaggerAPI.yaml"]
  -u, --updateAWSId          ignore existing "awsId" in "apiInfo" section of
                             base definitions file and overwrite new value on
                             success
  -h, --help                 Show help                                 [boolean]

** createRole.js **
Create project roles and attach policies.
Usage: createRole.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -t, --roleType             which roles to create [api | lambda | cognito]
                                [required] [choices: "api", "lambda", "cognito"]
  -h, --help                 Show help                                 [boolean]

** createRouteTable.js **
Creates Route Tables.
Usage: createRouteTable.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** createS3Bucket.js **
Creates an s3 bucket if needed and configures as static web host.
Usage: createS3Bucket.js [options]

Options:
  -s, --baseDefinitionsFile   yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -l, --clientDefinitionsDir  directory that contains client definition files
                              and implementations.        [default: "./clients"]
  -t, --type                  create client or lambda buckets.
                                     [required] [choices: "lambda", "webClient"]
  -h, --help                  Show help                                [boolean]

** createSubnet.js **
Creates Subnets to use with VPCs.
Usage: createSubnet.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** createVPC.js **
Creates VPCs. By default VPCs come with a default ACL and Security Group
Usage: createVPC.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** deleteDynamodb.js **
Delete project dynamodb.
Usage: deleteDynamodb.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your
                             dynamodb (dynamodbInfo)
                                            [default: "./base.definitions.yaml"]
  -n                         a specific dynamo table key to process. If not
                             specified all tables found will be deleted
  -h, --help                 Show help                                 [boolean]

** deleteElastiCache.js **
Creates ElastiCache clusters.
Usage: deleteElastiCache.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** deleteIdentityPool.js **
Delete project identity pools.
Usage: deleteIdentityPool.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** deleteInternetGateway.js **
Delete Internet Gateways and assignes them to a VPC.
Usage: deleteInternetGateway.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** deleteLambda.js **
Delete the project lambdas.
Usage: deleteLambda.js [options]

Options:
  -s, --baseDefinitionsFile   yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -l, --lambdaDefinitionsDir  directory that contains lambda definition files
                              and implementations. <lambdaName>.zip archives
                              will be placed here.        [default: "./lambdas"]
  -n, --lambdaName            a specific lambda to process. If not specified all
                              lambdas found will be uploaded
  -h, --help                  Show help                                [boolean]

** deleteNatGateway.js **
Creates NAT Gateways and assignes them to a VPC.
Usage: deleteNatGateway.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** deleteRestAPI.js **
Delete project API definitions.
Usage: deleteRestAPI.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** deleteRole.js **
Delete a role, detaching policies first.
Note: at the moment this script only detaches policies specified
in config files.
Usage: deleteRole.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -t, --roleType             which roles to delete
                                [required] [choices: "api", "lambda", "cognito"]
  -h, --help                 Show help                                 [boolean]

** deleteRouteTable.js **
Deletes Route Tables and Associations.
Usage: deleteRouteTable.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** deleteS3Bucket.js **
Deletes the s3 bucket and removes it from the client defiition file.
Usage: deleteS3Bucket.js [options]

Options:
  -s, --baseDefinitionsFile   yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -l, --clientDefinitionsDir  directory that contains client definition files
                              and implementations.        [default: "./clients"]
  -t, --type                  create client or lambda buckets.
                                     [required] [choices: "lambda", "webClient"]
  -h, --help                  Show help                                [boolean]

** deleteSubnet.js **
Delete Subnets.
Usage: deleteSubnet.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** deleteVPC.js **
Delete VPCs.
Usage: deleteVPC.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -h, --help                 Show help                                 [boolean]

** deployAPI.js **
Deploy API to a stage.
Usage: deployAPI.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -d, --description          The description for the  Deployment resource to
                             create.          [default: "Yet another deploy..."]
  -t, --stageName            The name of the Stage resource for the Deployment
                             resource to create.                [default: "dev"]
  -h, --help                 Show help                                 [boolean]

** deployParameters.js **
Print or delete deploy parameters from project.
WARNING: You cannot recover these settings and will have to remove the deploy
manually in the AWS console once deleted.
Usage: deployParameters.js <command> [options] filename

Commands:
  print             print current parameters
  delete            remove current parameters
  save <fileName>   store parameters in YAML format to file
  apply <fileName>  overwrite current parameters with saved file

Options:
  -s, --baseDefinitionsFile   yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -l, --lambdaDefinitionsDir  directory that contains lambda definition files
                              and implementations.        [default: "./lambdas"]
  -c, --clientDefinitionsDir  directory that contains client definition files
                              and implementations.        [default: "./clients"]
  -h, --help                  Show help                                [boolean]

Examples:
  deployParameters.js save foo.js  save parameters to the given file

** getClientSDK.js **
Get AWS API Gateway SDK for the project clients.
Usage: getClientSDK.js [options]

Options:
  -s, --baseDefinitionsFile   yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -l, --clientDefinitionsDir  directory that contains client definition files
                              and implementations.        [default: "./clients"]
  -n, --clientName            a specific client to process. If not specified all
                              clients found will be uploaded
  -h, --help                  Show help                                [boolean]

** newEndpoint.js **
Helper script to get started with a new endpoint. This script will initialize a
new lambda configuration file and setup a boilerplate lambda node.js file. You
can start with either post or get method, authed or unauthed, and specify
request and response parameters/schema.
Usage: newEndpoint.js [options]

Options:
  -s, --baseDefinitionsFile    yaml file that contains information about your
                               dynamodb (dynamodbInfo)
                                            [default: "./base.definitions.yaml"]
  -l, --lambdaDefinitionsDir  directory that contains lambda definition files
                              and implementations.        [default: "./lambdas"]
  -e, --endpoint              The url path (e.g. '/user/me'). The lambda for
                              this endpoint will be camel case of the path
                              components ('userMe')                   [required]
  -a, --authenticated         If present the endpoint will require
                              authentication.
  -b, --bodyParameters        Swagger compliant parameter definition json array
                              object. e.g. [{"name": "param_1",
                              "type":"string"},{"name": "param_2",
                              "type":"number", "required: true"}]
  -d, --sharedBodyParameters  Name of parameter object defined in the base
                              definitions file at apiInfo.sharedDefinitions.
                              e.g. "user"
  -q, --queryParameters       Swagger compliant parameter definitions json array
                              object. e.g. [{"name": "param_1",
                              "type":"string"},{"name": "param_2",
                              "type":"number", "required: true"}]
  -r, --response              Swagger compliant parameter definitions json
                              schema object (http://json-schema.org). e.g.
                              {"required" : ["username"], "properties":
                              {"username" : {"type": "string"}, "age" : {"type":
                              "number"}}
  -o, --sharedResponse        Name of response object defined in the base
                              definitions file at apiInfo.sharedDefinitions.
                              e.g. "user"
  -m, --methodExecution       Select method execution type for API
                                             [required] [choices: "get", "post"]
  -h, --help                  Show help                                [boolean]

** syncAngularClientBucket.js **
Syncs client angular files to their s3 bucket. Creates the bucket if needed and
configures as static web host.
Usage: syncAngularClientBucket.js [options]

Options:
  -s, --baseDefinitionsFile   yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -l, --clientDefinitionsDir  directory that contains client definition files
                              and implementations.        [default: "./clients"]
  -h, --help                  Show help                                [boolean]

** updateAWSConstants.js **
Create a json description of constants needed to access AWS services.
Usage: updateAWSConstants.js [options]

Options:
  -l, --definitionsDir       directory containing definition yaml files
  -s, --baseDefinitionsFile  yaml file that contains information about your
                             dynamodb (dynamodbInfo)
                                            [default: "./base.definitions.yaml"]
  -o, --outputFilename       name of file that will be added to each lambda
                             directory            [default: "AWSConstants.json"]
  -n, --lambdaName           update handler event params for only this lambda
                             directory
  -t, --constantsType        which constants to update [lambda | client]
                                        [required] [choices: "lambda", "client"]
  -h, --help                 Show help                                 [boolean]

** updateDynamodb.js **
-bash: ./updateDynamodb.js: Permission denied
** updateLambdaHandlerEventParams.js **
Create a json description compatible with APIParamVerify.js to validate lambda
input arguments from API.
Usage: updateLambdaHandlerEventParams.js [options]

Options:
  -l, --lambdaDefinitionsDir  directory containing lambda definition yaml files
                                                          [default: "./lambdas"]
  -o, --outputFilename        name of file that will be added to each lambda
                              directory            [default: "eventParams.json"]
  -n, --lambdaName            update handler event params for only this lambda
                              directory
  -h, --help                  Show help                                [boolean]

** updateLinkedFiles.js **
Removes and re-creates link files base on linkFiles in
[your_lambda].definitions.yaml.
Usage: updateLinkedFiles.js [options]

Options:
  -l, --lambdaDefinitionsDir  Directory containing lambda definition yaml files
                                                          [default: "./lambdas"]
  -n, --lambdaName            Only process links for this lambda
  -c, --cleanOnly             Just delete the links
  -h, --help                  Show help                                [boolean]

** uploadLambda.js **
Update project lambdas.
"createLambda" should have been previously called.
"Usage: uploadLambda.js [options]

Options:
  -s, --baseDefinitionsFile                 yaml file that contains information
                                            about your API
                                            [default: "./base.definitions.yaml"]
  -l, --lambdaDefinitionsDir,               directory that contains lambda
  --lambdaDefinitionsDir                    definition files and
                                            implementations. <lambdaName>.zip
                                            archives will be placed here.
                                                          [default: "./lambdas"]
  -n, --lambdaName                          a specific lambda to process. If not
                                            specified all lambdas found will be
                                            uploaded
  -a, --archiveOnly                         Only perform archive operation. Do
                                            not upload
  -h, --help                                Show help                  [boolean]

** uploadRestAPI.js **
Upldate project API.
"createAPI" should have been previously called.
Usage: uploadRestAPI.js [options]

Options:
  -s, --baseDefinitionsFile  yaml file that contains information about your API
                                            [default: "./base.definitions.yaml"]
  -a, --apiDefinitionFile    yaml swagger API file to upload to AWS
                                                  [default: "./swaggerAPI.yaml"]
  -h, --help                 Show help                                 [boolean]

```



## Project Configuration ##
TODO
