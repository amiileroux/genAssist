/**
 * Central configuration for the ARAL -> TATIL lead vetting pipeline.
 *
 * This app runs two independent lines of business out of one Apps
 * Script project: Motor and Property (House/Commercial). Each Google
 * Form feeds its own tab of this bound Sheet; CONFIG.LINES.<key> holds
 * everything specific to one line (its exact form question titles, its
 * own tracker sheet, its own Drive subfolder tree, its own ARAL code
 * prefix). Shared code (DriveManager.gs, SheetManager.gs, Code.gs,
 * AdminController.gs, AgentController.gs) takes a `line` key ('MOTOR'
 * or 'PROPERTY') and looks up the right config from here - that's the
 * only thing that should need touching to adapt wording or add a line.
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

  STATUS: {
    INCOMPLETE: 'Incomplete / Flagged',
    SUPPLEMENTAL: 'Needs Supplemental Info',
    READY: 'Ready for Underwriting',
    COMPLETED: 'Policy Issued'
  },

  // 24-hour clock, in the script's time zone (see appsscript.json).
  CUTOFF_HOUR: 11,

  // Fixed TATIL payment portal link, sent to the client once ARAL
  // approves their signed application.
  TATIL_PAYMENT_URL: 'https://tatil.co.tt/tatil-payments-landing/',

  // Post-approval client workflow stages, tracked in each line's
  // tracker sheet (POLICY_STAGE column) independently of the KYC-vetting
  // STATUS/score above. See ClientWorkflow.gs.
  POLICY_STAGE: {
    NONE: '',
    FORMS_SENT: 'Forms Sent - Awaiting Signature',
    SIGNED_PENDING_APPROVAL: 'Signed - Pending ARAL Approval',
    APPROVED_PENDING_PAYMENT: 'Approved - Payment Link Sent',
    PAYMENT_PENDING_CONFIRMATION: 'Payment Submitted - Pending Confirmation',
    POLICY_CONFIRMED: 'Policy Confirmed - Client Covered'
  },

  LINES: {
    MOTOR: {
      LABEL: 'Motor',
      ARAL_PREFIX: 'ARAL-MOT',
      // The tab name Google Forms writes raw responses to for the Motor
      // Form - confirm this in the Sheet after linking the Form (Forms
      // auto-names it "Form Responses N"; rename the tab to match this
      // if you want a clearer name, or update this to match).
      RESPONSE_SHEET_NAME: 'Motor Form Responses',
      TRACKER_SHEET_NAME: 'Motor_Pipeline_Tracker',
      DRIVE_SUBFOLDER_NAME: 'Motor',
      SEQUENCE_PROPERTY_KEY: 'ARAL_SEQUENCE_MOTOR',
      // Script Property holding the Google Doc ID of the Motor
      // application template - set this via Project Settings > Script
      // properties once you've created the template (see README.md).
      TEMPLATE_DOC_PROPERTY_KEY: 'APPLICATION_TEMPLATE_DOC_ID_MOTOR',

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
        CLIENT_EMAIL: 'Client Email',
        CLIENT_PHONE: 'Client Phone',
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

        // Built-in field Google Forms adds automatically when "Collect
        // email addresses" is turned on - the submitting agent's email.
        AGENT_EMAIL: 'Email Address'
      },

      // "How much is your client's NCD" answer that means no discount/
      // history exists at all, so no NCD Letter is expected.
      NCD_NONE_VALUE: 'NONE',

      // Substrings (case-insensitive) in the "Do you have an NCD Letter?"
      // answer that mean the client is a first-time/new driver, who by
      // definition has no NCD or claims history yet - exempts both letters.
      NEW_DRIVER_MARKERS: ['first-time', 'new driver']
    },

    PROPERTY: {
      LABEL: 'Property (House / Commercial)',
      ARAL_PREFIX: 'ARAL-PROP',
      // Confirm this against the actual tab name once the Property Form
      // is linked to this Sheet (see MOTOR.RESPONSE_SHEET_NAME above).
      RESPONSE_SHEET_NAME: 'Property Form Responses',
      TRACKER_SHEET_NAME: 'Property_Pipeline_Tracker',
      DRIVE_SUBFOLDER_NAME: 'Property',
      SEQUENCE_PROPERTY_KEY: 'ARAL_SEQUENCE_PROPERTY',
      // Script Property holding the Google Doc ID of the Property
      // application template - set this via Project Settings > Script
      // properties once you've created the template (see README.md).
      TEMPLATE_DOC_PROPERTY_KEY: 'APPLICATION_TEMPLATE_DOC_ID_PROPERTY',

      // Exact Google Form question titles on the live "ARAL House &
      // Commercial Property Insurance Lead Intake" form.
      FORM_FIELDS: {
        // Section 1: Official / Intermediary Information
        PRODUCER_NAME: 'Producer Name',
        BRANCH: 'Branch',
        CLIENT_EMAIL: 'Client Email',
        CLIENT_PHONE: 'Client Phone',

        // Section 2: Uploads of Client's Info
        DP_LICENCE_FILE: 'Upload DP Licence',
        ID_FILE: 'Upload ID',
        PROOF_OF_ADDRESS_FILE: 'Upload Proof Of Address',
        PROPERTY_IMAGE_FILE: 'Upload Property Image',
        DIRECTORS_ID_DP_FILE: 'Upload Directors ID & DP',

        // Section 3: Coverage Options & Insured Values
        OCCUPANCY_TYPE: 'Type of Occupancy',
        RESIDENTIAL_CONTENTS: 'Contents for Residential',
        VALUE_OF_CONTENTS: 'Value of Contents',
        PROPERTY_EVALUATION_REPORT_FILE: 'Upload Property Evaluation Report',

        // Built-in field Google Forms adds automatically when "Collect
        // email addresses" is turned on - the submitting agent's email.
        AGENT_EMAIL: 'Email Address'
      },

      // "Type of Occupancy" answers that mean Directors ID & DP is
      // required (the form's own label: "For Commercial and Small
      // Businesses ONLY").
      BUSINESS_OCCUPANCY_VALUES: ['commercial', 'small business'],

      // "Type of Occupancy" answer that means there's no building being
      // insured (contents coverage only), so a Property Evaluation
      // Report doesn't apply.
      CONTENTS_ONLY_OCCUPANCY_VALUE: 'contents only',

      // "Type of Occupancy" answer that means the Contents question applies.
      RESIDENTIAL_OCCUPANCY_VALUE: 'residential'
    }
  },

  PROPERTY_KEYS: {
    ROOT_FOLDER_ID: 'ROOT_FOLDER_ID',
    SUBFOLDER_ID_PREFIX: 'SUBFOLDER_ID_',
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

/** @return {Object} CONFIG.LINES[lineKey], throwing a clear error if lineKey is unknown. */
function getLineConfig_(lineKey) {
  var line = CONFIG.LINES[lineKey];
  if (!line) throw new Error('Unknown line of business: ' + lineKey);
  return line;
}
