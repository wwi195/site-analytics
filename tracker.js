(function () {
  'use strict';

  var ENDPOINT = 'https://script.google.com/macros/s/PUT_COLLECTOR_DEPLOYMENT_ID_HERE/exec';
  var BOT_UA_PATTERN = /bot|crawler|spider/i;

  function isLocalHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }

  function isBotUA(ua) {
    return BOT_UA_PATTERN.test(ua || '');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      isLocalHost: isLocalHost,
      isBotUA: isBotUA
    };
  }
})();
