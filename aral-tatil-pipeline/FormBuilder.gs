/**
 * One-time Form generator: builds both the Motor and Property Google
 * Forms from scratch, matching CONFIG.LINES.MOTOR.FORM_FIELDS /
 * CONFIG.LINES.PROPERTY.FORM_FIELDS exactly, and auto-links each one's
 * responses into this Sheet (renaming the resulting response tab to
 * match CONFIG.LINES.<key>.RESPONSE_SHEET_NAME, so there's no manual
 * "rename the tab" step left to do).
 *
 * Run `createBothForms()` once from the function dropdown. Check View >
 * Logs afterward for each form's edit/live URL.
 *
 * Known gaps versus the hand-built forms this was reconstructed from:
 *  - No header/logo image. Google Forms' API has no endpoint for
 *    setting a form's theme/header image at all (only the Forms UI's
 *    "Customize theme" button can) - add the ARAL logo that way after
 *    the form is created.
 *  - The Property form's welcome-page copy and its Section 2 "why we
 *    need this" subtitle weren't available when this was written
 *    (placeholders below are reused from the Motor form) - edit
 *    PROPERTY_INTRO_TEXT and the Section 2 addSection_ call below once
 *    you have the real wording.
 *  - Minor cosmetic details (bold text, inline sample-document images
 *    shown as help) aren't reproducible via this API; everything that
 *    actually matters for scoring - exact question titles, options,
 *    required flags - is reproduced exactly.
 */

// ---- Generic item helpers ----

function addSection_(form, title, whyText) {
  var item = form.addPageBreakItem().setTitle(title);
  if (whyText) item.setHelpText('Why we need this: ' + whyText);
  return item;
}

function addShortAnswer_(form, title, opts) {
  opts = opts || {};
  var item = form.addTextItem().setTitle(title);
  if (opts.helpText) item.setHelpText(opts.helpText);
  item.setRequired(!!opts.required);
  return item;
}

function addMultipleChoice_(form, title, choices, opts) {
  opts = opts || {};
  var item = form.addMultipleChoiceItem().setTitle(title);
  item.setChoiceValues(choices);
  if (opts.other) item.showOtherOption(true);
  if (opts.helpText) item.setHelpText(opts.helpText);
  item.setRequired(!!opts.required);
  return item;
}

function addCheckboxes_(form, title, choices, opts) {
  opts = opts || {};
  var item = form.addCheckboxItem().setTitle(title);
  item.setChoiceValues(choices);
  if (opts.other) item.showOtherOption(true);
  if (opts.helpText) item.setHelpText(opts.helpText);
  item.setRequired(!!opts.required);
  return item;
}

function addFileUpload_(form, title, opts) {
  opts = opts || {};
  var item = form.addFileUploadItem().setTitle(title);
  if (opts.helpText) item.setHelpText(opts.helpText);
  item.setRequired(!!opts.required);
  item.setFileTypes(opts.fileTypes || [FormApp.FileType.PDF, FormApp.FileType.DOCUMENT, FormApp.FileType.IMAGE]);
  item.setMaxFiles(opts.maxFiles || 1);
  return item;
}

/** Links a freshly-created Form's responses into this Sheet, then renames the new response tab to match Config.gs. */
function linkFormAndRenameResponseSheet_(form, responseSheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var beforeIds = ss.getSheets().map(function (s) { return s.getSheetId(); });
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  var newSheet = ss.getSheets().filter(function (s) { return beforeIds.indexOf(s.getSheetId()) === -1; })[0];
  if (newSheet) newSheet.setName(responseSheetName);
  return newSheet;
}

function logFormResult_(label, form, responseSheet) {
  Logger.log(label + ' form created.');
  Logger.log('  Edit URL: ' + form.getEditUrl());
  Logger.log('  Live URL: ' + form.getPublishedUrl());
  Logger.log('  Response sheet: ' + (responseSheet ? responseSheet.getName() : '(not found - rename manually)'));
}

/** Run this once. Creates both Forms, links them to this Sheet, renames their response tabs. */
function createBothForms() {
  createMotorForm();
  createPropertyForm();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Both forms created and linked. Check View > Logs for their edit/live URLs.', 'Forms created', 10);
}

// ---- Motor ----

function createMotorForm() {
  var fields = CONFIG.LINES.MOTOR.FORM_FIELDS;
  var form = FormApp.create('ARAL Motor Insurance Lead Intake');
  form.setCollectEmail(true); // this is where AGENT_EMAIL ('Email Address') comes from

  form.setDescription(
    'Hey Aral Agent! 🚀 Before we dive in, please have the following documents.\n\n' +
    '🚗 DP (Driver\'s Permit)\n' +
    '🪪 ID (If you have it handy)\n' +
    '📄 Certified Copy (Don\'t have it? Vehicle stats work too!)\n' +
    '🏠 Proof of Address\n' +
    '📄 Claim history letter (as needed)\n' +
    '📄 NCD letter (as needed)\n\n' +
    'Ready? Let\'s go!'
  );

  addSection_(form, 'SECTION 1: Official / Intermediary Information',
    'Tracks which agent and branch originated the proposal so commissions are credited accurately and underwriting queries reach the right person quickly.');
  addShortAnswer_(form, fields.PRODUCER_NAME, { required: true, helpText: 'Eg. John Doe' });
  addMultipleChoice_(form, fields.BRANCH, [
    'Black Tree Investment ( Delano Rauseo)',
    'El Turo (Arturo Rauseo)',
    'A. Rauseo Associates Ltd Agency'
  ], { required: true, other: true });

  addSection_(form, "Section 1: Uploads of Client's Info",
    'Secures documents and legal declaration for the policy contract.');
  addFileUpload_(form, fields.DP_LICENCE_FILE, { required: true, maxFiles: 10 });
  addFileUpload_(form, fields.ID_FILE, { maxFiles: 5 });
  addFileUpload_(form, fields.CERT_OF_REGISTRATION_FILE, {
    helpText: 'Note* this is only for persons who selected Corporate Comprehensive.', maxFiles: 1
  });
  addFileUpload_(form, fields.VEHICLE_INVOICE_FILE, { maxFiles: 1 });
  addFileUpload_(form, fields.CERTIFIED_COPY_FILE, {
    helpText: "If certified copy can't be provided, please answer section three.", maxFiles: 1
  });
  addFileUpload_(form, fields.PROOF_OF_ADDRESS_FILE, {
    helpText: 'With letter of authorization if needed, from landlord.', maxFiles: 5
  });

  addSection_(form, 'SECTION 2: Proposer / Client Personal Details Section',
    "Establishes the policyholder's legal identity, confirms official contact channels, and provides key risk parameters like age and occupation.");
  addMultipleChoice_(form, fields.VEHICLE_KEPT_LOCATION, [
    'Same address on DP, locked garage',
    'Same address on DP,  open garage',
    'Same address on DP,  roadside',
    'Same address on DP, semi-open garage'
  ], {
    required: true, other: true,
    helpText: 'Example: (Kept in locked garage, Open garage ect.) *Note* Your claim may be voided if the vehicle is not kept at this selected location.'
  });
  addShortAnswer_(form, fields.CLIENT_CONTACT_INFO, { required: true, helpText: 'Example: nisha@gmail.com | 396-8585' });
  addShortAnswer_(form, fields.CLIENT_OCCUPATION, { required: true, helpText: 'Example: Estate Corporal, WASA (662-1000)' });
  addMultipleChoice_(form, fields.MARITAL_STATUS, ['Married', 'Single', 'Widowed', 'Divorced'], {});

  addSection_(form, 'Section 3: Coverage & Vehicle Info',
    'Identifies the insured asset, policy term, and coverage level.');
  addMultipleChoice_(form, fields.NEWLY_PURCHASED, ['Yes', 'No, already owned'], { required: true });
  addMultipleChoice_(form, fields.HAS_NCD_LETTER_Q, [
    'Yes, will be provided',
    'No, first-Time Buyer / New Driver',
    'No, recent At-Fault Claim',
    'No, named Driver on Another Policy',
    'No, gap in Insurance Coverage',
    'No, company Car Driver'
  ], { required: true });
  addShortAnswer_(form, 'If no NCD letter, how long have you had the vehicle?', { helpText: 'Please state' });
  addMultipleChoice_(form, "Have you switch Insurer's since purchasing the vehicle?", ['No'], {
    other: true, helpText: "If 'yes', please state in 'other'."
  });
  addFileUpload_(form, fields.NCD_LETTER_FILE, {
    helpText: 'To get our best rate, please upload your NCD Letter. Important: This document is mandatory before we can proceed with your new policy.',
    maxFiles: 1
  });
  addMultipleChoice_(form, fields.NCD_LEVEL, ['First Year', 'Second Year', 'Third Year', 'Fourth Year (max)', 'NONE'], { required: true });
  addMultipleChoice_(form, fields.COVERAGE_TYPE, [
    'Comprehensive - Insures all parties and perils',
    'Third-Party - Covers third party damages, excluding own vehicle',
    "Own Goods - Insures 'commercial' vehicles transporting your own goods",
    'Corporate Comprehensive - Full comprehensive coverage for company owned vehicles'
  ], { required: true });
  addShortAnswer_(form, 'Is vehicle mortgaged/financed?', { helpText: "If 'Yes' by who? Example: No | OR Yes (RBC, Independence Square)" });
  addShortAnswer_(form, fields.VALUE_OF_VEHICLE, { required: true, helpText: 'Required for all coverage types, to produce a quote.' });
  addShortAnswer_(form, fields.VEHICLE_SPECS, { helpText: 'Example: PEB 4731 | Nissan Note | 2018 | 1190 CC | if NONE State' });
  addShortAnswer_(form, 'Engine & Chassis Numbers', { helpText: 'Example: HR12-182448J | E12587623 | If NONE State' });

  addSection_(form, 'Section 4: Driver & Claims History',
    'Determines risk tier, discount (NCD) eligibility, and driver restrictions.');
  addMultipleChoice_(form, 'Do you have an Additional driver?', ['Yes', 'No'], {
    required: true, helpText: '*Note* this can be changed, but the premium may vary.'
  });
  addFileUpload_(form, "Additional Driver's DP", { maxFiles: 5 });
  addShortAnswer_(form, 'Occupation of Additional Driver', { required: true });

  addSection_(form, 'Section 5: Extensions & Commercial Check',
    'Adds optional coverage and routes commercial vehicles to extra questions.');
  addCheckboxes_(form, 'Policy Extensions (Comprehensive ONLY)', [
    'Personal accident ("P" Vehicles ONLY).',
    'loss of use (Comprehensive ONLY)',
    'Waiver Of Excess  (Comprehensive ONLY)',
    'Comprehensive windscreen ($5,000) minimum',
    '(Windscreen limited) State below'
  ], { other: true, helpText: 'Windscreen ($5,000 standard) for COMPREHENSIVE ONLY | (Flood/Earthquake) | Personal Accident | None' });
  addCheckboxes_(form, 'Policy Extensions (Third Party ONLY)', [
    'Personal accident ( "P" Vehicles ONLY)',
    'Windscreen Coverage ($3,000) minimum',
    'Windscreen State below Max ($7,000)'
  ], { other: true });
  addMultipleChoice_(form, fields.CLAIM_HISTORY_Q, ['Yes', 'No'], { required: true, helpText: "If 'yes' its mandatory to provide a quote." });
  addFileUpload_(form, fields.CLAIM_HISTORY_LETTER_FILE, { maxFiles: 1 });
  addShortAnswer_(form, 'If "YES" state the Pay-out, Date and History Letter is needed.', { helpText: 'If "None" State' });
  addMultipleChoice_(form, fields.COMMERCIAL_USE_Q, ['Yes', 'No'], { required: true });

  var responseSheet = linkFormAndRenameResponseSheet_(form, CONFIG.LINES.MOTOR.RESPONSE_SHEET_NAME);
  logFormResult_('Motor', form, responseSheet);
  return form;
}

// ---- Property ----

function createPropertyForm() {
  var fields = CONFIG.LINES.PROPERTY.FORM_FIELDS;
  var form = FormApp.create('ARAL House & Commercial Property Insurance Lead Intake');
  form.setCollectEmail(true); // this is where AGENT_EMAIL ('Email Address') comes from

  // Placeholder - the real intro copy for this form wasn't available when this was written; replace with your actual wording.
  form.setDescription(
    'Hey Aral Agent! 🚀 Before we dive in, please have the following documents ready.\n\nReady? Let\'s go!'
  );

  addSection_(form, 'SECTION 1: Official / Intermediary Information',
    'Tracks which agent and branch originated the proposal so commissions are credited accurately and underwriting queries reach the right person quickly.');
  addShortAnswer_(form, fields.PRODUCER_NAME, { required: true, helpText: 'Eg. John Doe' });
  addMultipleChoice_(form, fields.BRANCH, [
    'Black Tree Investments ( Delano Rauseo)',
    'El Turo (Arturo Rauseo)',
    'A. Rauseo Associates Ltd Agency'
  ], { required: true, other: true });

  // Placeholder subtitle - the original wasn't visible on screen when this was written; reused from the Motor form's equivalent section.
  addSection_(form, "Section 2: Uploads of Client's Info",
    'Secures documents and legal declaration for the policy contract.');
  addFileUpload_(form, fields.DP_LICENCE_FILE, { required: true, maxFiles: 5 });
  addFileUpload_(form, fields.ID_FILE, { maxFiles: 5 });
  addFileUpload_(form, fields.PROOF_OF_ADDRESS_FILE, { required: true, helpText: 'For location being insured', maxFiles: 5 });
  addFileUpload_(form, fields.PROPERTY_IMAGE_FILE, { required: true, helpText: 'An actual photo of the property being insured.', maxFiles: 1 });
  addFileUpload_(form, fields.DIRECTORS_ID_DP_FILE, { helpText: 'For Commercial and Small Businesses ONLY', maxFiles: 10 });

  addSection_(form, 'Section 3: Coverage Options & Insured Values',
    'Defines scope of coverage and required sums insured for proper risk assessment.');
  addMultipleChoice_(form, fields.OCCUPANCY_TYPE, ['Residential', 'Commercial', 'Small Business', 'Contents ONLY'], {
    required: true, other: true
  });
  addShortAnswer_(form, fields.RESIDENTIAL_CONTENTS, { helpText: "Please list the contents that is being insured. If 'NONE' state." });
  addShortAnswer_(form, fields.VALUE_OF_CONTENTS, {
    required: true,
    helpText: 'Sum insured for contents - required even if only contents (not the building) are being insured, e.g. for a renter.'
  });
  addFileUpload_(form, fields.PROPERTY_EVALUATION_REPORT_FILE, { maxFiles: 1 });

  var responseSheet = linkFormAndRenameResponseSheet_(form, CONFIG.LINES.PROPERTY.RESPONSE_SHEET_NAME);
  logFormResult_('Property', form, responseSheet);
  return form;
}
