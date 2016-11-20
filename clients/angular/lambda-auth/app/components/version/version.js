'use strict';

angular.module('version', [
  'version.interpolate-filter',
  'version.version-directive'
])

.value('version', '0.1');
