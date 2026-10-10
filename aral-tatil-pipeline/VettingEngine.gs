/**
 * Motor insurance readiness scoring.
 *
 * Unlike a fixed checklist, which documents are actually required varies
 * per submission:
 *  - Always required: DP Licence, (Certified Copy OR Vehicle Specs as a
 *    fallback - a client can get a quote before buying, using dealership
 *    specs, so at least one of the two is always needed), Proof of
 *    Address, Value of Vehicle.
 *  - Certified Copy specifically (not just the Vehicle Specs fallback):
 *    required once the vehicle is already purchased - i.e. "Is this
 *    vehicle newly purchased?" = No, meaning they've had it a while and
 *    should have the actual document, not just dealership specs.
 *  - NCD Letter: required unless the client has no NCD to prove (NCD
 *    level is "NONE") or is a first-time/new driver (no history exists).
 *  - Claim History Letter: required only if the client has a claim
 *    history, except waived entirely for a first-time/new driver.
 *  - Certificate of Registration: required only when Coverage Type is
 *    Corporate Comprehensive - that document is proof of the *business's*
 *    registration, needed because the policy is written out to the
 *    company rather than the individual driving the vehicle.
 */

function isNewDriver_(hasNcdLetterAnswer) {
  if (!hasNcdLetterAnswer) return false;
  var lower = String(hasNcdLetterAnswer).toLowerCase();
  return CONFIG.LINES.MOTOR.NEW_DRIVER_MARKERS.some(function (marker) { return lower.indexOf(marker) !== -1; });
}

function isCorporateCoverage_(coverageType) {
  return String(coverageType || '').toLowerCase().indexOf('corporate') !== -1;
}

/**
 * "Is this vehicle newly purchased?" = No means they've had it a while,
 * i.e. it's already purchased/owned. Matches "No" or any answer starting
 * with "No" (e.g. "No, already owned") so relabeling that option on the
 * live Form doesn't silently break this check.
 */
function isAlreadyPurchased_(newlyPurchasedAnswer) {
  return /^no\b/i.test(String(newlyPurchasedAnswer || '').trim());
}

/**
 * @param {Object} record
 *   hasDpLicence, hasCertifiedCopy, hasVehicleSpecsText, hasProofOfAddress,
 *   hasValueOfVehicle {boolean}
 *   ncdLevel {string} - "How much is your client's NCD" answer
 *   newDriver {boolean} - derived once (via isNewDriver_) from "Do you have
 *     an NCD Letter?" at submission time, then persisted on the tracker
 *     row and passed back in on every re-evaluation, since the original
 *     form answer isn't re-askable at re-upload time.
 *   hasNcdLetterFile {boolean}
 *   claimHistoryAnswer {string} - "Do you have a Claim History" answer ("Yes"/"No")
 *   hasClaimHistoryLetterFile {boolean}
 *   coverageType {string} - "Coverage Type" answer
 *   hasCertOfRegistration {boolean}
 *   newlyPurchased {string} - "Is this vehicle newly purchased?" answer ("Yes"/"No")
 * @return {{score:number, statusKey:string, missing:string[]}}
 */
function evaluateMotorSubmission_(record) {
  var newDriver = !!record.newDriver;
  var alreadyPurchased = isAlreadyPurchased_(record.newlyPurchased);

  var checks = [
    { required: true, ok: record.hasDpLicence, label: 'DP Licence not uploaded' },
    { required: true, ok: record.hasCertifiedCopy || record.hasVehicleSpecsText, label: 'Certified Copy not uploaded (and no Vehicle Specs given as a fallback)' },
    { required: true, ok: record.hasProofOfAddress, label: 'Proof of Address not uploaded' },
    { required: true, ok: record.hasValueOfVehicle, label: 'Value of Vehicle not provided' },
    { required: alreadyPurchased, ok: record.hasCertifiedCopy, label: 'Certified Copy not uploaded (required once the vehicle is already purchased - dealership specs are no longer enough)' }
  ];

  var ncdRequired = !newDriver && String(record.ncdLevel || '').toUpperCase() !== CONFIG.LINES.MOTOR.NCD_NONE_VALUE;
  checks.push({ required: ncdRequired, ok: record.hasNcdLetterFile, label: 'NCD Letter not uploaded' });

  var claimHistoryRequired = !newDriver && String(record.claimHistoryAnswer || '').toLowerCase() === 'yes';
  checks.push({ required: claimHistoryRequired, ok: record.hasClaimHistoryLetterFile, label: 'Claim History Letter not uploaded' });

  var certOfRegistrationRequired = isCorporateCoverage_(record.coverageType);
  checks.push({ required: certOfRegistrationRequired, ok: record.hasCertOfRegistration, label: 'Certificate of Registration (business) not uploaded' });

  return scoreChecklist_(checks);
}
