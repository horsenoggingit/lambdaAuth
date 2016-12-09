'use strict';

// Declare app level module which depends on views, and components
angular.module('lambdaAuth', [
  'sharedInfo',
  'awsAPIClients',
  'ngRoute',
  'signupModule',
  'loginModule',
  'frontpageModule',
  'topbarModule'
]).
config(['$locationProvider', '$routeProvider' ,function($locationProvider, $routeProvider) {
  $locationProvider.hashPrefix('!');
  $routeProvider.when('/signup', {
    template: '<topbar menu-name="signupLoginList" selected-item="signupItem"></topbar><signup></signup>'
  }).
  when('/login', {
    template: '<topbar menu-name="signupLoginList" selected-item="loginItem"></topbar><login></login>'
  }).
  when('/frontpage', {
    template: '<topbar menu-name="frontpageList" selected-item=""></topbar><frontpage></frontpage>'
  }).
  otherwise('/signup')

}]);
