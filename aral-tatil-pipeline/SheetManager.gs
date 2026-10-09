/**
 * Pipeline_Tracker sheet: the single source of truth the Admin dashboard
 * and Agent portal both read/write through. Kept separate from the raw
 * Form-response sheet so the dashboard's shape never depends on how the
 * Form questions are laid out.
 */

var TRACKER_HEADERS = [
  'Timestamp', 'ARAL Code', 'Client Name', 'Agent Name', 'Agent Email',
  'Policy Type', 'Vehicle Registration', 'Score (%)', 'Status', 'Missing Fields',
  'Drive Folder URL', 'Drive Folder ID', "Driver's Permit Expiry", 'Utility Bill Date',
  'TATIL Policy Number', 'Admin Notes', 'Last Updated'
];

var COL = {
  TIMESTAMP: 1, ARAL_CODE: 2, CLIENT_NAME: 3, AGENT_NAME: 4, AGENT_EMAIL: 5,
  POLICY_TYPE: 6, VEHICLE_REG: 7, SCORE: 8, STATUS: 9, MISSING_FIELDS: 10,
  FOLDER_URL: 11, FOLDER_ID: 12, PERMIT_EXPIRY: 13, UTILITY_BILL_DATE: 14,
  TATIL_POLICY_NUMBER: 15, ADMIN_NOTES: 16, LAST_UPDATED: 17
};

function getTrackerSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET.TRACKER_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET.TRACKER_NAME);
    sheet.appendRow(TRACKER_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Sequential ARAL-000123 style code, race-safe across concurrent submissions. */
function nextAralCode_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var current = parseInt(props.getProperty(CONFIG.PROPERTY_KEYS.ARAL_SEQUENCE) || '0', 10);
    var next = current + 1;
    props.setProperty(CONFIG.PROPERTY_KEYS.ARAL_SEQUENCE, String(next));
    return 'ARAL-' + ('000000' + next).slice(-6);
  } finally {
    lock.releaseLock();
  }
}

function appendTrackerRow_(data) {
  var sheet = getTrackerSheet_();
  var row = new Array(TRACKER_HEADERS.length).fill('');
  row[COL.TIMESTAMP - 1] = data.timestamp || new Date();
  row[COL.ARAL_CODE - 1] = data.aralCode;
  row[COL.CLIENT_NAME - 1] = data.clientName || '';
  row[COL.AGENT_NAME - 1] = data.agentName || '';
  row[COL.AGENT_EMAIL - 1] = data.agentEmail || '';
  row[COL.POLICY_TYPE - 1] = data.policyType || '';
  row[COL.VEHICLE_REG - 1] = data.vehicleReg || '';
  row[COL.SCORE - 1] = data.score;
  row[COL.STATUS - 1] = data.status;
  row[COL.MISSING_FIELDS - 1] = (data.missing || []).join('; ');
  row[COL.FOLDER_URL - 1] = data.folderUrl || '';
  row[COL.FOLDER_ID - 1] = data.folderId || '';
  row[COL.PERMIT_EXPIRY - 1] = data.permitExpiry || '';
  row[COL.UTILITY_BILL_DATE - 1] = data.utilityBillDate || '';
  row[COL.TATIL_POLICY_NUMBER - 1] = '';
  row[COL.ADMIN_NOTES - 1] = '';
  row[COL.LAST_UPDATED - 1] = new Date();
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/** @return {number|null} the tracker row number for an ARAL code, or null if not found. */
function findRowByAralCode_(aralCode) {
  var sheet = getTrackerSheet_();
  var finder = sheet.createTextFinder(aralCode).matchEntireCell(true).findNext();
  return finder ? finder.getRow() : null;
}

function readRowAsRecord_(rowNum) {
  var sheet = getTrackerSheet_();
  var values = sheet.getRange(rowNum, 1, 1, TRACKER_HEADERS.length).getValues()[0];
  return {
    rowNum: rowNum,
    timestamp: values[COL.TIMESTAMP - 1],
    aralCode: values[COL.ARAL_CODE - 1],
    clientName: values[COL.CLIENT_NAME - 1],
    agentName: values[COL.AGENT_NAME - 1],
    agentEmail: values[COL.AGENT_EMAIL - 1],
    policyType: values[COL.POLICY_TYPE - 1],
    vehicleReg: values[COL.VEHICLE_REG - 1],
    score: values[COL.SCORE - 1],
    status: values[COL.STATUS - 1],
    missing: values[COL.MISSING_FIELDS - 1],
    folderUrl: values[COL.FOLDER_URL - 1],
    folderId: values[COL.FOLDER_ID - 1],
    permitExpiry: values[COL.PERMIT_EXPIRY - 1],
    utilityBillDate: values[COL.UTILITY_BILL_DATE - 1],
    tatilPolicyNumber: values[COL.TATIL_POLICY_NUMBER - 1],
    adminNotes: values[COL.ADMIN_NOTES - 1],
    lastUpdated: values[COL.LAST_UPDATED - 1]
  };
}

function getAllRecords_() {
  var sheet = getTrackerSheet_();
  var lastRow = sheet.getLastRow();
  var records = [];
  for (var r = 2; r <= lastRow; r++) {
    records.push(readRowAsRecord_(r));
  }
  return records;
}

function updateRowFields_(rowNum, fields) {
  var sheet = getTrackerSheet_();
  Object.keys(fields).forEach(function (colKey) {
    var col = COL[colKey];
    if (!col) throw new Error('Unknown tracker column: ' + colKey);
    sheet.getRange(rowNum, col).setValue(fields[colKey]);
  });
  sheet.getRange(rowNum, COL.LAST_UPDATED).setValue(new Date());
}
