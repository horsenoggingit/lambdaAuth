'use strict';

function signup() {

  var ctrl = this;
  this.$onInit = function() {
    console.log("view init");
    ctrl.email = 'hello';
    ctrl.password = 'password';
    console.log("email: " + ctrl.email);
  }
  this.signup = function() {
    console.log("button clicked ");
    this.password = 'bye';
  };
  ctrl.email = 'ddd';
  ctrl.password = 'mmm';
  this.$onChanges = function (changes) {
    console.log("change" + changes.toString());
  };

  console.log("view start");
  console.log("email: " + ctrl.email);


};

angular
.module('signup', ['ngRoute'])
.component('signup', {
  templateUrl: 'signup/signup.html',
  controller: signup
})
