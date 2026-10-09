/**
 * Motor insurance readiness scoring.
 *
 * Each of the four checks is worth 25%. Vehicle valuation is only
 * required (and only scored) when the policy is Comprehensive, so a
 * Third Party submission can still reach 100% without one.
 */

function isComprehensive_(policyType) {
  if (!policyType) return false;
  var lower = String(policyType).toLowerCase();
  return CONFIG.COMPREHENSIVE_VALUES.some(function (v) { return lower.indexOf(v) !== -1; });
}

function daysBetween_(earlier, later) {
  var MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

/**
 * @param {Object} record
 *   policyType {string}, hasPermit {boolean}, permitExpiry {Date|null},
 *   hasVehicleCert {boolean}, hasValuation {boolean},
 *   hasUtilityBill {boolean}, utilityBillDate {Date|null}
 * @return {{score:number, statusKey:string, missing:string[]}}
 */
function evaluateSubmission_(record) {
  var missing = [];
  var score = 0;
  var now = new Date();

  var permitValid = record.hasPermit && record.permitExpiry instanceof Date &&
    record.permitExpiry.getTime() >= now.getTime();
  if (permitValid) {
    score += 25;
  } else {
    missing.push(record.hasPermit ? "Driver's Permit has expired" : "Driver's Permit not uploaded");
  }

  if (record.hasVehicleCert) {
    score += 25;
  } else {
    missing.push('Vehicle Certified Copy not uploaded');
  }

  var valuationRequired = isComprehensive_(record.policyType);
  if (!valuationRequired) {
    score += 25; // Not applicable for Third Party, so it can't dock the score.
  } else if (record.hasValuation) {
    score += 25;
  } else {
    missing.push('Vehicle Valuation not uploaded (required for Comprehensive)');
  }

  var utilityBillRecent = record.hasUtilityBill && record.utilityBillDate instanceof Date &&
    daysBetween_(record.utilityBillDate, now) <= CONFIG.UTILITY_BILL_MAX_AGE_DAYS;
  if (utilityBillRecent) {
    score += 25;
  } else {
    missing.push(record.hasUtilityBill ? 'Utility Bill is older than 90 days' : 'Proof of Address / Utility Bill not uploaded');
  }

  var statusKey;
  if (score === 100) {
    statusKey = 'READY';
  } else if (valuationRequired && missing.length === 1 && missing[0].indexOf('Valuation') !== -1) {
    // The only gap is extra underwriting info (valuation) - KYC itself is complete.
    statusKey = 'SUPPLEMENTAL';
  } else {
    statusKey = 'INCOMPLETE';
  }

  return { score: score, statusKey: statusKey, missing: missing };
}
