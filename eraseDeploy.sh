#!/bin/bash

# remove API
AWSTools/deleteRestAPI.js

# remove lambdas
AWSTools/deleteLambda.js

# remove dbs
AWSTools/deleteDynamodb.js

# remove identity pools
AWSTools/deleteIdentityPool.js

# remove S3 buckets
AWSTools/deleteS3Bucket.js --type lambda

# remove roles
AWSTools/deleteRole.js --roleType api
AWSTools/deleteRole.js --roleType lambda
AWSTools/deleteRole.js --roleType cognito

#remove security groups and VPCs
AWSTools/deleteSecurityGroup.js
AWSTools/deleteSubnet.js
AWSTools/deleteVPC.js

# remove Angular client s3 bucket
AWSTools/deleteS3Bucket.js --type webClient

# remove memcache - done last because this operation can take 5 minutes
AWSTools/createElastiCache.js
