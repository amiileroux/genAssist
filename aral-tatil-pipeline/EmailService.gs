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
