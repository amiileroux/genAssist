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
  // the onFormSubmit event's namedValues map.
  FORM_FIELDS: {
    CLIENT_NAME: 'Client Full Name',
    AGENT_NAME: 'Agent Name',
    AGENT_EMAIL: 'Agent Email',
    POLICY_TYPE: 'Policy Type',
    VEHICLE_REG: 'Vehicle Registration Number',
    DRIVERS_PERMIT_FILE: "Upload: Driver's Permit",
    DRIVERS_PERMIT_EXPIRY: "Driver's Permit Expiry Date",
    VEHICLE_CERT_FILE: 'Upload: Vehicle Certified Copy',
    VALUATION_FILE: 'Upload: Vehicle Valuation (Comprehensive only)',
    UTILITY_BILL_FILE: 'Upload: Proof of Address / Utility Bill',
    UTILITY_BILL_DATE: 'Utility Bill Date'
  },

  // Substrings (case-insensitive) that mark a "Policy Type" answer as
  // Comprehensive, which is what makes the valuation document mandatory.
  COMPREHENSIVE_VALUES: ['comprehensive'],

  UTILITY_BILL_MAX_AGE_DAYS: 90,

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
