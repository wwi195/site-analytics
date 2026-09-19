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

  function formatLocalDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function buildUUKey(siteId, dateStr) {
    return 'sa_uu_' + siteId + '_' + dateStr;
  }

  function checkAndMarkUU(siteId, dateStr, storage) {
    var key = buildUUKey(siteId, dateStr);
    try {
      if (storage.getItem(key)) {
        return false;
      }
      storage.setItem(key, '1');
      return true;
    } catch (e) {
      return true;
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      isLocalHost: isLocalHost,
      isBotUA: isBotUA,
      formatLocalDate: formatLocalDate,
      buildUUKey: buildUUKey,
      checkAndMarkUU: checkAndMarkUU
    };
  }
})();
