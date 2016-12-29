# lambdaAuth
A Framework for native and web applications on AWS using Lambda, Api Gateway, DynamoDB and Cognito Auth.

This project started from of a desire to learn about creating apps using AWS lambda as a backend for web and native clients. I also wanted to learn more about lambda (node) and integration with API Gateway, DynamoDB and Cognito for developer authenticated federated identity pools as well as how to manage permissions across AWS resources. I also wanted to learn about the strengths and weaknesses of the AWS CLI for configuration.

The resulting project tackles these goals and provides a simple framework for rapidly deploying APIs backed by lambdas and managing AWS resources so that a projects deployment can be easily recreated and torn down. This framework also supports multiple deployments of a project on a single AWS account.

The default configuration of this project creates a series of APIs (/signup, /login, /user/me/get), lambdas, DynamoDB tables and a federated identity pool that allow a user to create accounts and handle the transition from unauthenticated to authenticated API requests. For convenience  angular and (coming soon) iOs clients have been provided. The angular client can run locally, but is automatically hosted on S3 for convenience.

# Installation

1. Install node (node is used for local AWS tools as well as lambdas).
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
    * This will build the backend configuration and upload the angular app to s3. The last line will give you the URL of the site that you can just paste into a browser. e.g. http://lambdaauth2972.s3-website-us-east-1.amazonaws.com
  * run "npm stop" to remove everything that was built with "npm start".
    
# Documentation #
This project started as my Hello World app for javascript and node.js. As such there is an evident evolution of coding patterns as I became familiar with the language. I will be improving the situation.

##Framework Overview##
When working with the AWS web gui to build services and configure how services should work together it became quickly apparent that managing and re-creating an infrastucture (collection of services) would become very complex. Also, managing how services are accessed by the business logic in lambdas did not see well defined (e.g. which lambdas have access to which services).

To tackle this issue I've taken the some common AWS services for building an application (dynamoDB, cognito, API Gateway, lambda) and manage their configuration with easy to read and edit yaml files.

In the **root** directory of the project you will find **base.definitions.yaml**. This configuration file holds all the information to create the supporting application infrastructure. Here you configure your dynamo tables, identity pools, API Gateway top level information as well as roles and policies for accessing these services from lambda.

**Next introduce the definitions.yaml files in the lambda and client directories**


##AWS Utilities##
TODO

##Project Configuration##
TODO

