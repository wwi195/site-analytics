var SPREADSHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE'; // collector.gs と同じスプレッドシートID
var RAW_SHEET_NAME = 'raw';
var DAILY_SHEET_NAME = 'daily';
var RAW_RETENTION_DAYS = 90;

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('dashboard')
    .setTitle('Site Analytics')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function setup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var raw = ss.getSheetByName(RAW_SHEET_NAME) || ss.insertSheet(RAW_SHEET_NAME);
  if (raw.getLastRow() === 0) {
    raw.appendRow(['date', 'timestamp', 'siteId', 'path', 'referrer', 'ua', 'screenWidth', 'isUU']);
  }
  var daily = ss.getSheetByName(DAILY_SHEET_NAME) || ss.insertSheet(DAILY_SHEET_NAME);
  if (daily.getLastRow() === 0) {
    daily.appendRow(['date', 'siteId', 'pv', 'uu']);
  }
}

function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'aggregateDaily') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('aggregateDaily').timeBased().everyDays(1).atHour(2).create();
}

function formatDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function readSheetAsObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) {
      row[headers[c]] = values[i][c];
    }
    rows.push(row);
  }
  return rows;
}
