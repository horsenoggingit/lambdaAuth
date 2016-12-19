"use strict"

var fs = require('fs');
const exec = require('child_process').exec;
var path = require('path');

class VerifyResultString extends Object {
  constructor (errorMessage, isVerifyError) {
    super();
    if (typeof isVerifyError == 'boolean') {
      this.isVerifyError = isVerifyError;
    } else {
      this.isVerifyError = false;
    }

    this.errorMessage = errorMessage;
  }
  toString() {
    return this.errorMessage;
  }
  exitOnError() {
    if (this.isVerifyError) {
      throw new Error(this.errorMessage);
    }
  }
  callbackOnError(callback) {
    if (this.isVerifyError) {
      callback(this);
    }
    return(this);
  }
}

exports.VerifyResultString = VerifyResultString;

exports.verifyPath = function verifyPath(structure, pathArray, leafTypeKey, itemName, extraString) {
  var leafTypes = {'s' : 'string',
                   'n' : 'number',
                   'o' : 'object',
                   'a' : 'array',
                   'f' : 'function',
                   'b' : 'boolean'
                  }
  if (!extraString) {
    extraString = "";
  }
  var result = checkPath(structure, pathArray, leafTypeKey);
  if (!result) {
    return new VerifyResultString();
  }
  var path = pathArray.join('.');
  var errorString;
  var key1String;
  var key2String;
  if (typeof leafTypeKey == 'object') {
    errorString = "Failed validation of action \"" + result.failAction + "\". "
    if (result.failIndex === 0) {
      switch (result.failAction) {
        case oneOfs:
          key1String = 'string ([' + leafTypeKey.oneOfs.join("|") + '])'
          key2String = leafTypes[getTypeKey(structure)];
        break;
        default:
      }
    }

  } else {
    errorString ="";
    key1String = leafTypes[leafTypeKey];
    key2String = leafTypes[getTypeKey(structure)];
  }
  if (result.failIndex === 0) {
    errorString += "The item \"" + path + "\" of expected type \"" + key1String + "\" was not found because the \"" + itemName + "\" was of type " + key2String + ". " + extraString;
  } else if (result.failIndex < pathArray.length) {
    errorString += "The item \"" + path + "\" of expected type \"" + key1String + "\" in the " + itemName + " was not found because \"" + pathArray[result.failIndex - 1] + "\" was not an object. It was of type \"" + leafTypes[result.failType] + "\". " + extraString;
  } else {
    errorString += "The item \"" + path + "\" of expected type \"" + key1String + "\" in the " + itemName + " was not found because \"" + pathArray[result.failIndex - 1] + "\" was of type \"" + leafTypes[result.failType] + "\"." + extraString;
  }

  var x = new VerifyResultString(errorString, true);

  return x;
}

function checkPath(structure, pathArray, leafTypeKey) {
  var items = [structure];

  var index = 0;
  var typeResult = 'x';
  for (; index < pathArray.length; index++) {
    var nextItems = [];
    var breakOut = false;
    for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
      var item = items[itemIndex];
      typeResult = getTypeKey(item);
      switch (typeResult) {
        case 'a':
        // if it is an array push each item for verification on the next pass
          item.forEach(function (arrayItem) {
            nextItems.push(arrayItem[pathArray[index]]);
          })
        break;
        case 'o':
        // when * is encountere on the path we push each item regardles of key.
          if (pathArray[index] === '*') {
            Object.keys(item).forEach(function (itemKey) {
              nextItems.push(item[itemKey]);
            })
          } else {
            nextItems.push(item[pathArray[index]]);
          }
        break;
        default:
          breakOut = true;
      }
      if (breakOut) {
        break;
      }
    }
    if (breakOut) {
      break;
    }
    items = nextItems;
  }
  if (index!= pathArray.length) {
    return {failIndex:index, failType:typeResult};
  }
  for (itemIndex = 0; itemIndex < items.length; itemIndex++) {
    var item = items[itemIndex];
    typeResult = getTypeKey(item);
    // if the leadTypeKey is an object check to see which command should be executed
    if (typeof leafTypeKey == 'object') {
      var actions = Object.keys(leafTypeKey);
      for (var oneOfsIndex = 0; oneOfsIndex < actions.length; oneOfsIndex ++) {
        var action = actions[oneOfsIndex];
        switch (action) {
          case 'oneOfs':
            // value for oneOfs is an array of strings.
            if ((typeResult !== 's') || (leafTypeKey[action].indexOf(item)) < 0) {
              return {failIndex:index, failType:typeResult, failAction:action};
            }
          break;
          console.log("Unrecognized leafTypeKey command: " + action);
          default:
        }

      }
    } else if (typeResult != leafTypeKey) {
      return {failIndex:index, failType:typeResult};
    }
  }
  return null;
}


function getTypeKey(item) {
  var typeKey = 'u';
  switch (typeof item) {
    case 'string':
      typeKey = 's';
    break;
    case 'number':
      typeKey = 'n';
    break;
    case 'boolean':
      typeKey = 'b';
    break;
    case 'object':
      // null
      if (!item) {
        typeKey = 'n'
      } else if (Array.isArray(item)) {
        typeKey = 'a'
      } else {
        typeKey = 'o'
      }
    break;
    case 'undefined':
      typeKey = 'u';
    break;
    case 'function':
      typeKey = 'f';
    break;
    case 'symbol':
      typeKey = 's';
    break;
    default:
    typeKey = 'u';
  }
  return typeKey;
}

exports.updateFile = function updateFile(fName, dataCallback, callback) {
  if (fs.existsSync(fName + ".old")) {
      fs.unlinkSync(fName + ".old");
  }
  setTimeout(function () {
    fs.rename(fName, fName + ".old", function (err){
      if (err) {
        callback(err,null);
        return;
      }
      setTimeout(function () {
        fs.writeFile(fName, dataCallback(), function (err) {
          if (err) {
            callback(null,err);
            return;
          }
          callback(null,null);
        });
      },250);
    });
  }, 250);
}
