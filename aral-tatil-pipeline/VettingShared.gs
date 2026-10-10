/**
 * Shared scoring helper used by both VettingEngine.gs (Motor) and
 * PropertyVettingEngine.gs. A "check" is {required, ok, label}; only
 * required checks count toward the score, and every required-but-unmet
 * check's label is surfaced as a missing item.
 */
function scoreChecklist_(checks) {
  var missing = [];
  var required = 0;
  var satisfied = 0;

  checks.forEach(function (check) {
    if (!check.required) return;
    required++;
    if (check.ok) {
      satisfied++;
    } else {
      missing.push(check.label);
    }
  });

  var score = required === 0 ? 100 : Math.round((satisfied / required) * 100);
  var statusKey = score === 100 ? 'READY' : 'INCOMPLETE';

  return { score: score, statusKey: statusKey, missing: missing };
}
