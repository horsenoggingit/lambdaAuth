'use strict';

function signup(apiUnauthedClientFactory, authService, lastLoginSignupInfo, $location, $scope) {
  this.email = lastLoginSignupInfo.email;
  var ctrl = this;
  ctrl.signupButtonDisable = false;
  console.log(this);
  ctrl.$onInit = function() {
    console.log("view init");
  };

  ctrl.signup = function() {
    console.log("signup button clicked");
    ctrl.signupButtonDisable = true;

    apiUnauthedClientFactory.signupPost({},{password: ctrl.password, email: ctrl.email})
    .then(function(result){
        //This is where you would put a success callback
        console.log("signup success");
        console.log(result);
        authService.setIdentityAndToken(result.data.IdentityId, result.data.Token, function (err) {
          $scope.$apply(function(){
            ctrl.signupButtonDisable = false;
            if (err) {
              console.log(err);
            } else {
              $location.path('frontpage').replace();
    /*          authService.authedClient().userMeGet().then(function(result){
                console.log("user me get success");
                console.log(result);
              }).catch(function(result) {
                console.log("user me get fail");
                console.log(result);
              });*/
            }
          });
        });

      }).catch( function(result){
        $scope.$apply(function(){
          ctrl.signupButtonDisable = false;
        });
        //This is where you would put an error callback
        console.log("signup fail");
        console.log(result)
    });

  };

  ctrl.$onDestroy = function () {
    lastLoginSignupInfo.email = ctrl.email;
  }

};

angular
.module('signupModule',['awsAPIClients','sharedInfo', 'ngRoute'])
.component('signup', {
  templateUrl: 'components/signup/signup.html',
  controller: signup
})
