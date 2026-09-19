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
  raw.getRange('A:A').setNumberFormat('@');
  var daily = ss.getSheetByName(DAILY_SHEET_NAME) || ss.insertSheet(DAILY_SHEET_NAME);
  if (daily.getLastRow() === 0) {
    daily.appendRow(['date', 'siteId', 'pv', 'uu']);
  }
  daily.getRange('A:A').setNumberFormat('@');
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

function aggregateDaily() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var rawSheet = ss.getSheetByName(RAW_SHEET_NAME);
  var dailySheet = ss.getSheetByName(DAILY_SHEET_NAME);

  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var targetDate = formatDate_(yesterday);

  var rawRows = readSheetAsObjects_(rawSheet);
  var stats = {};
  rawRows.forEach(function (row) {
    if (String(row.date) !== targetDate) return;
    var siteId = row.siteId;
    if (!stats[siteId]) stats[siteId] = { pv: 0, uu: 0 };
    stats[siteId].pv += 1;
    if (Number(row.isUU) === 1) stats[siteId].uu += 1;
  });

  var dailyValues = dailySheet.getDataRange().getValues();
  var dailyHeaders = dailyValues[0];
  var dateCol = dailyHeaders.indexOf('date');
  var siteCol = dailyHeaders.indexOf('siteId');
  var pvCol = dailyHeaders.indexOf('pv');
  var uuCol = dailyHeaders.indexOf('uu');

  Object.keys(stats).forEach(function (siteId) {
    var existingRowIndex = -1;
    for (var i = 1; i < dailyValues.length; i++) {
      if (String(dailyValues[i][dateCol]) === targetDate && dailyValues[i][siteCol] === siteId) {
        existingRowIndex = i;
        break;
      }
    }
    var pv = stats[siteId].pv;
    var uu = stats[siteId].uu;
    if (existingRowIndex === -1) {
      dailySheet.appendRow([targetDate, siteId, pv, uu]);
    } else {
      dailySheet.getRange(existingRowIndex + 1, pvCol + 1).setValue(pv);
      dailySheet.getRange(existingRowIndex + 1, uuCol + 1).setValue(uu);
    }
  });

  deleteOldRawRows_(rawSheet);
}

function deleteOldRawRows_(rawSheet) {
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RAW_RETENTION_DAYS);
  var cutoffStr = formatDate_(cutoff);

  var values = rawSheet.getDataRange().getValues();
  var rowsToDelete = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) < cutoffStr) {
      rowsToDelete.push(i + 1);
    }
  }
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    rawSheet.deleteRow(rowsToDelete[j]);
  }
}

function getSiteList() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var daily = readSheetAsObjects_(ss.getSheetByName(DAILY_SHEET_NAME));
  var seen = {};
  daily.forEach(function (row) {
    if (row.siteId) seen[row.siteId] = true;
  });
  return Object.keys(seen).sort();
}

function getDashboardData(siteId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var daily = readSheetAsObjects_(ss.getSheetByName(DAILY_SHEET_NAME));
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  var cutoffStr = formatDate_(cutoff);

  return daily
    .filter(function (row) {
      return row.siteId === siteId && String(row.date) >= cutoffStr;
    })
    .map(function (row) {
      return { date: String(row.date), pv: Number(row.pv), uu: Number(row.uu) };
    })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}

function getTodayStats(siteId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var raw = readSheetAsObjects_(ss.getSheetByName(RAW_SHEET_NAME));
  var today = formatDate_(new Date());

  var pv = 0;
  var uu = 0;
  raw.forEach(function (row) {
    if (row.siteId === siteId && String(row.date) === today) {
      pv += 1;
      if (Number(row.isUU) === 1) uu += 1;
    }
  });

  return { date: today, pv: pv, uu: uu };
}
