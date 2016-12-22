'use strict';

function logout(authService, $scope, $timeout) {
  var ctrl = this;
  ctrl.logoutTitle = "Logout";
  ctrl.logoutText = "Logging out...";

  // There is no need to get the authService.authedClient() to log out the user. Just call
  // authService.clearAll(). In this case I want to show that we can determine if there
  // is a user currently logged in.
  authService.authedClient(function(client,err) {
    // authedClient() not return immediately
    $timeout(function (){
      $scope.$apply(function(){
        if (err) {
          ctrl.logoutText = "No one is logged in.";
        } else {
          ctrl.logoutText = "You are logged out";
        }
        // clear any lingering credentials.
        authService.clearAll();
      });
    });
  });
}

angular.
module('logoutModule',['awsAPIClients']).
component('logout',{
  templateUrl: 'components/logout/logout.html',
  controller: logout
});
