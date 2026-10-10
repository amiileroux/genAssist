/**
 * House & Commercial Property insurance readiness scoring.
 *
 *  - Always required: DP Licence, Proof of Address, Property Image
 *    (an actual photo of the property being insured - distinct from the
 *    utility bill used as Proof of Address), Value of Contents (a sum
 *    insured figure, needed to produce a quote regardless of occupancy -
 *    same reasoning as Value of Vehicle on the Motor line).
 *  - Directors ID & DP: required only when Type of Occupancy is
 *    Commercial or Small Business (the form's own label: "For Commercial
 *    and Small Businesses ONLY").
 *  - Residential Contents (the list, not the value): required only when
 *    Type of Occupancy is Residential (inferred - the question has no
 *    asterisk on the form, but only makes sense for a residential policy).
 *  - Property Evaluation Report: required unless Type of Occupancy is
 *    "Contents ONLY" - a contents-only policy doesn't insure the
 *    building itself, so there's nothing to evaluate.
 *
 * NOTE: these three fields (Value of Contents, Property Evaluation
 * Report, Property Image) need to be added to the live Form with these
 * exact titles - see CONFIG.LINES.PROPERTY.FORM_FIELDS in Config.gs and
 * the Setup section of README.md.
 */

function isBusinessOccupancy_(occupancyType) {
  var lower = String(occupancyType || '').toLowerCase();
  return CONFIG.LINES.PROPERTY.BUSINESS_OCCUPANCY_VALUES.some(function (v) { return lower.indexOf(v) !== -1; });
}

function isResidentialOccupancy_(occupancyType) {
  return String(occupancyType || '').toLowerCase().indexOf(CONFIG.LINES.PROPERTY.RESIDENTIAL_OCCUPANCY_VALUE) !== -1;
}

function isContentsOnlyOccupancy_(occupancyType) {
  return String(occupancyType || '').toLowerCase().indexOf(CONFIG.LINES.PROPERTY.CONTENTS_ONLY_OCCUPANCY_VALUE) !== -1;
}

/**
 * @param {Object} record
 *   hasDpLicence, hasProofOfAddress, hasPropertyImage, hasDirectorsIdDp,
 *   hasValueOfContents, hasPropertyEvaluationReport {boolean}
 *   occupancyType {string} - "Type of Occupancy" answer
 *   hasResidentialContents {boolean} - "Contents for Residential" answered (non-empty)
 * @return {{score:number, statusKey:string, missing:string[]}}
 */
function evaluatePropertySubmission_(record) {
  var checks = [
    { required: true, ok: record.hasDpLicence, label: 'DP Licence not uploaded' },
    { required: true, ok: record.hasProofOfAddress, label: 'Proof of Address not uploaded' },
    { required: true, ok: record.hasPropertyImage, label: 'Property Image not uploaded' },
    { required: true, ok: record.hasValueOfContents, label: 'Value of Contents not provided' }
  ];

  var businessOccupancy = isBusinessOccupancy_(record.occupancyType);
  checks.push({ required: businessOccupancy, ok: record.hasDirectorsIdDp, label: "Directors ID & DP not uploaded (required for Commercial / Small Business)" });

  var residentialOccupancy = isResidentialOccupancy_(record.occupancyType);
  checks.push({ required: residentialOccupancy, ok: record.hasResidentialContents, label: 'Contents for Residential not provided' });

  var buildingInsured = !isContentsOnlyOccupancy_(record.occupancyType);
  checks.push({ required: buildingInsured, ok: record.hasPropertyEvaluationReport, label: 'Property Evaluation Report not uploaded' });

  return scoreChecklist_(checks);
}
