'use strict';

function login(apiUnauthedClientFactory, authService, lastLoginSignupInfo, $scope, $location) {
  this.email = lastLoginSignupInfo.email;
  var ctrl = this;
  console.log(this);
  ctrl.$onInit = function() {
    console.log("view init");
  };

  ctrl.login = function() {
    console.log("button clicked ");
    console.log("email: " + ctrl.email);
    console.log("password: " + ctrl.password);

    apiUnauthedClientFactory.loginPost({},{password: ctrl.password, email: ctrl.email})
    .then(function(result){
      console.log("login success");
      authService.setIdentityAndToken(result.data.IdentityId, result.data.Token, function (client, err) {
        $scope.$apply(function(){
//          ctrl.signupButtonDisable = false;
          if (err) {
            console.log(err);
          } else {
            $location.path('frontpage').replace();
          }
        });
      });

    }).catch(function(result){
        //This is where you would put an error callback
        console.log("fail");
    });

  };

  ctrl.$onDestroy = function () {
    lastLoginSignupInfo['email'] = ctrl.email;
  }

};

angular
.module('loginModule',['awsAPIClients', 'sharedInfo', 'ngRoute', 'ngAnimate'])
.component('login', {
  templateUrl: 'components/login/login.html',
  controller: login
})
