#!/bin/bash

# create roles and attach policies
AWSTools/createRole.js --roleType lambda
AWSTools/createRole.js --roleType api
AWSTools/createRole.js --roleType cognito

# create storage (db and identity pool)
AWSTools/createDynamodb.js
AWSTools/createIdentityPool.js

# create lambdas

# make sure all linked files are present
AWSTools/updateLinkedFiles.js

# update expected api parameters for validation
AWSTools/updateLambdaHandlerEventParams.js

# update constants for accessing AWS resources
AWSTools/updateLambdaAWSConstants.js

# finally create new lambdas
AWSTools/createLambda.js

# create API
AWSTools/coalesceSwaggerAPIDefinition.js
AWSTools/createRestAPI.js

# deploy API
AWSTools/deployAPI.js

# get the SDK's for the clients
AWSTools/getClientSDK.js

# create s3 bucket for Angular app distribution
AWSTools/createAngularClientBucket.js

# now that we have a bucket we can sync the static angular substitue
AWSTools/syncAngularClientBucket.js
