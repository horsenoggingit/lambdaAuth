/* jshint undef: true, unused: true, esversion: 6, devel: true, node: false, browser: true, module: true */
'use strict';

function signup(apiUnauthedClientFactory, authService, lastLoginSignupInfo, $location, $scope) {
    this.email = lastLoginSignupInfo.email;
    var ctrl = this;
    ctrl.flashEmail = false;
    ctrl.flashPassword = false;
    ctrl.flashName = false;
    ctrl.flashDOB = false;

    ctrl.signupButtonDisable = false;

    ctrl.$onInit = function() {
        if (authService.isLoggedIn()) {
            $location.path('frontpage').replace();
        }
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

    ctrl.signup = function() {
        console.log("signup button clicked");
        if (!ctrl.email || (ctrl.email === "")) {
            ctrl.flash('flashEmail');
            return;
        }
        if (!ctrl.name || (ctrl.name === "")) {
            ctrl.flash('flashName');
            return;
        }
        console.log(ctrl.DOB);
        if (!ctrl.DOB || (ctrl.DOB === "")) {
            ctrl.flash('flashDOB');
            return;
        }
        if (!ctrl.password || (ctrl.password === "")) {
            ctrl.flash('flashPassword');
            return;
        }

        ctrl.signupButtonDisable = true;

        var signupParam =  {
            password: ctrl.password,
            email: ctrl.email,
            dob: (new Date(ctrl.DOB.year, ctrl.DOB.month, ctrl.DOB.day)).getTime(),
            name: ctrl.name,
            device_id: authService.deviceId()
        };
        apiUnauthedClientFactory.signupPost({},signupParam)
        .then(function(result){
            // we get back an identityID and token.
            // now exchange these for a session token wth cognito.
            console.log("signup success");
            authService.setIdentityAndToken(result.data.IdentityId, result.data.Token, function (client, err) {
                $scope.$apply(function(){
                    ctrl.signupButtonDisable = false;
                    if (err) {
                        console.log(err);
                    } else {
                        $location.path('frontpage').replace();
                    }
                });
            });

        }).catch( function(result){
            $scope.$apply(function(){
                ctrl.signupButtonDisable = false;
                ctrl.shakeSignupButton = true;
                setTimeout(function() {
                    $scope.$apply(function(){
                        ctrl.shakeSignupButton = false;
                    });
                }, 500);

            });

            //This is where you would put an error callback
            console.log("signup fail");
            console.log(result);
        });

    };

    ctrl.$onDestroy = function () {
        lastLoginSignupInfo.email = ctrl.email;
    };

}

angular
.module('signupModule',['awsAPIClients','sharedInfo', 'ngRoute', 'angularDob', 'ngAnimate'])
.component('signup', {
    templateUrl: 'components/signup/signup.html',
    controller: signup
});
