'use strict';

// Declare app level module which depends on views, and components
angular.module('lambdaAuth', [
  'sharedInfo',
  'awsAPIClients',
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
