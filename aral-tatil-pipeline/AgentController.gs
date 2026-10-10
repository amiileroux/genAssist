/** Server functions called from the Agent Portal (AgentScript.html) via google.script.run. */

var AGENT_DOC_KEYS = {
  dpLicence: 'DP_LICENCE',
  certifiedCopy: 'CERTIFIED_COPY',
  proofOfAddress: 'PROOF_OF_ADDRESS',
  ncdLetter: 'NCD_LETTER',
  claimHistoryLetter: 'CLAIM_HISTORY_LETTER',
  certOfRegistration: 'CERT_OF_REGISTRATION',
  directorsIdDp: 'DIRECTORS_ID_DP',
  propertyImage: 'PROPERTY_IMAGE',
  propertyEvaluationReport: 'PROPERTY_EVALUATION_REPORT',
  // Client workflow docs (ClientWorkflow.gs) - handled separately below,
  // not part of the KYC-vetting checklist these other keys feed into.
  signedApplication: 'SIGNED_APPLICATION',
  paymentProof: 'PAYMENT_PROOF'
};

/** Returns the agent's submissions across BOTH lines, each tagged with `line` so the Agent Portal can re-upload against the right one. */
function agent_getMySubmissions(agentEmail) {
  var email = (agentEmail || Session.getActiveUser().getEmail() || '').toLowerCase().trim();

  var all = [];
  Object.keys(CONFIG.LINES).forEach(function (lineKey) {
    getAllRecords_(lineKey)
      .filter(function (r) { return (r.agentEmail || '').toLowerCase().trim() === email; })
      .forEach(function (r) {
        all.push({
          line: r.line,
          aralCode: r.aralCode,
          clientName: r.clientName,
          categoryLabel: r.line === 'PROPERTY' ? r.occupancyType : r.coverageType,
          score: r.score,
          status: r.status,
          missing: r.missing ? String(r.missing).split('; ').filter(Boolean) : [],
          folderUrl: r.folderUrl,
          policyStage: r.policyStage,
          signedDocUrl: r.signedDocUrl,
          paymentProofUrl: r.paymentProofUrl,
          tatilPolicyNumber: r.tatilPolicyNumber,
          submittedAt: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp || '')
        });
      });
  });

  return all.sort(function (a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); });
}

function assertAgentOwnsRecord_(record) {
  var viewer = (Session.getActiveUser().getEmail() || '').toLowerCase().trim();
  if (viewer && record.agentEmail && viewer !== String(record.agentEmail).toLowerCase().trim()) {
    throw new Error('This submission belongs to a different agent.');
  }
}

/**
 * Agent re-upload from the mobile portal. base64Data is the raw file
 * content, base64-encoded client-side with no "data:" URL prefix.
 *
 * For the two client-workflow doc keys (signedApplication, paymentProof)
 * this also advances Policy Stage and alerts admins it needs review,
 * instead of re-running the KYC vetting score - those documents aren't
 * part of that checklist.
 */
function agent_reuploadDocument(line, aralCode, docKey, base64Data, fileName, mimeType) {
  if (!AGENT_DOC_KEYS[docKey]) throw new Error('Unknown document type: ' + docKey);
  var rowNum = findRowByAralCode_(line, aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(line, rowNum);
  assertAgentOwnsRecord_(record);

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

  if (docKey === 'signedApplication') {
    updateRowFields_(line, rowNum, {
      SIGNED_DOC_URL: newFile.getUrl(),
      POLICY_STAGE: CONFIG.POLICY_STAGE.SIGNED_PENDING_APPROVAL
    });
    var afterSign = readRowAsRecord_(line, rowNum);
    notifyAdminActionNeeded_(afterSign, 'Signed application received');
    return afterSign;
  }

  if (docKey === 'paymentProof') {
    updateRowFields_(line, rowNum, {
      PAYMENT_PROOF_URL: newFile.getUrl(),
      POLICY_STAGE: CONFIG.POLICY_STAGE.PAYMENT_PENDING_CONFIRMATION
    });
    var afterPayment = readRowAsRecord_(line, rowNum);
    notifyAdminActionNeeded_(afterPayment, 'Payment proof received');
    return afterPayment;
  }

  return reevaluateRecord_(readRowAsRecord_(line, rowNum));
}

/**
 * Agent action for the "client edited the shared Doc online and saved"
 * signing path (as opposed to uploading a signed scan) - there's no way
 * for the script to detect that on its own, so the agent confirms it
 * once the client's done.
 */
function agent_markFormsSigned(line, aralCode) {
  var rowNum = findRowByAralCode_(line, aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(line, rowNum);
  assertAgentOwnsRecord_(record);

  updateRowFields_(line, rowNum, { POLICY_STAGE: CONFIG.POLICY_STAGE.SIGNED_PENDING_APPROVAL });
  var updated = readRowAsRecord_(line, rowNum);
  notifyAdminActionNeeded_(updated, 'Signed application received');
  return updated;
}
