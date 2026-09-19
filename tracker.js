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

  function buildPayload(opts) {
    var dateStr = formatLocalDate(opts.now);
    var isUU = checkAndMarkUU(opts.siteId, dateStr, opts.storage);
    return {
      siteId: opts.siteId,
      path: opts.path,
      referrer: opts.referrer,
      ua: opts.ua,
      screenWidth: opts.screenWidth,
      timestamp: opts.now.toISOString(),
      date: dateStr,
      isUU: isUU
    };
  }

  function send(payload, endpoint) {
    try {
      fetch(endpoint, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {
      // no-op: tracker must never throw into the host page
    }
  }

  function main() {
    try {
      if (isLocalHost(location.hostname)) return;
      if (isBotUA(navigator.userAgent)) return;
      var scriptEl = document.currentScript;
      var siteId = scriptEl && scriptEl.getAttribute('data-site-id');
      if (!siteId) return;
      var payload = buildPayload({
        siteId: siteId,
        path: location.pathname,
        referrer: document.referrer,
        ua: navigator.userAgent,
        screenWidth: window.innerWidth,
        now: new Date(),
        storage: window.localStorage
      });
      send(payload, ENDPOINT);
    } catch (e) {
      // no-op: tracker must never throw into the host page
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      isLocalHost: isLocalHost,
      isBotUA: isBotUA,
      formatLocalDate: formatLocalDate,
      buildUUKey: buildUUKey,
      checkAndMarkUU: checkAndMarkUU,
      buildPayload: buildPayload
    };
  } else {
    main();
  }
})();
