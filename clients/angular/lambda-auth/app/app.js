'use strict';

angular.module('menuProperties',[]).
value('menus',{signupLoginList: [{item: 'signupItem', name:'Signup', href:'#!/signup'},
              {item:'loginItem', name:'Login', href:'#!/login'}],
            authedList : [{item: 'logoutItem', name:'Logout', href:'#!/logout'}]});

// Declare app level module which depends on views, and components
angular.module('lambdaAuth', [
  'sharedInfo',
  'awsAPIClients',
  'ngRoute',
  'signupModule',
  'loginModule',
  'frontpageModule',
  'logoutModule',
  'menuProperties',
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
    template: '<topbar menu-name="authedList" selected-item=""></topbar><frontpage></frontpage>'
  }).
  when('/logout', {
    template: '<topbar menu-name="signupLoginList" selected-item=""></topbar><logout></logout>'
  }).
  otherwise('/signup')

}]);
