var SPREADSHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE'; // dashboard.gs と同じスプレッドシートID
var ALLOWED_SITE_IDS = ['portfolio'];
var BOT_UA_PATTERN = /bot|crawler|spider/i;
var RAW_SHEET_NAME = 'raw';

function sanitizeForSheet_(value) {
  var str = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput('ok');
  }

  if (!body || ALLOWED_SITE_IDS.indexOf(body.siteId) === -1) {
    return ContentService.createTextOutput('ok');
  }

  if (BOT_UA_PATTERN.test(body.ua || '')) {
    return ContentService.createTextOutput('ok');
  }

  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    acquired = lock.tryLock(3000);
  } catch (err) {
    acquired = false;
  }

  if (!acquired) {
    return ContentService.createTextOutput('ok');
  }

  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RAW_SHEET_NAME);
    sheet.appendRow([
      sanitizeForSheet_(body.date || ''),
      sanitizeForSheet_(body.timestamp || ''),
      body.siteId || '',
      sanitizeForSheet_(body.path || ''),
      sanitizeForSheet_(body.referrer || ''),
      sanitizeForSheet_(body.ua || ''),
      Number(body.screenWidth) || 0,
      body.isUU ? 1 : 0
    ]);
  } catch (err) {
    Logger.log(err); // visible in GAS Executions log for debugging; never surfaces to the HTTP caller
  } finally {
    lock.releaseLock();
  }

  return ContentService.createTextOutput('ok');
}
