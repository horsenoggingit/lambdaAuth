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
TODO
