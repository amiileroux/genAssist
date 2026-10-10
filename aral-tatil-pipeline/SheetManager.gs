/**
 * Per-line tracker sheets: the single source of truth the Admin dashboard
 * and Agent portal both read/write through. Kept separate from the raw
 * Form-response sheets so the dashboard's shape never depends on how
 * either Form's questions are laid out.
 */

var MOTOR_TRACKER_HEADERS = [
  'Timestamp', 'ARAL Code', 'Client Name', 'Agent Name', 'Agent Email',
  'Coverage Type', 'Vehicle Specs', 'Score (%)', 'Status', 'Missing Items',
  'Drive Folder URL', 'Drive Folder ID', 'Newly Purchased', 'NCD Level',
  'Claim History', 'New Driver', 'TATIL Policy Number', 'Admin Notes', 'Last Updated'
];

var MOTOR_COL = {
  TIMESTAMP: 1, ARAL_CODE: 2, CLIENT_NAME: 3, AGENT_NAME: 4, AGENT_EMAIL: 5,
  COVERAGE_TYPE: 6, VEHICLE_SPECS: 7, SCORE: 8, STATUS: 9, MISSING_FIELDS: 10,
  FOLDER_URL: 11, FOLDER_ID: 12, NEWLY_PURCHASED: 13, NCD_LEVEL: 14,
  CLAIM_HISTORY: 15, NEW_DRIVER: 16, TATIL_POLICY_NUMBER: 17, ADMIN_NOTES: 18, LAST_UPDATED: 19
};

var PROPERTY_TRACKER_HEADERS = [
  'Timestamp', 'ARAL Code', 'Client Name', 'Agent Name', 'Agent Email',
  'Occupancy Type', 'Score (%)', 'Status', 'Missing Items',
  'Drive Folder URL', 'Drive Folder ID', 'Residential Contents',
  'TATIL Policy Number', 'Admin Notes', 'Last Updated'
];

var PROPERTY_COL = {
  TIMESTAMP: 1, ARAL_CODE: 2, CLIENT_NAME: 3, AGENT_NAME: 4, AGENT_EMAIL: 5,
  OCCUPANCY_TYPE: 6, SCORE: 7, STATUS: 8, MISSING_FIELDS: 9,
  FOLDER_URL: 10, FOLDER_ID: 11, RESIDENTIAL_CONTENTS: 12,
  TATIL_POLICY_NUMBER: 13, ADMIN_NOTES: 14, LAST_UPDATED: 15
};

function getTrackerMeta_(lineKey) {
  var line = getLineConfig_(lineKey);
  return lineKey === 'MOTOR'
    ? { sheetName: line.TRACKER_SHEET_NAME, headers: MOTOR_TRACKER_HEADERS, col: MOTOR_COL }
    : { sheetName: line.TRACKER_SHEET_NAME, headers: PROPERTY_TRACKER_HEADERS, col: PROPERTY_COL };
}

function getTrackerSheet_(lineKey) {
  var meta = getTrackerMeta_(lineKey);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(meta.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(meta.sheetName);
    sheet.appendRow(meta.headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Sequential ARAL-MOT-000123 / ARAL-PROP-000123 style code, race-safe across concurrent submissions, numbered independently per line. */
function nextAralCode_(lineKey) {
  var line = getLineConfig_(lineKey);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var current = parseInt(props.getProperty(line.SEQUENCE_PROPERTY_KEY) || '0', 10);
    var next = current + 1;
    props.setProperty(line.SEQUENCE_PROPERTY_KEY, String(next));
    return line.ARAL_PREFIX + '-' + ('000000' + next).slice(-6);
  } finally {
    lock.releaseLock();
  }
}

/** @return {number|null} the tracker row number for an ARAL code, or null if not found. */
function findRowByAralCode_(lineKey, aralCode) {
  var sheet = getTrackerSheet_(lineKey);
  var finder = sheet.createTextFinder(aralCode).matchEntireCell(true).findNext();
  return finder ? finder.getRow() : null;
}

function getAllRecords_(lineKey) {
  var sheet = getTrackerSheet_(lineKey);
  var lastRow = sheet.getLastRow();
  var readFn = lineKey === 'MOTOR' ? readMotorRowAsRecord_ : readPropertyRowAsRecord_;
  var records = [];
  for (var r = 2; r <= lastRow; r++) {
    records.push(readFn(r));
  }
  return records;
}

function updateRowFields_(lineKey, rowNum, fields) {
  var meta = getTrackerMeta_(lineKey);
  var sheet = getTrackerSheet_(lineKey);
  Object.keys(fields).forEach(function (colKey) {
    var col = meta.col[colKey];
    if (!col) throw new Error('Unknown ' + lineKey + ' tracker column: ' + colKey);
    sheet.getRange(rowNum, col).setValue(fields[colKey]);
  });
  sheet.getRange(rowNum, meta.col.LAST_UPDATED).setValue(new Date());
}

// ---- Motor ----

function appendMotorTrackerRow_(data) {
  var sheet = getTrackerSheet_('MOTOR');
  var col = MOTOR_COL;
  var row = new Array(MOTOR_TRACKER_HEADERS.length).fill('');
  row[col.TIMESTAMP - 1] = data.timestamp || new Date();
  row[col.ARAL_CODE - 1] = data.aralCode;
  row[col.CLIENT_NAME - 1] = data.clientName || '';
  row[col.AGENT_NAME - 1] = data.agentName || '';
  row[col.AGENT_EMAIL - 1] = data.agentEmail || '';
  row[col.COVERAGE_TYPE - 1] = data.coverageType || '';
  row[col.VEHICLE_SPECS - 1] = data.vehicleSpecs || '';
  row[col.SCORE - 1] = data.score;
  row[col.STATUS - 1] = data.status;
  row[col.MISSING_FIELDS - 1] = (data.missing || []).join('; ');
  row[col.FOLDER_URL - 1] = data.folderUrl || '';
  row[col.FOLDER_ID - 1] = data.folderId || '';
  row[col.NEWLY_PURCHASED - 1] = data.newlyPurchased || '';
  row[col.NCD_LEVEL - 1] = data.ncdLevel || '';
  row[col.CLAIM_HISTORY - 1] = data.claimHistoryAnswer || '';
  row[col.NEW_DRIVER - 1] = data.newDriver ? 'Yes' : '';
  row[col.TATIL_POLICY_NUMBER - 1] = '';
  row[col.ADMIN_NOTES - 1] = '';
  row[col.LAST_UPDATED - 1] = new Date();
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function readMotorRowAsRecord_(rowNum) {
  var sheet = getTrackerSheet_('MOTOR');
  var col = MOTOR_COL;
  var values = sheet.getRange(rowNum, 1, 1, MOTOR_TRACKER_HEADERS.length).getValues()[0];
  return {
    line: 'MOTOR',
    rowNum: rowNum,
    timestamp: values[col.TIMESTAMP - 1],
    aralCode: values[col.ARAL_CODE - 1],
    clientName: values[col.CLIENT_NAME - 1],
    agentName: values[col.AGENT_NAME - 1],
    agentEmail: values[col.AGENT_EMAIL - 1],
    coverageType: values[col.COVERAGE_TYPE - 1],
    vehicleSpecs: values[col.VEHICLE_SPECS - 1],
    score: values[col.SCORE - 1],
    status: values[col.STATUS - 1],
    missing: values[col.MISSING_FIELDS - 1],
    folderUrl: values[col.FOLDER_URL - 1],
    folderId: values[col.FOLDER_ID - 1],
    newlyPurchased: values[col.NEWLY_PURCHASED - 1],
    ncdLevel: values[col.NCD_LEVEL - 1],
    claimHistoryAnswer: values[col.CLAIM_HISTORY - 1],
    newDriver: values[col.NEW_DRIVER - 1] === 'Yes',
    tatilPolicyNumber: values[col.TATIL_POLICY_NUMBER - 1],
    adminNotes: values[col.ADMIN_NOTES - 1],
    lastUpdated: values[col.LAST_UPDATED - 1]
  };
}

// ---- Property ----

function appendPropertyTrackerRow_(data) {
  var sheet = getTrackerSheet_('PROPERTY');
  var col = PROPERTY_COL;
  var row = new Array(PROPERTY_TRACKER_HEADERS.length).fill('');
  row[col.TIMESTAMP - 1] = data.timestamp || new Date();
  row[col.ARAL_CODE - 1] = data.aralCode;
  row[col.CLIENT_NAME - 1] = data.clientName || '';
  row[col.AGENT_NAME - 1] = data.agentName || '';
  row[col.AGENT_EMAIL - 1] = data.agentEmail || '';
  row[col.OCCUPANCY_TYPE - 1] = data.occupancyType || '';
  row[col.SCORE - 1] = data.score;
  row[col.STATUS - 1] = data.status;
  row[col.MISSING_FIELDS - 1] = (data.missing || []).join('; ');
  row[col.FOLDER_URL - 1] = data.folderUrl || '';
  row[col.FOLDER_ID - 1] = data.folderId || '';
  row[col.RESIDENTIAL_CONTENTS - 1] = data.residentialContents || '';
  row[col.TATIL_POLICY_NUMBER - 1] = '';
  row[col.ADMIN_NOTES - 1] = '';
  row[col.LAST_UPDATED - 1] = new Date();
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function readPropertyRowAsRecord_(rowNum) {
  var sheet = getTrackerSheet_('PROPERTY');
  var col = PROPERTY_COL;
  var values = sheet.getRange(rowNum, 1, 1, PROPERTY_TRACKER_HEADERS.length).getValues()[0];
  return {
    line: 'PROPERTY',
    rowNum: rowNum,
    timestamp: values[col.TIMESTAMP - 1],
    aralCode: values[col.ARAL_CODE - 1],
    clientName: values[col.CLIENT_NAME - 1],
    agentName: values[col.AGENT_NAME - 1],
    agentEmail: values[col.AGENT_EMAIL - 1],
    occupancyType: values[col.OCCUPANCY_TYPE - 1],
    score: values[col.SCORE - 1],
    status: values[col.STATUS - 1],
    missing: values[col.MISSING_FIELDS - 1],
    folderUrl: values[col.FOLDER_URL - 1],
    folderId: values[col.FOLDER_ID - 1],
    residentialContents: values[col.RESIDENTIAL_CONTENTS - 1],
    tatilPolicyNumber: values[col.TATIL_POLICY_NUMBER - 1],
    adminNotes: values[col.ADMIN_NOTES - 1],
    lastUpdated: values[col.LAST_UPDATED - 1]
  };
}

function readRowAsRecord_(lineKey, rowNum) {
  return lineKey === 'MOTOR' ? readMotorRowAsRecord_(rowNum) : readPropertyRowAsRecord_(rowNum);
}
