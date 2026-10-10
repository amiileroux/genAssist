/** Agent/underwriting notification emails. Uses MailApp so it works without any extra Gmail setup. */

/** Client Name isn't collected on the form - it's set by an admin later - so a fresh submission usually has none yet. */
function clientLabel_(record) {
  return record.clientName && String(record.clientName).trim() ? record.clientName : 'this client';
}

/** Motor records carry Coverage Type, Property records carry Type of Occupancy - either way, the category to show in an email. */
function categoryLabel_(record) {
  return record.line === 'PROPERTY' ? record.occupancyType : record.coverageType;
}

function notifyAgentMissingFields_(record) {
  if (!record.agentEmail) return;
  var subject = '[ARAL] Action needed on ' + record.aralCode + ' - ' + clientLabel_(record);
  var body = [
    'Hi ' + (record.agentName || 'there') + ',',
    '',
    'The submission for ' + clientLabel_(record) + ' (' + record.aralCode + ') is missing the following before it can go to TATIL Underwriting:',
    '',
    (record.missing || []).map(function (m) { return '- ' + m; }).join('\n'),
    '',
    'Please re-upload the corrected document(s) from your Agent Portal, or contact the back office.',
    '',
    '-- ARAL Insurance Pipeline (automated message)'
  ].join('\n');
  MailApp.sendEmail(record.agentEmail, subject, body);
}

function notifyAgentCustomFlag_(record, note) {
  if (!record.agentEmail) return;
  var subject = '[ARAL] Submission flagged - ' + record.aralCode + ' - ' + clientLabel_(record);
  var body = [
    'Hi ' + (record.agentName || 'there') + ',',
    '',
    'An admin has flagged the submission for ' + clientLabel_(record) + ' (' + record.aralCode + '):',
    '',
    note,
    '',
    '-- ARAL Insurance Pipeline (automated message)'
  ].join('\n');
  MailApp.sendEmail(record.agentEmail, subject, body);
}

function notifyUnderwritingReady_(record) {
  var to = getUnderwritingEmail_();
  if (!to) return;
  var subject = '[ARAL] Ready for Underwriting - ' + record.aralCode + ' - ' + clientLabel_(record);
  var body = [
    clientLabel_(record) + ' (' + record.aralCode + ', ' + categoryLabel_(record) + ') is 100% vetted and ready for TATIL Underwriting.',
    'Drive folder: ' + record.folderUrl,
    'Agent: ' + record.agentName + ' <' + record.agentEmail + '>'
  ].join('\n');
  MailApp.sendEmail(to, subject, body);
}

/** Lets admins know something in the client workflow needs their review (signed forms or payment proof arrived). */
function notifyAdminActionNeeded_(record, message) {
  var admins = getAdminEmails_();
  if (!admins.length) return;
  var subject = '[ARAL] ' + message + ' - ' + record.aralCode + ' - ' + clientLabel_(record);
  var body = [
    message + ' for ' + clientLabel_(record) + ' (' + record.aralCode + ').',
    'Review on the Admin Dashboard.',
    '',
    '-- ARAL Insurance Pipeline (automated message)'
  ].join('\n');
  MailApp.sendEmail({ to: admins.join(','), subject: subject, body: body });
}

/** Sends to `to`, cc'ing `cc` only if it's non-empty - avoids passing a falsy cc through to MailApp. */
function sendEmailWithOptionalCc_(to, cc, subject, body) {
  var options = { to: to, subject: subject, body: body };
  if (cc) options.cc = cc;
  MailApp.sendEmail(options);
}

/** Client workflow step 1: application forms (template Doc) are ready for the client to sign. */
function notifyClientFormsSent_(record, docUrl) {
  if (!record.clientEmail) return;
  var subject = '[ARAL] Your ' + categoryLabel_(record) + ' application is ready to sign - ' + record.aralCode;
  var agentRef = record.agentName ? record.agentName + (record.agentEmail ? ' (' + record.agentEmail + ')' : '') : 'your ARAL agent';
  var body = [
    'Hi ' + clientLabel_(record) + ',',
    '',
    'Your application (' + record.aralCode + ') has been vetted and is ready for your signature. You have two ways to complete it:',
    '',
    '1. Open the document below, fill in and sign electronically (type your name where indicated), then save - nothing further to send back.',
    '2. Download and print it, sign by hand, then send a clear photo or scan to your agent, ' + agentRef + ', who will upload it on your behalf.',
    '',
    'Document: ' + docUrl,
    '',
    'Once we receive your signed application, we will confirm and send you the payment link.',
    '',
    '-- A. Rauseo & Associates Limited (automated message)'
  ].join('\n');
  sendEmailWithOptionalCc_(record.clientEmail, record.agentEmail, subject, body);
}

/** Client workflow step 2: signed forms approved - send the TATIL payment link. */
function notifyApprovalPaymentLink_(record) {
  if (!record.clientEmail) return;
  var subject = '[ARAL] Approved! Payment link for ' + record.aralCode;
  var agentRef = record.agentName ? record.agentName + (record.agentEmail ? ' (' + record.agentEmail + ')' : '') : 'your ARAL agent';
  var body = [
    'Hi ' + clientLabel_(record) + ',',
    '',
    'Great news - your signed application has been approved. To finalize your policy, please complete payment via the TATIL payment portal:',
    '',
    CONFIG.TATIL_PAYMENT_URL,
    '',
    'Once you have paid, please send a screenshot of your payment confirmation to your agent, ' + agentRef +
    ', who will upload it so we can confirm and issue your policy.',
    '',
    '-- A. Rauseo & Associates Limited (automated message)'
  ].join('\n');
  sendEmailWithOptionalCc_(record.clientEmail, record.agentEmail, subject, body);
}

/** Client workflow step 3 (final): payment confirmed, policy issued - the "you're covered" notification. */
function notifyPolicyConfirmed_(record) {
  var ccList = [record.agentEmail].concat(getAdminEmails_()).filter(Boolean).join(',');
  var subject = 'Congratulations! ' + clientLabel_(record) + ', you are now covered - ' + record.aralCode;
  var body = [
    'Congratulations! ' + clientLabel_(record) + ', you are now covered.',
    '',
    'Policy: ' + record.aralCode + (record.tatilPolicyNumber ? ' (TATIL ' + record.tatilPolicyNumber + ')' : ''),
    'Coverage: ' + categoryLabel_(record),
    '',
    'Thank you for choosing A. Rauseo & Associates Limited.',
    '',
    '-- A. Rauseo & Associates Limited (automated message)'
  ].join('\n');

  if (record.clientEmail) {
    sendEmailWithOptionalCc_(record.clientEmail, ccList, subject, body);
  } else if (ccList) {
    MailApp.sendEmail({ to: ccList, subject: subject, body: body });
  }
}
