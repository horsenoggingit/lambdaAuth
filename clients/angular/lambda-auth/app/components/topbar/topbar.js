'use strict';

var menus = {signupLoginList: [{item: 'signupItem', name:'Signup', href:'#!/signup'},
              {item:'loginItem', name:'Login', href:'#!/login'}],
            authedList : [{item: 'logoutItem', name:'Logout', href:'#!/signup'}]};

function topbar() {
  var ctrl = this;

  ctrl.createItemList = function() {
    var items =[];
    var selectedMenu = menus[ctrl.menuName];
    for (var index = 0; index<selectedMenu.length; index ++) {
      var menuItem = selectedMenu[index];
      var listItem = {};
      if (ctrl.selectedItem === menuItem.item) {
        listItem['selected'] = true;
      } else {
        listItem['selected'] = false;
      }
      listItem['name'] = menuItem.name;
      listItem['href'] = menuItem.href;

      items.push(listItem)
    }
    return items;
  };

  ctrl.items = this.createItemList();
};

angular
.module('topbarModule',['awsAPIClients', 'sharedInfo'])
.component('topbar', {
  bindings: {
    selectedItem: '@',
    menuName: '@'
  },
  templateUrl: 'components/topbar/topbar.html',
  controller: topbar
})
