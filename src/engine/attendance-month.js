/**
 * attendance-month.js — רדוסר חודשי: השלמת חיסורים (pure function, ללא DOM)
 * Input: days[] (מועשרים עם categorizeDay output) + params (attendanceParams)
 * Output: { totalShortfall, totalZero, totalOT, totalUnapproved,
 *            coveredFromZero, coveredFromOT, coveredFromUnapproved,
 *            salaryCutHours, zeroUtilizationPct }
 * Deps: none
 *
 * אלגוריתם (WORK_PLAN §C): אוסף מאגרי אפס/ש"נ/ללא-אישור חודשיים;
 * מכסה חיסורים בסדר: שעות אפס → ש"נ → ללא-אישור → ירידת שכר.
 * חיסור מוכשר: isHalfDay=true (≥ חצי יום נוכחות).
 * חיסור ישיר: < חצי יום — עובר לירידת שכר ללא מאגרים (WORK_PLAN §C).
 * שישי (fridayAllOvertime): לא יוצר חיסור רגיל.
 */

/**
 * @param {object[]} days — ימי חודש מועשרים (presenceInQuota, isFullDay, isHalfDay,
 *                          zeroHours, overtimeHours, unapprovedHours, leave?, date?)
 * @param {{ fullDayHours:number, halfDayHours:number, fridayAllOvertime:boolean }} params
 * @returns {{ totalShortfall, totalZero, totalOT, totalUnapproved,
 *             coveredFromZero, coveredFromOT, coveredFromUnapproved,
 *             salaryCutHours, zeroUtilizationPct }}
 */
export function calcMonthlyShortfall(days, params) {
  const { fullDayHours, halfDayHours, fridayAllOvertime } = params;

  let totalZero          = 0;
  let totalOT            = 0;
  let totalUnapproved    = 0;
  let eligibleShortfall  = 0; // ≥ חצי יום — יכול להשתמש במאגרים
  let directShortfall    = 0; // < חצי יום — ישיר לירידת שכר

  for (const d of days) {
    totalZero       += d.zeroHours       ?? 0;
    totalOT         += d.overtimeHours   ?? 0;
    totalUnapproved += d.unapprovedHours ?? 0;

    // שישי — לא יוצר חיסור רגיל (כל הנוכחות ש"נ)
    const isFriday = d.date
      ? new Date(d.date + 'T12:00:00Z').getDay() === 5
      : false;
    if (isFriday && fridayAllOvertime) continue;

    // חופשה/מחלה/השתלמות (WP8.3) — מכסים יום מלא; לא יוצרים חיסור
    if (d.leave) continue;

    // presenceInQuota: מ-categorizeDay; fallback ל-regularPaid (מצב ידני)
    const presence = d.presenceInQuota ?? null;
    if (presence == null || presence <= 0) continue;

    const isFullDay = d.isFullDay ?? (presence >= fullDayHours);
    const isHalfDay = d.isHalfDay ?? (!isFullDay && presence >= halfDayHours);

    if (isFullDay) {
      continue; // אין חיסור
    } else if (isHalfDay) {
      eligibleShortfall += fullDayHours - presence;
    } else {
      directShortfall += fullDayHours - presence;
    }
  }

  // כיסוי חיסורים מוכשרים מהמאגרים (WORK_PLAN §C)
  let remaining              = eligibleShortfall;
  const coveredFromZero      = r2(Math.min(totalZero, remaining));
  remaining                 -= coveredFromZero;

  const coveredFromOT        = r2(Math.min(totalOT, remaining));
  remaining                 -= coveredFromOT;

  const coveredFromUnapproved = r2(Math.min(totalUnapproved, remaining));
  remaining                  -= coveredFromUnapproved;

  const salaryCutHours = r2(remaining + directShortfall);

  const zeroUtilizationPct = totalZero > 0
    ? r2((coveredFromZero / totalZero) * 100)
    : 0;

  return {
    totalShortfall:       r2(eligibleShortfall + directShortfall),
    totalZero:            r2(totalZero),
    totalOT:              r2(totalOT),
    totalUnapproved:      r2(totalUnapproved),
    coveredFromZero,
    coveredFromOT,
    coveredFromUnapproved,
    salaryCutHours,
    zeroUtilizationPct,
  };
}

function r2(n) { return Math.round(n * 100) / 100; }
