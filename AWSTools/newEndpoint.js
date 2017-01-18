#!/usr/bin/env node

const path = require('path');
const awsc = require(path.join(__dirname, 'awscommonutils'));
const fs = require('fs');
const YAML = require('yamljs');

const yargs = require('yargs')
.usage('Helper script to get started with a new endpoint. This script will initialize a new lambda configuration file and setup a boilerplate lambda node.js file. You can start with either post or get method, authed or unauthed, and specify request and response parameters/schema.\nUsage: $0 [options]')
.alias('s', 'baseDefinitionsFile')
.describe('s',' yaml file that contains information about your dynamodb (dynamodbInfo)')
.default('s', './base.definitions.yaml')
.alias('l','lambdaDefinitionsDir')
.describe('l','directory that contains lambda definition files and implementations.')
.default('l','./lambdas')
.alias('e','endpoint')
.describe('e',"The url path (e.g. '/user/me'). The lambda for this endpoint will be camel case of the path components ('userMe')")
.alias('a', 'authenticated')
.describe('a', "If present the endpoint will require authentication.")
.alias('b', 'bodyParameters')
.describe('b', 'Swagger compliant parameter definition json array object. e.g. [{"name": "param_1", "type":"string"},{"name": "param_2", "type":"number", "required: true"}]')
.alias('d', 'sharedBodyParameters')
.describe('d', 'Name of parameter object defined in the base definitions file at apiInfo.sharedDefinitions. e.g. "user"')
.alias('q', 'queryParameters')
.describe('q', 'Swagger compliant parameter definitions json array object. e.g. [{"name": "param_1", "type":"string"},{"name": "param_2", "type":"number", "required: true"}]')
.alias('r', 'response')
.describe('r', 'Swagger compliant parameter definitions json schema object (http://json-schema.org). e.g. {"required" : ["username"], "properties": {"username" : {"type": "string"}, "age" : {"type": "number"}}')
.alias('o','sharedResponse')
.describe('o', 'Name of response object defined in the base definitions file at apiInfo.sharedDefinitions. e.g. "user"')
.alias('m', 'methodExecution')
.describe('m', 'Select method execution type for API')
.choices('m', ['get', 'post'])
.required(['e', 'm'])
.help('h')
.alias('h', 'help');
const argv = yargs.argv;

if (!fs.existsSync(argv.baseDefinitionsFile)) {
    console.log("Base definitions file \"" + argv.baseDefinitionsFile + "\" not found.");
    yargs.showHelp("log");
    process.exit(1);
}

var baseDefinitions = YAML.load(argv.baseDefinitionsFile);

if (argv.sharedResponse && argv.response) {
    throw new Error("Please 'sharedResponse' or 'response', not both.");
}

if (argv.sharedBodyParameters && argv.bodyParameters) {
    throw new Error("Please 'sharedBodyParameters' or 'bodyParameters', not both.");
}

// check to make sure that if a shared response node is defined it exists in base definitions
if (argv.sharedResponse) {
    if (!baseDefinitions.apiInfo.sharedDefinitions[argv.sharedResponse]) {
        throw new Error("Shared response node is not defined in base definitions '" + argv.baseDefinitionsFile + "' file at 'apiInfo.sharedDefinitions'.");
    }
}

if (argv.sharedBodyParameters) {
    if (!baseDefinitions.apiInfo.sharedDefinitions[argv.sharedBodyParameters]) {
        throw new Error("Shared parameter node is not defined in base definitions '" + argv.baseDefinitionsFile + "' file at 'apiInfo.sharedDefinitions'.");
    }
}

if (argv.methodExecution === "get" && (argv.sharedBodyParameters || argv.bodyParameters)) {
    throw new Error("'get' method does not support body parameters.");
}

var pathComponents = argv.endpoint.split("/");
var lambdaName = "";
pathComponents.forEach(function (component) {
    if (component.length > 0 && lambdaName.length > 0) {
        component = component[0].toUpperCase() + component.slice(1);
    }
    lambdaName += component;
});

// check if the definitions file exists
var newDefinitionsFile = path.join(argv.lambdaDefinitionsDir, lambdaName + '.definitions.yaml');
var newLambdaDir = path.join(argv.lambdaDefinitionsDir, lambdaName);
var newLambdaFile = path.join(newLambdaDir, lambdaName + '.js');

// if (fs.existsSync(newDefinitionsFile)) {
//     throw new Error("Definitions file already exists.");
// }

var templateDefPathName;
var templateLambdaPathName;

switch (argv.methodExecution) {
    case 'get':
        templateDefPathName = path.join(__dirname, 'templates', 'lambdaGetTemplate.definitions.yaml');
        templateLambdaPathName = path.join(__dirname, 'templates', 'lambdaPostTemplate.js');
        break;
    case 'post':
        templateDefPathName = path.join(__dirname, 'templates', 'lambdaPostTemplate.definitions.yaml');
        templateLambdaPathName = path.join(__dirname, 'templates', 'lambdaPostTemplate.js');
        break;
    default:

}

var templateFile = fs.readFileSync(templateDefPathName,'utf8');
var regexp = new RegExp("{[$]lambdaName}", "g");
templateFile = templateFile.replace(regexp, lambdaName);
regexp = new RegExp("{[$]urlPath}", "g");
templateFile = templateFile.replace(regexp, argv.endpoint);

var templateDefinitions = YAML.parse(templateFile);
if (!argv.authenticated) {
    delete templateDefinitions.apiInfo.paths[argv.endpoint][argv.methodExecution].security;
}

if (argv.sharedResponse || argv.response) {
    console.log("Adding response.");
}
if (argv.sharedResponse) {
    templateDefinitions.apiInfo.paths[argv.endpoint][argv.methodExecution].responses['200'].schema = {'$ref' : '#/definitions/' + argv.sharedResponse};
} else {
    delete templateDefinitions.apiInfo.paths[argv.endpoint][argv.methodExecution].responses['200'].schema;
}

if (argv.response) {
    // now add the parameters to the base definition file

    templateDefinitions.apiInfo.paths[argv.endpoint][argv.methodExecution].responses['200'].schema = {'$ref' : '#/definitions/' + lambdaName + "Response"};

    baseDefinitions.apiInfo.sharedDefinitions[lambdaName + "Response"] = JSON.parse(argv.response);
    fs.writeFileSync(argv.baseDefinitionsFile, YAML.stringify(baseDefinitions, 15));
}

// now handle how the endpoint params map to the lambda handler event

var authedEndpointDefaultMapping = "{ \"awsParams\" = {\n \"identity_id\" : \"$context.identity.cognitoIdentityId\",\n \"auth_provider\" : \"$context.identity.cognitoAuthenticationProvider\",\n \"auth_type\" : \"$context.identity.cognitoAuthenticationType\",\n \"identitypool_id\" : \"$context.identity.cognitoIdentityPoolId\"\n} $insertMapper }";
var unauthedEndpointDefaultMappin = "{$insertMapper}";

var endpointMappingJSONString = (argv.authenticated) ? authedEndpointDefaultMapping : unauthedEndpointDefaultMappin;
var has_mapped_params = (argv.authenticated);

var paramMapper;

if (argv.bodyParameters) {
    // convert from individual parameter definitions to a schema
    var params = JSON.parse(argv.bodyParameters);
    var outParam = {required: [], properties:{}, type: 'object'};
    params.forEach(function (parameterBlock) {
        if (parameterBlock.required) {
            outParam.required.push(parameterBlock.name);
        }
        outParam.properties[parameterBlock.name] = {type: parameterBlock.type};
    });
    argv.bodyParameters = JSON.stringify(outParam);
}

if (argv.sharedBodyParameters) {
    // fetch the parameter definition
    argv.bodyParameters = JSON.stringify(baseDefinitions.apiInfo.sharedDefinitions[argv.sharedBodyParameters]);
}

// To simplify things expect json in body, just map all params over.
// The query parameters should be extracted from the map and assinged to their own object.
if (argv.bodyParameters) {
    if (argv.methodExecution === 'post') {
        paramMapper = "\"bodyParams\": $input.json('$$'), \"queryParams\": {#foreach($queryParam in $input.params().querystring.keySet())\"$queryParam\": \"$util.escapeJavaScript($input.params().querystring.get($queryParam))\" #if($foreach.hasNext),#end #end }";
    } else if (argv.methodExecution === 'get') {
        paramMapper = "\"queryParams\": {#foreach($queryParam in $input.params().querystring.keySet())\"$queryParam\": \"$util.escapeJavaScript($input.params().querystring.get($queryParam))\" #if($foreach.hasNext),#end #end }";
    }
} else {
    paramMapper = "";
    has_mapped_params = false;
}

if (has_mapped_params) {
    paramMapper = ",\n " + paramMapper;
}

var mapperRegexp = new RegExp("[$]insertMapper", "g");

endpointMappingJSONString = endpointMappingJSONString.replace(mapperRegexp, paramMapper);

templateDefinitions.apiInfo.paths[argv.endpoint][argv.methodExecution]['x-amazon-apigateway-integration'].requestTemplates['application/json'] = endpointMappingJSONString;

// update definitions to handle expected event parameters (eventParamPaths)
var authedEventParamPaths = { awsParams: {
                                    type: 'object',
                                    required: ["aws_identity_id", "aws_auth_provider", "aws_auth_type", "aws_identitypool_id"],
                                    properties: {
                                        aws_identity_id: {type: "string"},
                                        aws_auth_provider:  {type: "string"},
                                        aws_auth_type: {type: "string"},
                                        aws_identitypool_id: {type: "string"}
                                    }
                                }
                            };
var unauthedEventParamPaths = {
                              };
var eventParamPaths = (argv.authenticated) ? authedEventParamPaths : unauthedEventParamPaths;

if (argv.bodyParameters) {
    eventParamPaths.bodyParams = JSON.parse(argv.bodyParameters);
}

if (argv.queryParameters) {
    eventParamPaths.queryParams = {
                                    type: 'object',
                                    required: [],
                                    properties: {},
                                };
    var qParam = JSON.parse(argv.queryParameters);
    qParam.forEach(function (paramBlock) {
        if (paramBlock.required) {
            eventParamPaths.queryParams.required.push(paramBlock.name);
        }
        eventParamPaths.queryParams.properties[paramBlock.name] = {type: paramBlock.type};
    });
}

templateDefinitions.lambdaInfo.eventParamPaths[argv.endpoint][argv.methodExecution] = eventParamPaths;

// now update the swagger template sections for params
if (argv.bodyParameters && argv.methodExecution === 'post') {
    var requestName;
    if (argv.sharedBodyParameters) {
        requestName = argv.sharedBodyParameters;
    } else {
        requestName = lambdaName + "Request";
    }
    var postInputParamSection = [{
                                    name: requestName,
                                    in: "body",
                                    required: true,
                                    schema: {
                                        "$ref": '#/definitions/' + requestName
                                    }
                                }];
    templateDefinitions.apiInfo.paths[argv.endpoint][argv.methodExecution].parameters = postInputParamSection;
    // now add the parameters to the base definition file
    if (!argv.sharedBodyParameters) {
        var params = JSON.parse(argv.bodyParameters);
        var sharedDefinition = {
                                        type: 'object',
                                        required: [],
                                        properties: {}
                                      };
          if (params.required) {
              params.required.forEach(function (requiredParam) {
                  sharedDefinition.required.push(requiredParam);
              });
          }
          if (params.properties) {
              Object.keys(params.properties).forEach(function (propertyName) {
                  sharedDefinition.properties[propertyName] = params.properties[propertyName];
              });
          }

        baseDefinitions.apiInfo.sharedDefinitions[requestName] = sharedDefinition;
        fs.writeFileSync(argv.baseDefinitionsFile, YAML.stringify(baseDefinitions, 15));
    }
}

// add any query parameters
if (argv.queryParameters) {
    if (!templateDefinitions.apiInfo.paths[argv.endpoint][argv.methodExecution].parameters) {
        templateDefinitions.apiInfo.paths[argv.endpoint][argv.methodExecution].parameters = [];
    }
    var params = JSON.parse(argv.queryParameters);

    params.forEach(function (parameterObj) {
        parameterObj.in = "query";
        templateDefinitions.apiInfo.paths[argv.endpoint][argv.methodExecution].parameters.push(parameterObj);
    });
}
console.log("Writing new definitions file " + newDefinitionsFile);
fs.writeFileSync(newDefinitionsFile, YAML.stringify(templateDefinitions, 15));

// create the path to the new lambda
awsc.createPath(newLambdaDir);

console.log("Creating new template lambda node.js file " + newLambdaFile);

// process the lambda js file
var lambdaFile = fs.readFileSync(templateLambdaPathName,'utf8');
regexp = new RegExp("{[$]lambdaName}", "g");
lambdaFile = lambdaFile.replace(regexp, lambdaName);
regexp = new RegExp("{[$]urlPath}", "g");
lambdaFile = lambdaFile.replace(regexp, argv.endpoint);

fs.writeFileSync(newLambdaFile, lambdaFile);

console.log("Done.");
