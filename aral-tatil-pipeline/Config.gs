/**
 * Central configuration for the ARAL -> TATIL lead vetting pipeline.
 *
 * Edit FORM_FIELDS below so the strings match the exact question titles
 * on the Google Form that feeds the bound Sheet (see README.md for the
 * full field reference). Everything else in the script reads from here,
 * so this is the only file you should need to touch to adapt wording.
 */

var CONFIG = {
  DRIVE: {
    ROOT_FOLDER_NAME: 'ARAL_Insurance_Pipeline',
    SUBFOLDERS: {
      INCOMPLETE: '01_Incomplete_Flagged',
      SUPPLEMENTAL: '02_Needs_Supplemental_Info',
      READY: '03_Ready_For_Underwriting',
      COMPLETED: '04_Completed_Policies'
    }
  },

  SHEET: {
    TRACKER_NAME: 'Pipeline_Tracker'
  },

  STATUS: {
    INCOMPLETE: 'Incomplete / Flagged',
    SUPPLEMENTAL: 'Needs Supplemental Info',
    READY: 'Ready for Underwriting',
    COMPLETED: 'Policy Issued'
  },

  // 24-hour clock, in the script's time zone (see appsscript.json).
  CUTOFF_HOUR: 11,

  // Exact Google Form question titles this script expects to find in
  // the onFormSubmit event's namedValues map. These match the live
  // "ARAL Motor Insurance Lead Intake" form.
  FORM_FIELDS: {
    // Section 1: Official / Intermediary Information
    PRODUCER_NAME: 'Producer Name',
    BRANCH: 'Branch',

    // Section 1: Uploads of Client's Info
    DP_LICENCE_FILE: 'Upload DP Licence',
    ID_FILE: 'Upload ID',
    CERT_OF_REGISTRATION_FILE: 'Certificate of Registration',
    VEHICLE_INVOICE_FILE: 'Upload Vehicle Invoice',
    CERTIFIED_COPY_FILE: 'Upload Certified Copy',
    PROOF_OF_ADDRESS_FILE: 'Proof Of Address',

    // Section 2: Proposer / Client Personal Details
    VEHICLE_KEPT_LOCATION: 'Where is the Vehicle being Kept?',
    CLIENT_CONTACT_INFO: "Client's contact Info (Email & Phone)",
    CLIENT_OCCUPATION: "Client's occupation & Employer",
    MARITAL_STATUS: "Client's marital Status",

    // Section 3: Coverage & Vehicle Info
    NEWLY_PURCHASED: 'Is this vehicle newly purchased?',
    HAS_NCD_LETTER_Q: 'Do you have an NCD Letter?',
    NCD_LETTER_FILE: 'NCD Letter',
    NCD_LEVEL: "How much is your client's NCD (No Claim Discount)",
    COVERAGE_TYPE: 'Coverage Type',
    VALUE_OF_VEHICLE: 'Value Of vehicle',
    VEHICLE_SPECS: 'Vehicle Specs (Reg #, Make/Model, Year, CC)',

    // Section 5: Extensions & Commercial Check
    CLAIM_HISTORY_Q: 'Do you have a Claim History',
    CLAIM_HISTORY_LETTER_FILE: 'Claim History Letter',
    COMMERCIAL_USE_Q: 'Is this vehicle used for Commercial Purposes?',

    // Built-in field Google Forms adds automatically when "Collect email
    // addresses" is turned on — this is the submitting agent's email.
    AGENT_EMAIL: 'Email Address'
  },

  // "How much is your client's NCD" answer that means no discount/history
  // exists at all, so no NCD Letter is expected.
  NCD_NONE_VALUE: 'NONE',

  // Substrings (case-insensitive) in the "Do you have an NCD Letter?"
  // answer that mean the client is a first-time/new driver, who by
  // definition has no NCD or claims history yet - exempts both letters.
  NEW_DRIVER_MARKERS: ['first-time', 'new driver'],

  PROPERTY_KEYS: {
    ROOT_FOLDER_ID: 'ROOT_FOLDER_ID',
    SUBFOLDER_ID_PREFIX: 'SUBFOLDER_ID_',
    ARAL_SEQUENCE: 'ARAL_SEQUENCE',
    ADMIN_EMAILS: 'ADMIN_EMAILS',
    UNDERWRITING_EMAIL: 'UNDERWRITING_EMAIL'
  }
};

function getScriptProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setScriptProperty_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

/** Script Property ADMIN_EMAILS: comma-separated list, set via Project Settings > Script properties. */
function getAdminEmails_() {
  var raw = getScriptProperty_(CONFIG.PROPERTY_KEYS.ADMIN_EMAILS) || '';
  return raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

/** Script Property UNDERWRITING_EMAIL: where "ready for underwriting" alerts go. */
function getUnderwritingEmail_() {
  return getScriptProperty_(CONFIG.PROPERTY_KEYS.UNDERWRITING_EMAIL) || '';
}
