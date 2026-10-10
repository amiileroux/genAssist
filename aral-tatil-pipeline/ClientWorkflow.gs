/**
 * Post-approval client workflow: once a submission reaches 100% and KYC
 * vetting is done (STATUS = Ready for Underwriting), this drives the
 * rest of the way to an issued policy:
 *
 *   Ready for Underwriting
 *     -> admin_sendApplicationForms      (this file)   -> Forms Sent
 *     -> client/agent return it, signed  (AgentController.gs) -> Signed - Pending ARAL Approval
 *     -> admin_approveSignedForms        (this file)   -> Approved - Payment Link Sent
 *     -> client pays, proof comes back   (AgentController.gs) -> Payment Submitted - Pending Confirmation
 *     -> admin_markPolicyIssued          (AdminController.gs) -> Policy Confirmed - Client Covered
 *
 * Each step's notification is in EmailService.gs. CONFIG.POLICY_STAGE
 * names every stage; the "Policy Stage" tracker column tracks it,
 * independent of the KYC-readiness STATUS/score.
 *
 * SETUP REQUIRED: this needs a Google Doc template per line, created by
 * you (not generated here) with ARAL/TATIL's real application wording,
 * containing these placeholder tokens wherever the matching data should
 * drop in:
 *   {{ARAL_CODE}}  {{CLIENT_NAME}}  {{CLIENT_EMAIL}}  {{CLIENT_PHONE}}
 *   {{AGENT_NAME}}  {{AGENT_EMAIL}}  {{CATEGORY}}  {{SUBMISSION_DATE}}
 * Once created, put each template's Doc ID (from its URL) into the
 * matching Script Property - see Config.gs's TEMPLATE_DOC_PROPERTY_KEY
 * per line, and README.md "Setup" for the exact steps.
 */

/**
 * Admin action: copies the line's application template, fills in this
 * submission's details, shares it with the client (edit access, for the
 * "fill in online" path) and the agent (view access), and emails both
 * with the link plus instructions covering both signing options (edit
 * online and save, or print/sign/send back to the agent to upload).
 */
function admin_sendApplicationForms(line, aralCode) {
  assertIsAdmin_();
  var rowNum = findRowByAralCode_(line, aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(line, rowNum);

  if (record.status !== CONFIG.STATUS.READY) {
    throw new Error('This submission must be "Ready for Underwriting" before sending application forms (currently: ' + record.status + ').');
  }
  if (!record.clientEmail) {
    throw new Error('No client email on file for ' + aralCode + ' - cannot send.');
  }

  var line_ = getLineConfig_(line);
  var templateDocId = getScriptProperty_(line_.TEMPLATE_DOC_PROPERTY_KEY);
  if (!templateDocId) {
    throw new Error('No application template set up for ' + line_.LABEL + '. Create the Google Doc template and set the ' +
      line_.TEMPLATE_DOC_PROPERTY_KEY + ' Script Property to its Doc ID - see README.md "Setup".');
  }

  var folder = safeGetFolder_(record.folderId);
  if (!folder) throw new Error('Drive folder not found for ' + aralCode + '.');

  var doc = fillApplicationTemplate_(templateDocId, folder, record);

  doc.addEditor(record.clientEmail);
  if (record.agentEmail) doc.addViewer(record.agentEmail);

  updateRowFields_(line, rowNum, {
    POLICY_STAGE: CONFIG.POLICY_STAGE.FORMS_SENT,
    SIGNED_DOC_URL: doc.getUrl()
  });

  var updated = readRowAsRecord_(line, rowNum);
  notifyClientFormsSent_(updated, doc.getUrl());
  return admin_getDashboardData(line);
}

/**
 * Creates a filled copy of the template Doc inside the client's Drive
 * folder, replacing every {{TOKEN}} with this submission's data.
 */
function fillApplicationTemplate_(templateDocId, destinationFolder, record) {
  var templateFile = DriveApp.getFileById(templateDocId);
  var copy = templateFile.makeCopy(record.aralCode + ' - Application for Signature', destinationFolder);
  var doc = DocumentApp.openById(copy.getId());
  var body = doc.getBody();

  var categoryLabel = record.line === 'PROPERTY' ? record.occupancyType : record.coverageType;
  var tokens = {
    '{{ARAL_CODE}}': record.aralCode || '',
    '{{CLIENT_NAME}}': record.clientName || '',
    '{{CLIENT_EMAIL}}': record.clientEmail || '',
    '{{CLIENT_PHONE}}': record.clientPhone || '',
    '{{AGENT_NAME}}': record.agentName || '',
    '{{AGENT_EMAIL}}': record.agentEmail || '',
    '{{CATEGORY}}': categoryLabel || '',
    '{{SUBMISSION_DATE}}': Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy')
  };
  Object.keys(tokens).forEach(function (token) {
    body.replaceText(token.replace(/[{}]/g, '\\$&'), tokens[token]);
  });

  doc.saveAndClose();
  return DriveApp.getFileById(copy.getId());
}

/**
 * Admin action: marks the returned, signed application as approved and
 * sends the client the TATIL payment link. Requires the signed forms to
 * actually be back (POLICY_STAGE = Signed - Pending ARAL Approval) -
 * via either the client editing+saving the shared Doc (agent then calls
 * agent_markFormsSigned) or the agent uploading a signed scan
 * (agent_reuploadDocument with docKey 'signedApplication').
 */
function admin_approveSignedForms(line, aralCode) {
  assertIsAdmin_();
  var rowNum = findRowByAralCode_(line, aralCode);
  if (!rowNum) throw new Error('Submission not found: ' + aralCode);
  var record = readRowAsRecord_(line, rowNum);

  if (record.policyStage !== CONFIG.POLICY_STAGE.SIGNED_PENDING_APPROVAL) {
    throw new Error('Signed application forms are not yet back for ' + aralCode + ' (current stage: ' +
      (record.policyStage || 'not started') + ').');
  }

  updateRowFields_(line, rowNum, { POLICY_STAGE: CONFIG.POLICY_STAGE.APPROVED_PENDING_PAYMENT });

  var updated = readRowAsRecord_(line, rowNum);
  notifyApprovalPaymentLink_(updated);
  return admin_getDashboardData(line);
}
