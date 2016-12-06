#!/bin/bash

./AWSTools/coalesceSwaggerAPIDefinition.js \
--outputFilename swaggerAPI.yaml

if [ $? -eq 0 ]; then
  ./AWSTools/uploadRestAPI.js --APIDefinition swaggerAPI.yaml \
  --AWSUserProfile adminuser
else
  echo "Upload failed: coalesceSwaggerAPIDefinition failed"
fi
