"use strict";
const path = require('path');
const awsu = require(path.join(__dirname, 'awscommonutils'))
const fs = require('fs');
const exec = require('child_process').exec;
const EventEmitter = require('events').EventEmitter;

/**
 * Basically the AWS request  looks like this:
 * aws serviceName functionName --param XX...
 * where XX can be:
 * - simple string
 * - quoted string
 * - quoted JSON
 * - file descriptor
 *
 * The failed case response will have
 * - stderr with a description and error string in paren '(ERROR_TYPE)'
 * - a bunch of stuff that is less important in stdout and in a error object.
 *
 * The success case will ether be an empty output or json
 *
 *
 * I'll use a simple object to descrive what I expect
 * Request Object:
 *
 * serviceName: string
 * functionName: string
 * parameters:
 *      paramName:
 *        type: ["none","string","fileNameBinary", "fileName","jsonString","jsonObject"]
 *        value: ?
 *      ...
 * context: ? -- this is a user defined object to pass context throught the request
 * returnSchema:['none'|'json']
 * returnValidation:
 *      - path:
 *          - string of path names
 *          - ...
 *        type: ['s','o','b','a',{oneOfs:[...]}...]

 *      - ...
 *
 *
 * Response Object
 *
 * stdout: ?
 * stderr: ?
 * err: Error object
 * errorId: parsed from stderr
 * parsedJSON: json parse of stdout
 * verified: bool - did the json pass validation
 * verification error string
 *
 */

exports.createRequest = function createRequest(requestObject, callback) {
  return new AWSRequest(requestObject, callback)
}

class AWSRequest extends EventEmitter {
  constructor(requestObject, callback) {
    super()
    this.callback = callback;
    this.response = {};

    function apply(t,r,params) {
      var infoString = "AWSRequest constructor param parsing";
      Object.keys(params).forEach(function (itemName){
        if (params[itemName].required) {
          // if the parameter is required it should stricly be applied
          awsu.verifyPath(r,[itemName],params[itemName].type,infoString).exitOnError();
          t[itemName] = r[itemName];
        } else {
          // if optional means it should be undefined or null and not be applied, but if
          // it is defined we should stricly check the type
          if (r[itemName] && (typeof r[itemName] != 'undefined')) {
            awsu.verifyPath(r,[itemName],params[itemName].type,infoString).exitOnError();
            t[itemName] = r[itemName];
          }
        }
      });
    }

    apply(this,requestObject,{'serviceName':{type:'s',required:true},
                             'functionName':{type:'s',required:true},
                             'parameters':{type:'o',required:true},
                             'context':{type:'o',required:false},
                             'returnSchema':{type:{oneOfs:['none','json']},required:true},
                             'returnValidation':{type:'a',required:false}});
    var errorContext = "aws request validation object";
    awsu.verifyPath(this,['parameters','*','type'],'s',errorContext).exitOnError();
    if (this.returnValidation) {
      awsu.verifyPath(this,['returnValidation','path'],'a',errorContext).exitOnError();
      awsu.verifyPath(this,['returnValidation','type'],'s',errorContext).exitOnError();
    }
    // check parameters to make sure they are valid
    this.requestInFlight = false;
    this.requestComplete = false;
    this.resonse = null;
    this.retryCount = 0;
  }

  startRequest() {
    this.shouldStartRequest();
    // build the aws request string
    var paramStringArray = [];
    var paramNames = Object.keys(this.parameters);

    for (var i = 0; i < paramNames.length; i++) {
      var paramName = paramNames[i];
      var param = this.parameters[paramName];
      awsu.verifyPath(param,['type'],{oneOfs:["none","string","fileNameBinary", "fileName","JSONString","JSONObject"]},"aws call parameter definition").exitOnError();
      var paramString = "--" + paramName;
      switch (param.type) {
        case 'none':

        break;
        case 'string':
            awsu.verifyPath(param,['value'],'s',"aws call parameter definition", "Parameter \"" + paramName + "\"").exitOnError();
            paramString += " " + param.value
          break;
          case 'fileName':
          awsu.verifyPath(param,['value'],'s',"aws call parameter definition", "Parameter \"" + paramName + "\"").exitOnError();
            paramString += " " + "\"file://" + param.value + "\"";
          break;
          case 'fileNameBinary':
          awsu.verifyPath(param,['value'],'s',"aws call parameter definition", "Parameter \"" + paramName + "\"").exitOnError();
            paramString += " " + "fileb://" + param.value;
          break;
          case 'JSONString':
            awsu.verifyPath(param,['value'],'s',"aws call parameter definition", "Parameter \"" + paramName + "\"").exitOnError();
            paramString += " '" + param.value + "'"
          break;
          case 'JSONObject':
//            awsu.verifyPath(param,['value'],'o',"aws call parameter definition", "Parameter \"" + paramName + "\"").exitOnError();
            paramString += " '" + JSON.stringify(param.value) + "'"
          break;

          default:
      }
      paramStringArray.push(paramString);
    }
    var command = "aws " + [this.serviceName, this.functionName].concat(paramStringArray).join(' ');
    this.awsCommand = command;
    this.executeRequest();
  }

  retry() {
    if (!this.requestComplete) {
      throw new Error("Attenpting to retry a request that has not been started");
    }
    this.requestInFlight = false;
    this.requestComplete = false;
    this.resonse = null;
    this.retryCount++;
    this.startRequest();
  }


  shouldStartRequest() {
    if (this.requestInFlight) {
      throw new Error("Attempting to request an inflight AWS request.")
    }

    if (this.requestComplete) {
      throw new Error("Attempting to request a completed AWS request.")
    }
  }

  executeRequest() {
    this.shouldStartRequest();
    this.emit("AwsRequestStart");
    this.requestInFlight = true;
    var me = this;
    exec(this.awsCommand, function (err, stdout, stderr) {
      me.requestInFlight = false;
      me.requestComplete = true;
      me.response.error = err;
      me.response.stdout = stdout;
      me.response.stderr = stderr;
      if (err) {
        me.requestErrorFunction();
      } else {
        me.requestSuccessFunction();
      }
    });
  }

  requestErrorFunction() {
    // look for first item between paren in stderr
    this.response.errorId = "That String";
    var regExp = /\(([^)]+)\)/;
    var matches = regExp.exec(this.response.stderr);
    if (matches.length > 1) {
      this.response.errorId = matches[1];
    } else {
      this.response.errorId = "unknown"
    }
    this.finisRequest();
  }

  finisRequest() {
    if (this.response.error) {
      if (!this.response.errorId) {
        this.response.errorId = "InternalAwsRequestError"
      }
      this.emit("AwsRequestEndError");
    } else {
      this.emit("AwsRequestEndSuccess");
    }
    if (this.callback && typeof this.callback == 'function') {
      this.callback(this);
    }
    this.emit("AwsRequestEnd");
  }

  requestSuccessFunction () {
    switch (this.returnSchema) {
      case 'none':
      break;
      this.response[parsedJSON] = null;
      var parsedJSON;
      case 'json':
        try {
          parsedJSON = JSON.parse(this.response.stdout);
        } catch (e) {
          this.response.error = e;
          this.finisRequest();
          return;
        } finally {
          this.response.parsedJSON = parsedJSON;
          this.response.error = this.validateJSON();
          if (this.response.error) {
            this.finisRequest();
            return;
          }
        }
      break;
    }

    this.finisRequest();
  }

  validateJSON() {
    if (!this.returnValidation) {
      return null;
    }
    for (var i = 0; i < this.returnValidation.length; i++) {
      var verifyResult = awsu.verifyPath(this.response.parsedJSON, this.returnValidation[i].path, this.returnValidation[i].type,"aws json response", this.awsCommand);
      if (verifyResult.isVerifyError) {
        return new Error(verifyResult.toString());
      }
    }
    return null;
  }
}

exports.AWSRequest = AWSRequest;

exports.createBatch = function createBatch(requestArray, callback) {
  return new AWSRequestBatch(requestArray, callback);
}

class AWSRequestBatch  extends EventEmitter {
  constructor(requestArray, callback) {
    super();
    this.callback = callback;
    this.requestArray = requestArray;
    this.requestsInFlight = false;
    this.requestComplete = false;
  }

  checkRequestStatus() {
    for (var i = 0; i < this.requestArray.length; i++) {
      if (!this.requestArray[i].requestComplete) {
        return false;
      }
    }
    this.requestInFlight = false;
    this.requestComplete = true;
    this.emit("AwsRequestEnd");
    if (this.callback && typeof this.callback == 'function') {
      this.callback(this);
    }
  }

  startRequest(){
    this.shouldStartRequest();
    var me = this;
    this.requestArray.forEach(function(request) {
      request.on("AwsRequestEnd", function () {
        me.checkRequestStatus();
      });
      request.startRequest();
    });
    this.requestInFlight = true;
    this.emit("AwsRequestStart");
  }

  shouldStartRequest() {
    if (this.requestInFlight) {
      throw new Error("Attempting to request an inflight AWS Batch request.")
    }

    if (this.requestComplete) {
      throw new Error("Attempting to request a completed AWS Batch request.")
    }
  }
}

exports.AWSRequestBatch = AWSRequestBatch;
