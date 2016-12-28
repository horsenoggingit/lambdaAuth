# lambdaAuth
Framework for native and web applications on AWS using Lambda, Api Gateway, DynamoDB and Cognito Auth.

This project came out of a desire to learn about creating apps using AWS as a backend leveraging the API code generator for web and native clients. I also wanted to learn more about lambda (node) and integration with API Gateway, DynamoDB and Cognito for developer authenticated federated identity pools as well as how to manage permissions across AWS resources. I also wanted to learn about the strengths and weaknesses of the AWS CLI for configuration.

The the resulting project tackles these goals and also provides a simple framework for rapidly deploying APIs and managing AWS resources so that a projects deployment can be easily recreated and torn down. This framework also supports multiple deployments of a project on a single aws account.

The default configuration of this project creates a series of APIs (/signup, /login, /user/me/get), lambdas, DynamoDB tables and a federated identity pool that allow a user to create accounts and handle the transition from unauthenticated to authenticated API requests. For convenience  angular and (coming soon) iOs clients have been provided. The angular project can run locally, but is automatically hosted on S3 for convenience.
