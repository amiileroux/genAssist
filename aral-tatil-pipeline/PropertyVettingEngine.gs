/**
 * House & Commercial Property insurance readiness scoring.
 *
 *  - Always required: DP Licence, Proof of Address.
 *  - Directors ID & DP: required only when Type of Occupancy is
 *    Commercial or Small Business (the form's own label: "For Commercial
 *    and Small Businesses ONLY").
 *  - Residential Contents: required only when Type of Occupancy is
 *    Residential (inferred - the question has no asterisk on the form,
 *    but only makes sense for a residential policy).
 *
 * NOT YET IMPLEMENTED: a Sum Insured / Building Value check. Section 3's
 * own subtitle promises "required sums insured for proper risk
 * assessment," but the screenshots reviewed when this was built showed
 * Submit immediately after "Contents for Residential," with no visible
 * value field for Commercial. Confirm with amii@enbfocus.com whether
 * there's a Sum Insured question elsewhere on the form (it may be
 * reachable only via Form branching not seen in those screenshots)
 * before treating this checklist as complete - see the open question in
 * README.md.
 */

function isBusinessOccupancy_(occupancyType) {
  var lower = String(occupancyType || '').toLowerCase();
  return CONFIG.LINES.PROPERTY.BUSINESS_OCCUPANCY_VALUES.some(function (v) { return lower.indexOf(v) !== -1; });
}

function isResidentialOccupancy_(occupancyType) {
  return String(occupancyType || '').toLowerCase().indexOf(CONFIG.LINES.PROPERTY.RESIDENTIAL_OCCUPANCY_VALUE) !== -1;
}

/**
 * @param {Object} record
 *   hasDpLicence, hasProofOfAddress, hasDirectorsIdDp {boolean}
 *   occupancyType {string} - "Type of Occupancy" answer
 *   hasResidentialContents {boolean} - "Contents for Residential" answered (non-empty)
 * @return {{score:number, statusKey:string, missing:string[]}}
 */
function evaluatePropertySubmission_(record) {
  var checks = [
    { required: true, ok: record.hasDpLicence, label: 'DP Licence not uploaded' },
    { required: true, ok: record.hasProofOfAddress, label: 'Proof of Address not uploaded' }
  ];

  var businessOccupancy = isBusinessOccupancy_(record.occupancyType);
  checks.push({ required: businessOccupancy, ok: record.hasDirectorsIdDp, label: "Directors ID & DP not uploaded (required for Commercial / Small Business)" });

  var residentialOccupancy = isResidentialOccupancy_(record.occupancyType);
  checks.push({ required: residentialOccupancy, ok: record.hasResidentialContents, label: 'Contents for Residential not provided' });

  return scoreChecklist_(checks);
}
