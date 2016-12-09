'use strict';

function frontpage() {
};

angular
.module('frontpageModule',['awsAPIClients', 'sharedInfo'])
.component('frontpage', {
  templateUrl: 'components/frontpage/frontpage.html',
  controller: frontpage
})
