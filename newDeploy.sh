#!/bin/bash

# create roles and attach policies
AWSTools/createRole.js --roleType lambda
AWSTools/createRole.js --roleType api

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
