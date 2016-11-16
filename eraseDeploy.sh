#!/bin/bash

# remove API
AWSTools/deleteRestAPI.js

# remove lambdas INCOMPLETE
AWSTools/deleteLambda.js

# remove dbs
AWSTools/deleteDynamodb.js

# remove identity pools
AWSTools/deleteIdentityPool.js

# remove roles
AWSTools/deleteRole.js --roleType api
AWSTools/deleteRole.js --roleType lambda
AWSTools/deleteRole.js --roleType cognito
