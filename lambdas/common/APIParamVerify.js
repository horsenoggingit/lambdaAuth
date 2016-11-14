"use strict";

var fs = require('fs');
var paramDefs = JSON.parse(fs.readFileSync('eventParams.json', 'utf8'));

/**
 * verify Verify API Parameters
 * @param  {string} APIPath   API path
 * @param  {string} reqMode   API mode: GET, POST...
 * @param  {object|string|number|array} params parameter to verify
 * @return {object|null}   returns null on success
 */
function verify(APIPath, reqMode, params) {

  var definitions = paramDefs[APIPath][reqMode];
  if (typeof paramDefs[APIPath] != 'object') {
    console.log("Undefined API Path \"" + APIPath + "\"");
    // this is a 404
    return {
      errorType : "NotFound",
      httpStatus : 404,
      requestId : "",
      message : "Invalid Resource"
    };
  }
  
  if (typeof paramDefs[APIPath][reqMode] != 'object') {
    console.log("Undefined request mode \"" + reqMode + "\"");
    // not sure about this one
    return {
      errorType : "MethodNotAllowed",
      httpStatus : 405,
      requestId : "",
      message : "Request method is not supported for the requested resource"
    };
  }

  var errorMessage;
  var errorType;
  if (typeof definitions == 'object') {
    // check typeof
    switch(definitions.type) {
      case "object":
      // lets check for required params
      if (typeof params == 'object') {
        var keys = Object.keys(params);
        if (Array.isArray(definitions.required)) {
          for (var index = 0; index < definitions.required.length; index++) {
            if (keys.indexOf(definitions.required[index]) === -1) {
              return {
                errorType : "BadRequest",
                httpStatus : 400,
                requestId : "",
                message : "Validation error: missing required parameter \"" + definitions.required[index] + "\"."
              }
            }
          }
        } else {
          console.log("no required parameters")
        }
        // now lets validate types
        if (typeof definitions.properties == 'object') {
          for (var index = 0; index < keys.length; index++) {
            var expectedType = definitions.properties[keys[index]];
            if (expectedType) {
              switch (expectedType) {
                case 'object':
                if (typeof params == 'object') {

                } else {
                  return {
                    errorType : "BadRequest",
                    httpStatus : 400,
                    requestId : "",
                    message : "Validation error: parameter \"" + keys[index] + "\" is not object."
                  }
                }
                break;
                case 'number':
                if (typeof params == 'number') {

                } else {
                  return {
                    errorType : "BadRequest",
                    httpStatus : 400,
                    requestId : "",
                    message : "Validation error: parameter \"" + keys[index] + "\" is not number."
                  }
                }
                break;
                case 'string':
                if (typeof params[keys[index]] == 'string') {
                  // continue
                } else {
                  return {
                    errorType : "BadRequest",
                    httpStatus : 400,
                    requestId : "",
                    message : "Validation error: parameter \"" + keys[index] + "\" is not string."
                  }
                }
                break;
                case 'array':
                if (Array.isArray(params[keys[index]])) {

                } else {
                  return {
                    errorType : "BadRequest",
                    httpStatus : 400,
                    requestId : "",
                    message : "Validation error: parameter \"" + keys[index] + "\" is not array."
                  }
                }

                break;
                default:
                console.log("unexpected object parameter")
              }
            }

          }
        } else {
          console.log("no properties")
        }
      } else {
        return {
          errorType : "BadRequest",
          httpStatus : 400,
          requestId : "",
          message : "Validation error: expected object."
        }
      }
      break;
      case "string":
      if (typeof params == 'string') {
        return null;
      } else {
        return {
          errorType : "BadRequest",
          httpStatus : 400,
          requestId : "",
          message : "Validation error: expected string."
        }
      }

      break;
      case "array":
      if (Array.isArray(params)) {
        return null;
      } else {
        return {
          errorType : "BadRequest",
          httpStatus : 400,
          requestId : "",
          message : "Validation error: expected array."
        }
      }

      break;
      case "number":
      if (typeof params == 'number') {
        return null;
      } else {
        return {
          errorType : "BadRequest",
          httpStatus : 400,
          requestId : "",
          message : "Validation error: expected string."
        }
      }
      break;
      default:
    }
  }
}

exports.verify = verify;
