'use strict';

function login(apigClient) {
  this.apigClient = apigClient;
  var ctrl = this;
  console.log(this);
  ctrl.$onInit = function() {
    console.log("view init");
  };

  ctrl.login = function() {
    console.log("button clicked ");
    console.log("email: " + ctrl.email);
    console.log("password: " + ctrl.password);

    ctrl.apigClient.loginPost({},{password: ctrl.password, email: ctrl.email})
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

};

angular
.module('login',['awsAPIClientModule'])
.component('login', {
  templateUrl: 'components/login/login.html',
  controller: login
})
