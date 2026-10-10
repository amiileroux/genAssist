/** Server functions called from the Admin Dashboard (AdminScript.html) via google.script.run. Every action takes `line` ('MOTOR' or 'PROPERTY') first. */

function assertIsAdmin_() {
  var viewer = (Session.getActiveUser().getEmail() || '').toLowerCase();
  var admins = getAdminEmails_();
  if (admins.length > 0 && admins.indexOf(viewer) === -1) {
    throw new Error('You do not have admin access to this pipeline.');
  }
}

/** Common shape both lines are flattened into for the dashboard, with line-specific extras kept under `details`. */
function toRowView_(r) {
  var details = r.line === 'PROPERTY'
    ? { residentialContents: r.residentialContents }
    : {
      // Newly Purchased / NCD Level / Claim History aren't all auto-scored
      // (see VettingEngine.gs) - shown so an admin has the context to judge.
      newlyPurchased: r.newlyPurchased,
      ncdLevel: r.ncdLevel,
      claimHistoryAnswer: r.claimHistoryAnswer,
      newDriver: r.newDriver,
      vehicleSpecs: r.vehicleSpecs
    };

  return {
    line: r.line,
    rowNum: r.rowNum,
    aralCode: r.aralCode,
    clientName: r.clientName,
    clientEmail: r.clientEmail,
    clientPhone: r.clientPhone,
    agentName: r.agentName,
    agentEmail: r.agentEmail,
    categoryLabel: r.line === 'PROPERTY' ? r.occupancyType : r.coverageType,
    score: r.score,
    status: r.status,
    missing: r.missing ? String(r.missing).split('; ').filter(Boolean) : [],
    folderUrl: r.folderUrl,
    policyStage: r.policyStage,
    signedDocUrl: r.signedDocUrl,
    paymentProofUrl: r.paymentProofUrl,
    tatilPolicyNumber: r.tatilPolicyNumber,
    details: details,
    submittedAt: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp || ''),
    lastUpdated: r.lastUpdated instanceof Date ? r.lastUpdated.toISOString() : String(r.lastUpdated || '')
  };
}

function admin_getDashboardData(line) {
  assertIsAdmin_();
  getLineConfig_(line); // throws on an unknown line
  return getAllRecords_(line)
    .map(toRowView_)
    .sort(function (a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); });
}

function admin_flagIncomplete(line, aralCode, note) {
  assertIsAdmin_();
  var rowNum = findRowByAralCode_(line, aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(line, rowNum);
  var folder = DriveApp.getFolderById(record.folderId);
  moveFolderToStatus_(line, folder, 'INCOMPLETE');

  var missingList = note ? [note] : (record.missing ? String(record.missing).split('; ') : []);
  updateRowFields_(line, rowNum, {
    STATUS: CONFIG.STATUS.INCOMPLETE,
    MISSING_FIELDS: missingList.join('; '),
    ADMIN_NOTES: note || record.adminNotes
  });

  var updated = readRowAsRecord_(line, rowNum);
  updated.missing = missingList;
  notifyAgentCustomFlag_(updated, note || 'Please review and correct the flagged items.');
  return admin_getDashboardData(line);
}

/**
 * Sets (or corrects) the client's name - read off the uploaded DP Licence,
 * since neither form collects a name. Also renames the Drive folder so it
 * stays searchable by client name.
 */
function admin_setClientName(line, aralCode, clientName) {
  assertIsAdmin_();
  if (!clientName) throw new Error('Client name cannot be empty.');
  var rowNum = findRowByAralCode_(line, aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(line, rowNum);

  var folder = safeGetFolder_(record.folderId);
  var categoryLabel = line === 'PROPERTY' ? record.occupancyType : record.coverageType;
  if (folder) renameClientFolder_(folder, aralCode, clientName, categoryLabel);

  updateRowFields_(line, rowNum, { CLIENT_NAME: clientName });
  return admin_getDashboardData(line);
}

function admin_requestSupplementalInfo(line, aralCode, note) {
  assertIsAdmin_();
  var rowNum = findRowByAralCode_(line, aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(line, rowNum);
  var folder = DriveApp.getFolderById(record.folderId);
  moveFolderToStatus_(line, folder, 'SUPPLEMENTAL');

  updateRowFields_(line, rowNum, {
    STATUS: CONFIG.STATUS.SUPPLEMENTAL,
    ADMIN_NOTES: note || record.adminNotes
  });

  if (note) notifyAgentCustomFlag_(readRowAsRecord_(line, rowNum), note);
  return admin_getDashboardData(line);
}

function admin_approveForUnderwriting(line, aralCode) {
  assertIsAdmin_();
  var rowNum = findRowByAralCode_(line, aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(line, rowNum);
  var folder = DriveApp.getFolderById(record.folderId);
  moveFolderToStatus_(line, folder, 'READY');

  updateRowFields_(line, rowNum, { STATUS: CONFIG.STATUS.READY, SCORE: 100 });
  notifyUnderwritingReady_(readRowAsRecord_(line, rowNum));
  return admin_getDashboardData(line);
}

function admin_markPolicyIssued(line, aralCode, tatilPolicyNumber) {
  assertIsAdmin_();
  if (!tatilPolicyNumber) throw new Error('A TATIL policy number is required.');
  var rowNum = findRowByAralCode_(line, aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(line, rowNum);
  var folder = DriveApp.getFolderById(record.folderId);
  moveFolderToStatus_(line, folder, 'COMPLETED');

  updateRowFields_(line, rowNum, {
    STATUS: CONFIG.STATUS.COMPLETED,
    TATIL_POLICY_NUMBER: tatilPolicyNumber
  });
  return admin_getDashboardData(line);
}

/** Milliseconds remaining until today's (or, once passed, today's already-elapsed) 11:00 AM TATIL cutoff. Same cutoff for both lines. */
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
