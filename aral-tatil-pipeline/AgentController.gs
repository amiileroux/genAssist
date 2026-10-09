/** Server functions called from the Agent Portal (AgentScript.html) via google.script.run. */

var AGENT_DOC_KEYS = {
  permit: 'DRIVERS_PERMIT',
  vehicleCert: 'VEHICLE_CERT',
  valuation: 'VALUATION',
  utilityBill: 'UTILITY_BILL'
};

function agent_getMySubmissions(agentEmail) {
  var email = (agentEmail || Session.getActiveUser().getEmail() || '').toLowerCase().trim();
  return getAllRecords_()
    .filter(function (r) { return (r.agentEmail || '').toLowerCase().trim() === email; })
    .map(function (r) {
      return {
        aralCode: r.aralCode,
        clientName: r.clientName,
        policyType: r.policyType,
        score: r.score,
        status: r.status,
        missing: r.missing ? String(r.missing).split('; ').filter(Boolean) : [],
        folderUrl: r.folderUrl,
        tatilPolicyNumber: r.tatilPolicyNumber,
        submittedAt: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp || '')
      };
    })
    .sort(function (a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); });
}

/**
 * Agent re-upload from the mobile portal. base64Data is the raw file
 * content, base64-encoded client-side with no "data:" URL prefix.
 */
function agent_reuploadDocument(aralCode, docKey, base64Data, fileName, mimeType) {
  if (!AGENT_DOC_KEYS[docKey]) throw new Error('Unknown document type: ' + docKey);
  var rowNum = findRowByAralCode_(aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(rowNum);

  var viewer = (Session.getActiveUser().getEmail() || '').toLowerCase().trim();
  if (viewer && record.agentEmail && viewer !== String(record.agentEmail).toLowerCase().trim()) {
    throw new Error('This submission belongs to a different agent.');
  }

  var folder = DriveApp.getFolderById(record.folderId);
  var prefix = AGENT_DOC_KEYS[docKey];

  // Replace any previous version of this document.
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf(prefix) === 0) folder.removeFile(f);
  }

  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  var newFile = folder.createFile(blob);
  newFile.setName(prefix + '__' + fileName);

  return reevaluateRecord_(readRowAsRecord_(rowNum));
}
