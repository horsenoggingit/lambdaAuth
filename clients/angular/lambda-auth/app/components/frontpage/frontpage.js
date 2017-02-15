/* jshint undef: true, unused: true, esversion: 6, devel: true, node: false, browser: true, module: true */
'use strict';

function frontpage(authService, $location, $scope, $http) {
  var ctrl = this;

  ctrl.updateUser = function (callback) {
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
                      if (callback) {
                          callback(result.data);
                      }
                   });
              }).catch(function(result) {
                  console.log("user me get fail");
                  console.log(result);
                  $scope.$apply(function(){
                      ctrl.user = "cannot be found.";
                  });
              });
          }
      });
    };

  ctrl.updateUser(function (user) {
      if (user.photo_id) {
          var imgurl = user.photo_path_url + '/' + user.photo_base_id + '/' + user.photo_id;
          ctrl.imageurl = imgurl;
      }
  });

  ctrl.upload = function(file) {
       ctrl.uploadButtonDisable = true;

      authService.authedClient(function(client, err) {
          if (err) {
              console.log(err);
              $location.path('login').replace();
          } else {
              client.userPhotoUploadurlGet().then(function(result) {
                  console.log("userPhotoUploadurlGet success");
                  console.log(file);
                  $http.put(result.data.upload_url, file, {headers: {'Content-Type': file.type}})
                    .success(function() {
                      //Finally, We're done
                      setTimeout(function () {
                          $scope.$apply(function(){
                              ctrl.updateUser(function (user) {
                                  if (user.photo_id) {
                                      var imgurl = user.photo_path_url + '/' + user.photo_base_id + '/' + user.photo_id;
                                      ctrl.imageurl = imgurl;
                                  }
                              });
                          });
                      }, 3); // wait for new photo to be registered... we should pole the user object for changes
                      ctrl.uploadButtonDisable = false;
                   })
                   .error(function() {
                       ctrl.uploadButtonDisable = false;
                       alert("An Error Occurred Attaching Your File");
                   });
               }, function (reason) {
                   console.log("userPhotoUploadurlGet failed");
                   console.log(reason);
                   ctrl.uploadButtonDisable = false;
               });
           }
      });
  };

  $scope.$watch('file',function(newVal){
      if (newVal) {
          ctrl.upload(newVal);
      }
  });

}

angular
.module('frontpageModule',['awsAPIClients', 'sharedInfo', 'ngRoute'])
.component('frontpage', {
  templateUrl: 'components/frontpage/frontpage.html',
  controller: frontpage
})
.directive('file', function() {
  return {
    restrict: 'AE',
    scope: {
      file: '@'
    },
    link: function(scope, el){
      el.bind('change', function(event){
        var files = event.target.files;
        var file = files[0];
        scope.file = file;
        scope.$parent.file = file;
        scope.$apply();
      });
    }
  };
});
