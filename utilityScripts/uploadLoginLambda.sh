#!/bin/bash
#
./AWSTools/updateLambdaHandlerEventParams.js \
--lambdaName login

if [ $? -eq 0 ]; then
  ./AWSTools/uploadLambda.js \
  --lambdaName login
else
  echo "Upload failed: updateLambdaHandlerEventParams failed"
fi
