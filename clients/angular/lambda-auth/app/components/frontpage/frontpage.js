'use strict';

function frontpage(authService, $location, $scope) {
  var ctrl = this;
  ctrl.user = "wait for it...";

  authService.authedClient(function(client,err) {
    if (err) {
      console.log(err);
      $location.path('login').replace();
    } else {
      client.userMeGet().then(function(result){
        console.log("user me get success");
        $scope.$apply(function(){
          ctrl.user = JSON.stringify(result.data, null, '\t');
        });
      }).catch(function(result) {
        console.log("user me get fail");
        console.log(result);
        $scope.$apply(function(){
          ctrl.user = "cannot be found.";
        });
      });
    }
  })

};

angular
.module('frontpageModule',['awsAPIClients', 'sharedInfo', 'ngRoute'])
.component('frontpage', {
  templateUrl: 'components/frontpage/frontpage.html',
  controller: frontpage
})
