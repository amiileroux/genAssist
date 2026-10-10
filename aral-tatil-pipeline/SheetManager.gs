/**
 * Per-line tracker sheets: the single source of truth the Admin dashboard
 * and Agent portal both read/write through. Kept separate from the raw
 * Form-response sheets so the dashboard's shape never depends on how
 * either Form's questions are laid out.
 */

var MOTOR_TRACKER_HEADERS = [
  'Timestamp', 'ARAL Code', 'Client Name', 'Client Email', 'Client Phone',
  'Agent Name', 'Agent Email', 'Coverage Type', 'Vehicle Specs', 'Score (%)',
  'Status', 'Missing Items', 'Drive Folder URL', 'Drive Folder ID',
  'Newly Purchased', 'NCD Level', 'Claim History', 'New Driver',
  'Policy Stage', 'Signed Doc URL', 'Payment Proof URL',
  'TATIL Policy Number', 'Admin Notes', 'Last Updated'
];

var MOTOR_COL = {
  TIMESTAMP: 1, ARAL_CODE: 2, CLIENT_NAME: 3, CLIENT_EMAIL: 4, CLIENT_PHONE: 5,
  AGENT_NAME: 6, AGENT_EMAIL: 7, COVERAGE_TYPE: 8, VEHICLE_SPECS: 9, SCORE: 10,
  STATUS: 11, MISSING_FIELDS: 12, FOLDER_URL: 13, FOLDER_ID: 14,
  NEWLY_PURCHASED: 15, NCD_LEVEL: 16, CLAIM_HISTORY: 17, NEW_DRIVER: 18,
  POLICY_STAGE: 19, SIGNED_DOC_URL: 20, PAYMENT_PROOF_URL: 21,
  TATIL_POLICY_NUMBER: 22, ADMIN_NOTES: 23, LAST_UPDATED: 24
};

var PROPERTY_TRACKER_HEADERS = [
  'Timestamp', 'ARAL Code', 'Client Name', 'Client Email', 'Client Phone',
  'Agent Name', 'Agent Email', 'Occupancy Type', 'Score (%)', 'Status',
  'Missing Items', 'Drive Folder URL', 'Drive Folder ID', 'Residential Contents',
  'Policy Stage', 'Signed Doc URL', 'Payment Proof URL',
  'TATIL Policy Number', 'Admin Notes', 'Last Updated'
];

var PROPERTY_COL = {
  TIMESTAMP: 1, ARAL_CODE: 2, CLIENT_NAME: 3, CLIENT_EMAIL: 4, CLIENT_PHONE: 5,
  AGENT_NAME: 6, AGENT_EMAIL: 7, OCCUPANCY_TYPE: 8, SCORE: 9, STATUS: 10,
  MISSING_FIELDS: 11, FOLDER_URL: 12, FOLDER_ID: 13, RESIDENTIAL_CONTENTS: 14,
  POLICY_STAGE: 15, SIGNED_DOC_URL: 16, PAYMENT_PROOF_URL: 17,
  TATIL_POLICY_NUMBER: 18, ADMIN_NOTES: 19, LAST_UPDATED: 20
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
  row[col.CLIENT_EMAIL - 1] = data.clientEmail || '';
  row[col.CLIENT_PHONE - 1] = data.clientPhone || '';
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
  row[col.POLICY_STAGE - 1] = CONFIG.POLICY_STAGE.NONE;
  row[col.SIGNED_DOC_URL - 1] = '';
  row[col.PAYMENT_PROOF_URL - 1] = '';
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
    clientEmail: values[col.CLIENT_EMAIL - 1],
    clientPhone: values[col.CLIENT_PHONE - 1],
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
    policyStage: values[col.POLICY_STAGE - 1],
    signedDocUrl: values[col.SIGNED_DOC_URL - 1],
    paymentProofUrl: values[col.PAYMENT_PROOF_URL - 1],
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
  row[col.CLIENT_EMAIL - 1] = data.clientEmail || '';
  row[col.CLIENT_PHONE - 1] = data.clientPhone || '';
  row[col.AGENT_NAME - 1] = data.agentName || '';
  row[col.AGENT_EMAIL - 1] = data.agentEmail || '';
  row[col.OCCUPANCY_TYPE - 1] = data.occupancyType || '';
  row[col.SCORE - 1] = data.score;
  row[col.STATUS - 1] = data.status;
  row[col.MISSING_FIELDS - 1] = (data.missing || []).join('; ');
  row[col.FOLDER_URL - 1] = data.folderUrl || '';
  row[col.FOLDER_ID - 1] = data.folderId || '';
  row[col.RESIDENTIAL_CONTENTS - 1] = data.residentialContents || '';
  row[col.POLICY_STAGE - 1] = CONFIG.POLICY_STAGE.NONE;
  row[col.SIGNED_DOC_URL - 1] = '';
  row[col.PAYMENT_PROOF_URL - 1] = '';
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
    clientEmail: values[col.CLIENT_EMAIL - 1],
    clientPhone: values[col.CLIENT_PHONE - 1],
    agentName: values[col.AGENT_NAME - 1],
    agentEmail: values[col.AGENT_EMAIL - 1],
    occupancyType: values[col.OCCUPANCY_TYPE - 1],
    score: values[col.SCORE - 1],
    status: values[col.STATUS - 1],
    missing: values[col.MISSING_FIELDS - 1],
    folderUrl: values[col.FOLDER_URL - 1],
    folderId: values[col.FOLDER_ID - 1],
    residentialContents: values[col.RESIDENTIAL_CONTENTS - 1],
    policyStage: values[col.POLICY_STAGE - 1],
    signedDocUrl: values[col.SIGNED_DOC_URL - 1],
    paymentProofUrl: values[col.PAYMENT_PROOF_URL - 1],
    tatilPolicyNumber: values[col.TATIL_POLICY_NUMBER - 1],
    adminNotes: values[col.ADMIN_NOTES - 1],
    lastUpdated: values[col.LAST_UPDATED - 1]
  };
}

function readRowAsRecord_(lineKey, rowNum) {
  return lineKey === 'MOTOR' ? readMotorRowAsRecord_(rowNum) : readPropertyRowAsRecord_(rowNum);
}
