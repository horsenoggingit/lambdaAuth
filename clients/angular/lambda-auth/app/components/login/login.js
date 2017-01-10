/* jshint undef: true, unused: true, esversion: 6, devel: true, node: false, browser: true, module: true */
'use strict';

function login(apiUnauthedClientFactory, authService, lastLoginSignupInfo, $scope, $location) {
    this.email = lastLoginSignupInfo.email;
    var ctrl = this;
    ctrl.flashEmail = false;
    ctrl.flashPassword = false;
    ctrl.signupButtonDisable = false;

    ctrl.$onInit = function() {

    };

    ctrl.flash = function(name) {
        if (ctrl[name]) {
            return;
        }
        ctrl[name] = true;
        setTimeout(function() {
            $scope.$apply(function(){
                ctrl[name] = false;
            });
        }, 500);
    };

    ctrl.login = function() {
        console.log("login button clicked ");

        if (!ctrl.email || (ctrl.email === "")) {
            ctrl.flash('flashEmail');
            return;
        }

        if (!ctrl.password || (ctrl.password === "")) {
            ctrl.flash('flashPassword');
            return;
        }

        ctrl.loginButtonDisable = true;

        apiUnauthedClientFactory.loginPost({},{password: ctrl.password, email: ctrl.email, device_id: authService.deviceId()})
        .then(function(result){
            console.log("login success");
            authService.setIdentityAndToken(result.data.IdentityId, result.data.Token, function (client, err) {
                $scope.$apply(function(){
                    ctrl.loginButtonDisable = false;
                    if (err) {
                        console.log(err);
                    } else {
                        $location.path('frontpage').replace();
                    }
                });
            });

        }).catch(function(){
            $scope.$apply(function(){
                ctrl.loginButtonDisable = false;
                ctrl.shakeLoginButton = true;
                setTimeout(function() {
                    $scope.$apply(function(){
                        ctrl.shakeLoginButton = false;
                    });
                }, 500);

            });
            console.log("fail");
        });

    };

    ctrl.$onDestroy = function () {
        lastLoginSignupInfo.email = ctrl.email;
    };

}

angular
.module('loginModule',['awsAPIClients', 'sharedInfo', 'ngRoute', 'ngAnimate'])
.component('login', {
    templateUrl: 'components/login/login.html',
    controller: login
});
