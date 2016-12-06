'use strict';

function login(apiUnauthedClientFactory, lastLoginSignupInfo) {
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
        //This is where you would put a success callback
        console.log("success");
    }).catch(function(result){
        //This is where you would put an error callback
        console.log("fail");
    });

  };

  ctrl.$onChanges = function (changes) {
    console.log("change" + changes.toString());
  };

  ctrl.$onDestroy = function () {
    lastLoginSignupInfo['email'] = ctrl.email;
  }

};

angular
.module('login',['awsAPIClients', 'credentialModule'])
.component('login', {
  templateUrl: 'components/login/login.html',
  controller: login
})
