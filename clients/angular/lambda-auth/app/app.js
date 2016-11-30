'use strict';

var awsAPIClientModule = angular.module("awsAPIClientModule", []);
awsAPIClientModule.provider('apigClient'  , function () {
  this.$get = function () {
    return apigClientFactory.newClient();
  };
});


// Declare app level module which depends on views, and components
angular.module('lambdaAuth', [
  'awsAPIClientModule',
  'ngRoute',
  'signup',
  'login'
]).
config(['$locationProvider', '$routeProvider' ,function($locationProvider, $routeProvider) {

  $locationProvider.hashPrefix('!');
  $routeProvider.when('/signup', {
    template: '<signup></signup>'
  }).
  when('/login', {
    template: '<login></login>'
  }).
  otherwise('/signup')

}]);
