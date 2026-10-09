/** Agent/underwriting notification emails. Uses MailApp so it works without any extra Gmail setup. */

function notifyAgentMissingFields_(record) {
  if (!record.agentEmail) return;
  var subject = '[ARAL] Action needed on ' + record.aralCode + ' - ' + record.clientName;
  var body = [
    'Hi ' + (record.agentName || 'there') + ',',
    '',
    'The submission for ' + record.clientName + ' (' + record.aralCode + ') is missing the following before it can go to TATIL Underwriting:',
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
  var subject = '[ARAL] Submission flagged - ' + record.aralCode + ' - ' + record.clientName;
  var body = [
    'Hi ' + (record.agentName || 'there') + ',',
    '',
    'An admin has flagged the submission for ' + record.clientName + ' (' + record.aralCode + '):',
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
  var subject = '[ARAL] Ready for Underwriting - ' + record.aralCode + ' - ' + record.clientName;
  var body = [
    record.clientName + ' (' + record.aralCode + ', ' + record.policyType + ') is 100% vetted and ready for TATIL Underwriting.',
    'Drive folder: ' + record.folderUrl,
    'Agent: ' + record.agentName + ' <' + record.agentEmail + '>'
  ].join('\n');
  MailApp.sendEmail(to, subject, body);
}
