/**
 * Entry points: the web app (doGet), the Form-submit trigger, and the
 * one-time setup routine. See README.md for the full setup walkthrough.
 */

function doGet(e) {
  var params = (e && e.parameter) || {};
  var viewer = Session.getActiveUser().getEmail() || '';
  var admins = getAdminEmails_();
  var isAdmin = admins.indexOf(viewer.toLowerCase()) !== -1;

  var view = params.view;
  if (view !== 'admin' && view !== 'agent') {
    view = isAdmin ? 'admin' : 'agent';
  }
  if (view === 'admin' && !isAdmin && admins.length > 0) {
    // Once admins are configured, nobody else can force their way into the admin view via ?view=admin.
    view = 'agent';
  }

  var template = HtmlService.createTemplateFromFile('Index');
  template.view = view;
  template.viewerEmail = viewer;
  template.isAdmin = isAdmin;

  return template.evaluate()
    .setTitle('ARAL Insurance Pipeline')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * One-time setup: run this manually from the Apps Script editor (select
 * `setupPipeline` in the function dropdown, then Run) after linking the
 * Google Form to this Sheet. Safe to re-run at any time.
 */
function setupPipeline() {
  getOrCreateRootStructure_();
  getTrackerSheet_();
  installFormSubmitTrigger_();
  SpreadsheetApp.getActiveSpreadsheet().toast('ARAL pipeline setup complete.', 'Setup', 5);
}

function installFormSubmitTrigger_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var already = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'onFormSubmitTrigger' && t.getTriggerSourceId() === ss.getId();
  });
  if (already) return;
  ScriptApp.newTrigger('onFormSubmitTrigger').forSpreadsheet(ss).onFormSubmit().create();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ARAL Pipeline')
    .addItem('Run setup (folders + trigger)', 'setupPipeline')
    .addItem('Reprocess all rows', 'reprocessAllRows')
    .addToUi();
}

/**
 * Installable trigger fired on every Form submission to this Sheet.
 * namedValues keys must exactly match the titles in CONFIG.FORM_FIELDS.
 */
function onFormSubmitTrigger(e) {
  var nv = (e && e.namedValues) || {};
  var get = function (key) {
    var val = nv[CONFIG.FORM_FIELDS[key]];
    return val ? val[0] : '';
  };

  var clientName = get('CLIENT_NAME');
  var agentName = get('AGENT_NAME');
  var agentEmail = get('AGENT_EMAIL');
  var policyType = get('POLICY_TYPE');
  var vehicleReg = get('VEHICLE_REG');

  var aralCode = nextAralCode_();
  var folder = createClientFolder_(aralCode, clientName, policyType);

  var hasPermit = attachUploadToFolder_(get('DRIVERS_PERMIT_FILE'), folder, 'DRIVERS_PERMIT');
  var hasVehicleCert = attachUploadToFolder_(get('VEHICLE_CERT_FILE'), folder, 'VEHICLE_CERT');
  var hasValuation = attachUploadToFolder_(get('VALUATION_FILE'), folder, 'VALUATION');
  var hasUtilityBill = attachUploadToFolder_(get('UTILITY_BILL_FILE'), folder, 'UTILITY_BILL');

  var permitExpiry = parseFormDate_(get('DRIVERS_PERMIT_EXPIRY'));
  var utilityBillDate = parseFormDate_(get('UTILITY_BILL_DATE'));

  var evaluation = evaluateSubmission_({
    policyType: policyType,
    hasPermit: hasPermit,
    permitExpiry: permitExpiry,
    hasVehicleCert: hasVehicleCert,
    hasValuation: hasValuation,
    hasUtilityBill: hasUtilityBill,
    utilityBillDate: utilityBillDate
  });

  moveFolderToStatus_(folder, evaluation.statusKey);

  var record = {
    aralCode: aralCode,
    clientName: clientName,
    agentName: agentName,
    agentEmail: agentEmail,
    policyType: policyType,
    vehicleReg: vehicleReg,
    score: evaluation.score,
    status: CONFIG.STATUS[evaluation.statusKey],
    missing: evaluation.missing,
    folderUrl: folder.getUrl(),
    folderId: folder.getId(),
    permitExpiry: permitExpiry,
    utilityBillDate: utilityBillDate
  };

  appendTrackerRow_(record);

  if (evaluation.statusKey === 'INCOMPLETE') {
    notifyAgentMissingFields_(record);
  } else if (evaluation.statusKey === 'READY') {
    notifyUnderwritingReady_(record);
  }
}

/** Parses Google Forms date answers, which can arrive as ISO or as DD/MM/YYYY depending on locale. */
function parseFormDate_(raw) {
  if (!raw) return null;
  var direct = new Date(raw);
  if (!isNaN(direct.getTime())) return direct;

  var dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw).trim());
  if (dmy) {
    var parsed = new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/** Re-runs the vetting engine over every tracker row. Handy after editing CONFIG or fixing a misconfigured Form. */
function reprocessAllRows() {
  getAllRecords_().forEach(function (record) { reevaluateRecord_(record); });
}

/**
 * Re-checks a tracker row's Drive folder contents + stored dates and
 * updates score/status/folder placement accordingly. Used both by
 * reprocessAllRows() and after an agent re-uploads a document.
 */
function reevaluateRecord_(record) {
  if (!record.folderId) return record;
  var folder = safeGetFolder_(record.folderId);
  if (!folder) return record;

  var evaluation = evaluateSubmission_({
    policyType: record.policyType,
    hasPermit: folderHasDoc_(folder, 'DRIVERS_PERMIT'),
    permitExpiry: record.permitExpiry ? new Date(record.permitExpiry) : null,
    hasVehicleCert: folderHasDoc_(folder, 'VEHICLE_CERT'),
    hasValuation: folderHasDoc_(folder, 'VALUATION'),
    hasUtilityBill: folderHasDoc_(folder, 'UTILITY_BILL'),
    utilityBillDate: record.utilityBillDate ? new Date(record.utilityBillDate) : null
  });

  moveFolderToStatus_(folder, evaluation.statusKey);

  updateRowFields_(record.rowNum, {
    SCORE: evaluation.score,
    STATUS: CONFIG.STATUS[evaluation.statusKey],
    MISSING_FIELDS: evaluation.missing.join('; ')
  });

  var updated = readRowAsRecord_(record.rowNum);
  if (evaluation.statusKey === 'INCOMPLETE') {
    notifyAgentMissingFields_(updated);
  } else if (evaluation.statusKey === 'READY') {
    notifyUnderwritingReady_(updated);
  }
  return updated;
}
