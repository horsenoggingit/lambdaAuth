#!/bin/bash
#
./AWSTools/updateLambdaHandlerEventParams.js \
--lambdaName signup

if [ $? -eq 0 ]; then
  ./AWSTools/uploadLambda.js \
  --lambdaName signup
else
  echo "Upload failed: updateLambdaHandlerEventParams failed"
fi
