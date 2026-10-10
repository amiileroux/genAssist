/**
 * Entry points: the web app (doGet), the Form-submit trigger (shared by
 * both the Motor and Property Forms, routed by which raw-response sheet
 * received the new row), and the one-time setup routine. See README.md
 * for the full setup walkthrough.
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
 * `setupPipeline` in the function dropdown, then Run) after linking both
 * the Motor and Property Google Forms to this Sheet. Safe to re-run at
 * any time.
 */
function setupPipeline() {
  Object.keys(CONFIG.LINES).forEach(function (lineKey) {
    getOrCreateLineStructure_(lineKey);
    getTrackerSheet_(lineKey);
  });
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
 * Installable trigger fired on every submission to EITHER linked Form
 * (a spreadsheet-level onFormSubmit trigger fires regardless of which
 * linked Form was submitted). Routes by which raw-response sheet the new
 * row landed in - CONFIG.LINES.<key>.RESPONSE_SHEET_NAME must match that
 * tab's actual name (confirm/rename after linking each Form; see README).
 */
function onFormSubmitTrigger(e) {
  var sheetName = e && e.range ? e.range.getSheet().getName() : '';

  if (sheetName === CONFIG.LINES.MOTOR.RESPONSE_SHEET_NAME) {
    onMotorFormSubmit_(e);
  } else if (sheetName === CONFIG.LINES.PROPERTY.RESPONSE_SHEET_NAME) {
    onPropertyFormSubmit_(e);
  } else {
    throw new Error('onFormSubmitTrigger: submission landed on an unrecognized sheet "' + sheetName +
      '" - update CONFIG.LINES.MOTOR.RESPONSE_SHEET_NAME / CONFIG.LINES.PROPERTY.RESPONSE_SHEET_NAME in Config.gs to match.');
  }
}

function onMotorFormSubmit_(e) {
  var fields = CONFIG.LINES.MOTOR.FORM_FIELDS;
  var nv = (e && e.namedValues) || {};
  var get = function (key) {
    var val = nv[fields[key]];
    return val ? val[0] : '';
  };

  var agentName = get('PRODUCER_NAME');
  var agentEmail = get('AGENT_EMAIL');
  var coverageType = get('COVERAGE_TYPE');
  var vehicleSpecsText = get('VEHICLE_SPECS');
  var newlyPurchased = get('NEWLY_PURCHASED');
  var ncdLevel = get('NCD_LEVEL');
  var hasNcdLetterAnswer = get('HAS_NCD_LETTER_Q');
  var claimHistoryAnswer = get('CLAIM_HISTORY_Q');
  var valueOfVehicle = get('VALUE_OF_VEHICLE');

  var newDriver = isNewDriver_(hasNcdLetterAnswer);

  var aralCode = nextAralCode_('MOTOR');
  // Client Name isn't on the form - it's set by an admin off the DP Licence upload (see admin_setClientName).
  var folder = createClientFolder_('MOTOR', aralCode, '', coverageType);

  var hasDpLicence = attachUploadToFolder_(get('DP_LICENCE_FILE'), folder, 'DP_LICENCE');
  attachUploadToFolder_(get('ID_FILE'), folder, 'ID');
  var hasCertOfRegistration = attachUploadToFolder_(get('CERT_OF_REGISTRATION_FILE'), folder, 'CERT_OF_REGISTRATION');
  attachUploadToFolder_(get('VEHICLE_INVOICE_FILE'), folder, 'VEHICLE_INVOICE');
  var hasCertifiedCopy = attachUploadToFolder_(get('CERTIFIED_COPY_FILE'), folder, 'CERTIFIED_COPY');
  var hasProofOfAddress = attachUploadToFolder_(get('PROOF_OF_ADDRESS_FILE'), folder, 'PROOF_OF_ADDRESS');
  var hasNcdLetterFile = attachUploadToFolder_(get('NCD_LETTER_FILE'), folder, 'NCD_LETTER');
  var hasClaimHistoryLetterFile = attachUploadToFolder_(get('CLAIM_HISTORY_LETTER_FILE'), folder, 'CLAIM_HISTORY_LETTER');

  var evaluation = evaluateMotorSubmission_({
    hasDpLicence: hasDpLicence,
    hasCertifiedCopy: hasCertifiedCopy,
    hasVehicleSpecsText: !!vehicleSpecsText,
    hasProofOfAddress: hasProofOfAddress,
    hasValueOfVehicle: !!valueOfVehicle,
    ncdLevel: ncdLevel,
    newDriver: newDriver,
    hasNcdLetterFile: hasNcdLetterFile,
    claimHistoryAnswer: claimHistoryAnswer,
    hasClaimHistoryLetterFile: hasClaimHistoryLetterFile,
    coverageType: coverageType,
    hasCertOfRegistration: hasCertOfRegistration,
    newlyPurchased: newlyPurchased
  });

  moveFolderToStatus_('MOTOR', folder, evaluation.statusKey);

  var record = {
    line: 'MOTOR',
    aralCode: aralCode,
    clientName: '',
    agentName: agentName,
    agentEmail: agentEmail,
    coverageType: coverageType,
    vehicleSpecs: vehicleSpecsText,
    score: evaluation.score,
    status: CONFIG.STATUS[evaluation.statusKey],
    missing: evaluation.missing,
    folderUrl: folder.getUrl(),
    folderId: folder.getId(),
    newlyPurchased: newlyPurchased,
    ncdLevel: ncdLevel,
    claimHistoryAnswer: claimHistoryAnswer,
    newDriver: newDriver
  };

  appendMotorTrackerRow_(record);

  if (evaluation.statusKey === 'INCOMPLETE') {
    notifyAgentMissingFields_(record);
  } else if (evaluation.statusKey === 'READY') {
    notifyUnderwritingReady_(record);
  }
}

function onPropertyFormSubmit_(e) {
  var fields = CONFIG.LINES.PROPERTY.FORM_FIELDS;
  var nv = (e && e.namedValues) || {};
  var get = function (key) {
    var val = nv[fields[key]];
    return val ? val[0] : '';
  };

  var agentName = get('PRODUCER_NAME');
  var agentEmail = get('AGENT_EMAIL');
  var occupancyType = get('OCCUPANCY_TYPE');
  var residentialContents = get('RESIDENTIAL_CONTENTS');
  var valueOfContents = get('VALUE_OF_CONTENTS');

  var aralCode = nextAralCode_('PROPERTY');
  // Client Name isn't on the form - it's set by an admin off the DP Licence upload (see admin_setClientName).
  var folder = createClientFolder_('PROPERTY', aralCode, '', occupancyType);

  var hasDpLicence = attachUploadToFolder_(get('DP_LICENCE_FILE'), folder, 'DP_LICENCE');
  attachUploadToFolder_(get('ID_FILE'), folder, 'ID');
  var hasProofOfAddress = attachUploadToFolder_(get('PROOF_OF_ADDRESS_FILE'), folder, 'PROOF_OF_ADDRESS');
  var hasPropertyImage = attachUploadToFolder_(get('PROPERTY_IMAGE_FILE'), folder, 'PROPERTY_IMAGE');
  var hasDirectorsIdDp = attachUploadToFolder_(get('DIRECTORS_ID_DP_FILE'), folder, 'DIRECTORS_ID_DP');
  var hasPropertyEvaluationReport = attachUploadToFolder_(get('PROPERTY_EVALUATION_REPORT_FILE'), folder, 'PROPERTY_EVALUATION_REPORT');

  var evaluation = evaluatePropertySubmission_({
    hasDpLicence: hasDpLicence,
    hasProofOfAddress: hasProofOfAddress,
    hasPropertyImage: hasPropertyImage,
    hasDirectorsIdDp: hasDirectorsIdDp,
    hasValueOfContents: !!valueOfContents,
    hasPropertyEvaluationReport: hasPropertyEvaluationReport,
    occupancyType: occupancyType,
    hasResidentialContents: !!residentialContents
  });

  moveFolderToStatus_('PROPERTY', folder, evaluation.statusKey);

  var record = {
    line: 'PROPERTY',
    aralCode: aralCode,
    clientName: '',
    agentName: agentName,
    agentEmail: agentEmail,
    occupancyType: occupancyType,
    score: evaluation.score,
    status: CONFIG.STATUS[evaluation.statusKey],
    missing: evaluation.missing,
    folderUrl: folder.getUrl(),
    folderId: folder.getId(),
    residentialContents: residentialContents
  };

  appendPropertyTrackerRow_(record);

  if (evaluation.statusKey === 'INCOMPLETE') {
    notifyAgentMissingFields_(record);
  } else if (evaluation.statusKey === 'READY') {
    notifyUnderwritingReady_(record);
  }
}

/** Re-runs the vetting engine over every tracker row, both lines. Handy after editing CONFIG or fixing a misconfigured Form. */
function reprocessAllRows() {
  Object.keys(CONFIG.LINES).forEach(function (lineKey) {
    getAllRecords_(lineKey).forEach(function (record) { reevaluateRecord_(record); });
  });
}

/**
 * Re-checks a tracker row's Drive folder contents and updates
 * score/status/folder placement accordingly. Used both by
 * reprocessAllRows() and after an agent re-uploads a document. Dispatches
 * on record.line, since Motor and Property have different checklists.
 */
function reevaluateRecord_(record) {
  if (!record.folderId) return record;
  var folder = safeGetFolder_(record.folderId);
  if (!folder) return record;

  var evaluation = record.line === 'MOTOR'
    ? evaluateMotorSubmission_({
      hasDpLicence: folderHasDoc_(folder, 'DP_LICENCE'),
      hasCertifiedCopy: folderHasDoc_(folder, 'CERTIFIED_COPY'),
      hasVehicleSpecsText: !!record.vehicleSpecs,
      hasProofOfAddress: folderHasDoc_(folder, 'PROOF_OF_ADDRESS'),
      hasValueOfVehicle: true, // not re-collected on re-upload; only documents can be re-uploaded
      ncdLevel: record.ncdLevel,
      newDriver: record.newDriver,
      hasNcdLetterFile: folderHasDoc_(folder, 'NCD_LETTER'),
      claimHistoryAnswer: record.claimHistoryAnswer,
      hasClaimHistoryLetterFile: folderHasDoc_(folder, 'CLAIM_HISTORY_LETTER'),
      coverageType: record.coverageType,
      hasCertOfRegistration: folderHasDoc_(folder, 'CERT_OF_REGISTRATION'),
      newlyPurchased: record.newlyPurchased
    })
    : evaluatePropertySubmission_({
      hasDpLicence: folderHasDoc_(folder, 'DP_LICENCE'),
      hasProofOfAddress: folderHasDoc_(folder, 'PROOF_OF_ADDRESS'),
      hasPropertyImage: folderHasDoc_(folder, 'PROPERTY_IMAGE'),
      hasDirectorsIdDp: folderHasDoc_(folder, 'DIRECTORS_ID_DP'),
      hasValueOfContents: true, // not re-collected on re-upload; only documents can be re-uploaded
      hasPropertyEvaluationReport: folderHasDoc_(folder, 'PROPERTY_EVALUATION_REPORT'),
      occupancyType: record.occupancyType,
      hasResidentialContents: !!record.residentialContents
    });

  moveFolderToStatus_(record.line, folder, evaluation.statusKey);

  updateRowFields_(record.line, record.rowNum, {
    SCORE: evaluation.score,
    STATUS: CONFIG.STATUS[evaluation.statusKey],
    MISSING_FIELDS: evaluation.missing.join('; ')
  });

  var updated = readRowAsRecord_(record.line, record.rowNum);
  if (evaluation.statusKey === 'INCOMPLETE') {
    notifyAgentMissingFields_(updated);
  } else if (evaluation.statusKey === 'READY') {
    notifyUnderwritingReady_(updated);
  }
  return updated;
}
