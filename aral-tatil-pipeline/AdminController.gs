/** Server functions called from the Admin Dashboard (AdminScript.html) via google.script.run. */

function assertIsAdmin_() {
  var viewer = (Session.getActiveUser().getEmail() || '').toLowerCase();
  var admins = getAdminEmails_();
  if (admins.length > 0 && admins.indexOf(viewer) === -1) {
    throw new Error('You do not have admin access to this pipeline.');
  }
}

function toRowView_(r) {
  return {
    rowNum: r.rowNum,
    aralCode: r.aralCode,
    clientName: r.clientName,
    agentName: r.agentName,
    agentEmail: r.agentEmail,
    coverageType: r.coverageType,
    vehicleSpecs: r.vehicleSpecs,
    score: r.score,
    status: r.status,
    missing: r.missing ? String(r.missing).split('; ').filter(Boolean) : [],
    folderUrl: r.folderUrl,
    tatilPolicyNumber: r.tatilPolicyNumber,
    // Not auto-scored - shown so an admin can judge whether Certificate of
    // Registration is needed (see VettingEngine.gs for why).
    newlyPurchased: r.newlyPurchased,
    ncdLevel: r.ncdLevel,
    claimHistoryAnswer: r.claimHistoryAnswer,
    newDriver: r.newDriver,
    submittedAt: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp || ''),
    lastUpdated: r.lastUpdated instanceof Date ? r.lastUpdated.toISOString() : String(r.lastUpdated || '')
  };
}

function admin_getDashboardData() {
  assertIsAdmin_();
  return getAllRecords_()
    .map(toRowView_)
    .sort(function (a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); });
}

function admin_flagIncomplete(aralCode, note) {
  assertIsAdmin_();
  var rowNum = findRowByAralCode_(aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(rowNum);
  var folder = DriveApp.getFolderById(record.folderId);
  moveFolderToStatus_(folder, 'INCOMPLETE');

  var missingList = note ? [note] : (record.missing ? String(record.missing).split('; ') : []);
  updateRowFields_(rowNum, {
    STATUS: CONFIG.STATUS.INCOMPLETE,
    MISSING_FIELDS: missingList.join('; '),
    ADMIN_NOTES: note || record.adminNotes
  });

  var updated = readRowAsRecord_(rowNum);
  updated.missing = missingList;
  notifyAgentCustomFlag_(updated, note || 'Please review and correct the flagged items.');
  return admin_getDashboardData();
}

/**
 * Sets (or corrects) the client's name - read off the uploaded DP Licence,
 * since the form itself doesn't collect a name. Also renames the Drive
 * folder so it stays searchable by client name.
 */
function admin_setClientName(aralCode, clientName) {
  assertIsAdmin_();
  if (!clientName) throw new Error('Client name cannot be empty.');
  var rowNum = findRowByAralCode_(aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(rowNum);

  var folder = safeGetFolder_(record.folderId);
  if (folder) renameClientFolder_(folder, aralCode, clientName, record.coverageType);

  updateRowFields_(rowNum, { CLIENT_NAME: clientName });
  return admin_getDashboardData();
}

function admin_requestSupplementalInfo(aralCode, note) {
  assertIsAdmin_();
  var rowNum = findRowByAralCode_(aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(rowNum);
  var folder = DriveApp.getFolderById(record.folderId);
  moveFolderToStatus_(folder, 'SUPPLEMENTAL');

  updateRowFields_(rowNum, {
    STATUS: CONFIG.STATUS.SUPPLEMENTAL,
    ADMIN_NOTES: note || record.adminNotes
  });

  if (note) notifyAgentCustomFlag_(readRowAsRecord_(rowNum), note);
  return admin_getDashboardData();
}

function admin_approveForUnderwriting(aralCode) {
  assertIsAdmin_();
  var rowNum = findRowByAralCode_(aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(rowNum);
  var folder = DriveApp.getFolderById(record.folderId);
  moveFolderToStatus_(folder, 'READY');

  updateRowFields_(rowNum, { STATUS: CONFIG.STATUS.READY, SCORE: 100 });
  notifyUnderwritingReady_(readRowAsRecord_(rowNum));
  return admin_getDashboardData();
}

function admin_markPolicyIssued(aralCode, tatilPolicyNumber) {
  assertIsAdmin_();
  if (!tatilPolicyNumber) throw new Error('A TATIL policy number is required.');
  var rowNum = findRowByAralCode_(aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(rowNum);
  var folder = DriveApp.getFolderById(record.folderId);
  moveFolderToStatus_(folder, 'COMPLETED');

  updateRowFields_(rowNum, {
    STATUS: CONFIG.STATUS.COMPLETED,
    TATIL_POLICY_NUMBER: tatilPolicyNumber
  });
  return admin_getDashboardData();
}

/** Milliseconds remaining until today's (or, once passed, today's already-elapsed) 11:00 AM TATIL cutoff. */
function admin_getCutoffStatus() {
  var now = new Date();
  var cutoff = new Date(now);
  cutoff.setHours(CONFIG.CUTOFF_HOUR, 0, 0, 0);
  var msRemaining = cutoff.getTime() - now.getTime();

  return {
    nowIso: now.toISOString(),
    cutoffIso: cutoff.toISOString(),
    msRemaining: Math.max(msRemaining, 0),
    passed: msRemaining <= 0,
    timezone: Session.getScriptTimeZone(),
    cutoffHour: CONFIG.CUTOFF_HOUR
  };
}
