/**
 * attendance-hours.js — תת-מנוע קטגוריזציית שעות יומית (pure function)
 * Input: { start, end, breakCode, dow } + params (attendance params מ-settings.national)
 * Output: { regularPaid, zeroHours, unapprovedHours, overtimeHours, breakDeducted, isFullDay, isHalfDay }
 * Deps: none
 *
 * מסווג שעות יום עבודה לקטגוריות לפי אלגוריתם WORK_PLAN §B / docs/excel-formulas.md §17.
 * כל הזמנים בשעות עשרוניות (07:30 = 7.5).
 *
 * קטגוריות פלט:
 *   regularPaid    — שעות בתשלום רגיל (לאחר ניכוי הפסקה)
 *   zeroHours      — שעות "אפס" (נספרות, לא משולמות; מועמדות לכיסוי חיסורים ראשונות)
 *   unapprovedHours — שעות ללא אישור (לפני 06:30 / אחרי 17:00 בשעה הראשונה; אחרונות לכיסוי)
 *   overtimeHours  — שעות נוספות לחישוב כספי (→ overtime.js)
 *   breakDeducted  — שעות הפסקה שנוכו
 *   isFullDay      — הגיע לקו המכסה (E ≥ quotaLine)
 *   isHalfDay      — נוכח ≥ halfDayHours (זכאי להשלמת חיסור ממאגרים)
 */

/**
 * המרת "HH:mm" לשעות עשרוניות.
 * @param {string} t "HH:mm"
 * @returns {number}
 */
function toHours(t) {
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}

/**
 * חפיפה בין שני קטעים [a,b] ו-[c,d].
 * @param {number} a @param {number} b @param {number} c @param {number} d
 * @returns {number} אורך חפיפה בשעות
 */
function overlap(a, b, c, d) {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

/**
 * קטגוריזציית שעות יום בודד.
 *
 * אלגוריתם (WORK_PLAN §B):
 *   unapproved_pre = max(0, min(E, approvedStartTime) − S)
 *   aStart         = max(S, approvedStartTime)
 *   quotaLine      = aStart + fullDayHours
 *   breakDeducted  = overlap(breakWindow, [aStart, min(E, quotaLine)])
 *   regularPaid    = (min(E, quotaLine) − aStart) − breakDeducted
 *   excess         = max(0, E − quotaLine)
 *
 *   excess == 0        → רגיל בלבד
 *   0 < excess ≤ 1h   → פיצול ב-zeroHourCutoff: [quota..17:00]=אפס, [17:00..E]=ללא-אישור
 *   excess > 1h        → כל העודף (כולל שעה ראשונה) → ש"נ
 *
 *   שישי (fridayAllOvertime): overtime = (E−aStart) − breakDeducted; regular=zero=0
 *
 * @param {{ start:string|null, end:string|null, breakCode:number|null, dow:number }} day
 * @param {{ approvedStartTime:number, fullDayHours:number, halfDayHours:number,
 *           breakWindows:Array<[number,number]>, zeroHourCutoff:number,
 *           firstBandHours:number, fridayAllOvertime:boolean }} params
 * @returns {{ regularPaid:number, zeroHours:number, unapprovedHours:number,
 *             overtimeHours:number, breakDeducted:number, presenceInQuota:number,
 *             isFullDay:boolean, isHalfDay:boolean }}
 */
export function categorizeDay(day, params) {
  const { start, end, breakCode, dow } = day;
  const {
    approvedStartTime,
    fullDayHours,
    halfDayHours,
    breakWindows,
    zeroHourCutoff,
    firstBandHours,
    fridayAllOvertime,
  } = params;

  if (!start || !end) {
    return {
      regularPaid: 0, zeroHours: 0, unapprovedHours: 0,
      overtimeHours: 0, breakDeducted: 0, presenceInQuota: 0,
      isFullDay: false, isHalfDay: false,
    };
  }

  const S = toHours(start);
  const E = toHours(end);

  // שעות לפני זמן מאושר (06:30) — תמיד "ללא אישור"
  const unapprovedPre = Math.max(0, Math.min(E, approvedStartTime) - S);

  const aStart    = Math.max(S, approvedStartTime);
  const quotaLine = aStart + fullDayHours;

  // חפיפת ההפסקה עם חלון [aStart, min(E, quotaLine)]
  const workEnd = Math.min(E, quotaLine);
  const bw      = (breakCode != null) ? (breakWindows[breakCode] ?? null) : null;
  const breakDeducted = bw ? overlap(bw[0], bw[1], aStart, workEnd) : 0;

  // נוכחות פיזית בחלון המכסה (כולל הפסקה)
  const presenceInQuota = workEnd - aStart;
  const isFullDay  = E >= quotaLine;
  const isHalfDay  = !isFullDay && presenceInQuota >= halfDayHours;

  // === שישי: כל הנוכחות המאושרת → ש"נ ===
  // חלון 06:30 והפסקה חלים גם בשישי (WORK_PLAN §B החלטה #2)
  if (dow === 5 && fridayAllOvertime) {
    const overtimeHours = Math.max(0, E - aStart) - breakDeducted;
    return {
      regularPaid:     0,
      zeroHours:       0,
      unapprovedHours: r4(unapprovedPre),
      overtimeHours:   r4(overtimeHours),
      breakDeducted:   r4(breakDeducted),
      presenceInQuota: r4(presenceInQuota),
      isFullDay,
      isHalfDay,
    };
  }

  // === יום רגיל ===
  const regularPaid = presenceInQuota - breakDeducted;
  const excess      = Math.max(0, E - quotaLine);

  let zeroHours      = 0;
  let unapprovedPost = 0;
  let overtimeHours  = 0;

  if (excess > firstBandHours) {
    // מעבר לשעה הראשונה — כל העודף (כולל השעה הראשונה) → ש"נ (החלטה #4)
    overtimeHours = excess;
  } else if (excess > 0) {
    // שעה ראשונה: פיצול ב-zeroHourCutoff (17:00)
    // [quotaLine .. 17:00] = שעות אפס; [17:00 .. E] = ללא אישור
    zeroHours      = Math.max(0, Math.min(E, zeroHourCutoff) - quotaLine);
    unapprovedPost = Math.max(0, E - Math.max(quotaLine, zeroHourCutoff));
  }

  return {
    regularPaid:     r4(regularPaid),
    zeroHours:       r4(zeroHours),
    unapprovedHours: r4(unapprovedPre + unapprovedPost),
    overtimeHours:   r4(overtimeHours),
    breakDeducted:   r4(breakDeducted),
    presenceInQuota: r4(presenceInQuota),
    isFullDay,
    isHalfDay,
  };
}

/** עיגול ל-4 ספרות אחרי הנקודה (דיוק דקות) */
function r4(n) { return Math.round(n * 10000) / 10000; }
