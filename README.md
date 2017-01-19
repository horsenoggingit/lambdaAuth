# lambdaAuth
A framework for native and web applications on AWS using Lambda, Api Gateway, DynamoDB and Cognito Auth.

This project started from a desire to learn about creating apps using AWS lambda as a backend for web and native clients. I also wanted to learn more about lambda (node) and integration with API Gateway, DynamoDB and Cognito for developer authenticated federated identity pools as well as how to manage permissions across AWS resources. Additionally I wanted to learn about the strengths and weaknesses of the AWS CLI for configuration.

The resulting project tackles these goals and provides a simple framework for rapidly deploying APIs backed by lambdas and managing AWS resources so that a project's deployment can be easily recreated, torn down and shared between developers. This framework also supports multiple deployments of a project on a single AWS account.

The default configuration of this project creates a series of API endpoints (/signup, /login, /token, /user/me/get) with associated lambdas, DynamoDB tables and a federated identity pool that allow a user to create accounts and handle the transition from unauthenticated to authenticated API requests. For convenience angular, iOS (and Android coming soon) iOS clients have been provided. The angular client can run locally, but is automatically hosted on S3 for convenience (see the last installation step) - if you want to be fancy you can easly configure cloudfront to serve the site using https and other fancy features. I will discuss this further in the web client section.

# Installation

1. If it isn't installed on your machine install node.js from https://nodejs.org (node is used for local AWS tools as well as lambdas - npm rules!).
2. Create an AWS free account.
3. Add an IAM user to act as proxy (it isn’t good to use your master user day to day)
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

##Framework Overview##
When working with the AWS web gui to build services and configure how services should work together it became quickly apparent that managing and re-creating an infrastucture (collection of services) would become very complex. Also, managing how services are accessed by the business logic in lambdas did not see well defined (e.g. which lambdas have access to which services).

To tackle this issue I've taken the some common AWS services for building an application (dynamoDB, cognito, API Gateway, lambda) and managed their configuration with easy to read and edit yaml definitions files. All the AWS Utilities described in the section below use these definitions files as their primary configuration source.

In the **root** directory of the project you will find **base.definitions.yaml**. This configuration file holds all the information to create the supporting application infrastructure. Here you configure your dynamo tables, identity pools, API Gateway top level information as well as roles and policies for accessing these services from lambda.

**Next introduce the definitions.yaml files in the lambda and client directories**


##AWS Utilities##
TODO

##Project Configuration##
TODO

##Adding a New Endpoint##
To help get the ball rolling new API endpoints can be easily added using a command line tool. After going through the installation process outlined above it should only take a few minutes to add another endpoint and update the clients.

In the root project folder run the command "AWSTools/newEndpoint.js -h".

You will get the following text and parameter definitions. "Helper script to get started with a new endpoint. This script will initialize a new lambda configuration file and setup a boilerplate lambda node.js file. You can start with either post or get method, authed or unauthed, and specify request and response parameters/schema."

In this excersize we will create a new authenticated get endpoint that accepts a parameter and makes a new response object.

Lets say we want to have an endpoint that returns a specific number of users we'd like to introduce to currently authenticated user, we'll call it /intro/Random and it will accept a required parameter "quantity" that is a number representing  how many "user" objects we wish to be returned. We already have a "user" model defined in this project (see the file base.definitions.yaml in the root project directory) so we would like to piggyback off that in the response.

The comand for this is:

`AWSTools/newEndpoint.js --endpoint "/intro/random" --methodExecution "get" --response '{"type": "array", "items": {"$ref": "#/definitions/user"}}' --queryParameters '[{"name":"quantity","type":"number", "required": true}]' --authenticated`

In this command string you can see represented all the requirements we wanted to add:
* `--endpoint` parameter allows use to specify a path for the request
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

`AWSTools/newEndpoint.js --endpoint "/intro/random" --methodExecution "get" --response '{"type": "array", "items": {"$ref": "#/definitions/user"}}' --queryParameters '[{"name":"quantity","type":"number", "required": true}]' --authenticated
AWSTools/updateAWSConstants.js --constantsType lambda
AWSTools/updateLinkedFiles.js --lambdaName introRandom
AWSTools/updateLambdaHandlerEventParams.js
AWSTools/createLambda.js --lambdaName introRandom
AWSTools/coalesceSwaggerAPIDefinition.js
AWSTools/uploadRestAPI.js
AWSTools/deployAPI.js
AWSTools/getClientSDK.js`
