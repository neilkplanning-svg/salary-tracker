/**
 * position.js — אחוז משרה חודשי ושנתי (pure functions, ללא DOM/UI)
 * Input: days[] של חודש (רשת הנוכחות) + attendanceParams + monthId
 * Output: { presenceHours, leaveHours, countedHours, workDays, potentialHours, positionPct, ... }
 * Deps: none
 *
 * ההגדרה (לפי הכרעת המשתמש, 2026-09):
 *   אחוז משרה חודשי = (שעות שעבדתי בפועל, כולל שעות נוספות + שעות היעדרות בתשלום)
 *                     ÷ (שעות העבודה שהתאפשרו באותו חודש)
 *   שעות שהתאפשרו   = ימי א'–ה' בחודש (ללא שישי ושבת) × fullDayHours
 *   אחוז משרה שנתי  = **אותה נוסחה על סכומי השנה** — Σ שעות ÷ Σ שעות אפשריות,
 *                     ולא ממוצע האחוזים החודשיים (חודש קצר/ארוך משפיע לפי משקלו).
 *
 * מוסכמות שחשוב להכיר:
 *  1. "שעות שעבדתי" = נוכחות פיזית מלאה, כניסה→יציאה (כולל שעות אפס, שעות ללא-אישור,
 *     שעות נוספות וההפסקה). זהו אותו סולם שבו נמדד fullDayHours (8.9 = נוכחות ליום מלא,
 *     כולל ההפסקה), ולכן יום נוכחות מלא = 100% בדיוק. שימו לב שהסכום כאן גדול ב-~0.5 ש׳
 *     מסכום העמודות "רגיל/נוסף/אפס/ללא-אישור" במסך הנוכחות — שם ההפסקה כבר מנוכה.
 *  2. היעדרות בתשלום (חופשה/מחלה/השתלמות) נספרת לפי leave.hours שנרשם ליום — גם הוא
 *     בסולם fullDayHours (כפתור "השלם ליום מלא" ממלא את ההפרש עד 8.9). יום השתלמות
 *     מסומן ב-training=true ללא leave נספר כיום מלא.
 *  3. שישי/שבת: **לא** במכנה (אינם ימי עבודה אפשריים), אבל עבודה בפועל בשישי כן נספרת
 *     במונה — ולכן חודש עם שישיות עמוסים יכול לעבור 100%. היעדרות שנרשמה בטעות על
 *     שישי/שבת אינה נספרת (אין ממה להיעדר).
 *  4. חגים אינם מוכרים לאפליקציה — יום חג שלא עבדתם בו ירד מהאחוז אלא אם נרשם כחופשה.
 */

/** שעות נוכחות ליום מלא כשאין attendanceParams (ערך ברירת המחדל הלאומי) */
const DEFAULT_FULL_DAY_HOURS = 8.9;

/** @param {string} t "HH:mm" @returns {number} שעות עשרוניות */
function toHours(t) {
  const [h, m] = String(t).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h + m / 60;
}

/** @param {string} dateStr 'YYYY-MM-DD' @returns {number} 0–6 (א'–ש') */
function dow(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').getDay();
}

/**
 * האם התאריך הוא יום עבודה אפשרי (א'–ה'). שישי (5) ושבת (6) אינם נספרים במכנה.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {boolean}
 */
export function isWorkDay(dateStr) {
  const d = dow(dateStr);
  return d !== 5 && d !== 6;
}

/**
 * מספר ימי העבודה האפשריים בחודש (א'–ה').
 * @param {string} monthId 'YYYY-MM'
 * @param {string|null} [asOf] 'YYYY-MM-DD' — לספירה חלקית עד תאריך זה ועד בכלל (חודש מתמשך)
 * @returns {number} 0 כש-monthId אינו תקין
 */
export function countWorkDays(monthId, asOf = null) {
  if (typeof monthId !== 'string' || !/^\d{4}-\d{2}$/.test(monthId)) return 0;
  const [y, m] = monthId.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

  let count = 0;
  for (let i = 1; i <= lastDay; i++) {
    const date = `${monthId}-${String(i).padStart(2, '0')}`;
    if (asOf && date > asOf) break;
    if (isWorkDay(date)) count++;
  }
  return count;
}

/**
 * שעות נוכחות פיזית ביום — כניסה→יציאה (ראו מוסכמה #1 בראש הקובץ).
 * fallback למצב ידני / ימים ישנים ללא start/end: סכום קטגוריות השעות + ההפסקה שנוכתה,
 * כדי להישאר על אותו סולם (נוכחות, לא "שעות בתשלום").
 * @param {object} day
 * @returns {number}
 */
function presenceHoursOf(day) {
  if (day.start && day.end) {
    const h = toHours(day.end) - toHours(day.start);
    return h > 0 ? h : 0;
  }
  return (day.regularPaid ?? day.regularHours ?? 0)
       + (day.zeroHours       ?? 0)
       + (day.unapprovedHours ?? 0)
       + (day.overtimeHours   ?? 0)
       + (day.breakDeducted   ?? 0);
}

/**
 * שעות היעדרות בתשלום ביום (חופשה/מחלה/השתלמות) — ראו מוסכמה #2.
 * @param {object} day
 * @param {number} fullDayHours
 * @returns {number}
 */
function leaveHoursOf(day, fullDayHours) {
  if (day.leave) return Math.max(0, day.leave.hours ?? 0);
  if (day.training === true) return fullDayHours;
  return 0;
}

/**
 * אחוז משרה לחודש בודד.
 * @param {object} p
 * @param {string|null} [p.monthId] 'YYYY-MM' (אם חסר — נגזר מהתאריך הראשון ב-days)
 * @param {object[]} [p.days] ימי החודש כפי שנשמרו (raw או מועשרים — שניהם נתמכים)
 * @param {object|null} [p.params] settings.national.attendanceParams
 * @param {string|null} [p.asOf] 'YYYY-MM-DD' — חודש מתמשך: מוסיף חתך "עד היום" ב-toDate
 * @returns {{ monthId:string|null, presenceHours:number, leaveHours:number, countedHours:number,
 *             workDays:number, potentialHours:number, positionPct:number|null, hasData:boolean,
 *             toDate:{ workDays:number, potentialHours:number, countedHours:number,
 *                      positionPct:number|null }|null }}
 *   positionPct = null כשאין מכנה (חודש לא ידוע) — "לא ידוע" אינו "0% משרה".
 */
export function calcMonthPosition({ monthId = null, days = [], params = null, asOf = null } = {}) {
  const fullDayHours = params?.fullDayHours ?? DEFAULT_FULL_DAY_HOURS;
  const list = Array.isArray(days) ? days : [];
  const id = monthId ?? list.find(d => typeof d?.date === 'string')?.date?.slice(0, 7) ?? null;

  let presenceHours = 0, leaveHours = 0;
  let presenceToDate = 0, leaveToDate = 0;
  let hasData = false;

  for (const d of list) {
    if (!d || typeof d.date !== 'string') continue;
    if (id && !d.date.startsWith(id)) continue; // הגנה: יום שאינו שייך לחודש הזה

    const presence = presenceHoursOf(d);
    // היעדרות נספרת רק על יום עבודה אפשרי (מוסכמה #3)
    const leave    = isWorkDay(d.date) ? leaveHoursOf(d, fullDayHours) : 0;
    if (presence > 0 || leave > 0) hasData = true;

    presenceHours += presence;
    leaveHours    += leave;
    if (asOf && d.date <= asOf) {
      presenceToDate += presence;
      leaveToDate    += leave;
    }
  }

  const workDays       = id ? countWorkDays(id) : 0;
  const potentialHours = workDays * fullDayHours;
  const countedHours   = presenceHours + leaveHours;

  // חתך "עד היום" — רק כשהחודש חתוך באמת ע"י asOf (חודש מתמשך)
  let toDate = null;
  if (asOf && id) {
    const workDaysToDate = countWorkDays(id, asOf);
    if (workDaysToDate < workDays) {
      const potentialToDate = workDaysToDate * fullDayHours;
      const countedToDate   = presenceToDate + leaveToDate;
      toDate = {
        workDays:       workDaysToDate,
        potentialHours: r2(potentialToDate),
        presenceHours:  r2(presenceToDate),
        leaveHours:     r2(leaveToDate),
        countedHours:   r2(countedToDate),
        positionPct:    potentialToDate > 0 ? r2((countedToDate / potentialToDate) * 100) : null,
      };
    }
  }

  return {
    monthId:        id,
    presenceHours:  r2(presenceHours),
    leaveHours:     r2(leaveHours),
    countedHours:   r2(countedHours),
    workDays,
    potentialHours: r2(potentialHours),
    positionPct:    potentialHours > 0 ? r2((countedHours / potentialHours) * 100) : null,
    hasData,
    toDate,
  };
}

/**
 * אחוז משרה של חודש מתוך אובייקט month של ה-state, עם נפילה-לאחור ל-snapshot השמור
 * (estimate.positionCountedHours / positionPotentialHours) כשאין ברשת הימים נתוני נוכחות —
 * למשל חודש שיובא מאקסל היסטורי בלי גיליון נוכחות, או שרשת הימים שלו נוקתה אחרי השמירה.
 * בנפילה-לאחור אין פירוט נוכחות/היעדרות (presenceHours/leaveHours = null) — רק הסכום.
 * @param {object} month { id, days?, estimate? }
 * @param {object|null} [params] attendanceParams
 * @param {string|null} [asOf] 'YYYY-MM-DD'
 * @returns {object} כמו calcMonthPosition, בתוספת fromSnapshot:boolean
 */
export function monthPositionOf(month, params = null, asOf = null) {
  const live = calcMonthPosition({
    monthId: month?.id ?? null,
    days:    month?.days ?? [],
    params,
    asOf,
  });
  if (live.hasData) return { ...live, fromSnapshot: false };

  const est = month?.estimate ?? null;
  const potential = est?.positionPotentialHours ?? 0;
  if (potential > 0) {
    const counted = est.positionCountedHours ?? 0;
    return {
      monthId:        month?.id ?? null,
      presenceHours:  null,
      leaveHours:     null,
      countedHours:   r2(counted),
      workDays:       est.positionWorkDays ?? 0,
      potentialHours: r2(potential),
      positionPct:    est.positionPct ?? r2((counted / potential) * 100),
      hasData:        true,
      toDate:         null,
      fromSnapshot:   true,
    };
  }
  return { ...live, fromSnapshot: false };
}

/**
 * אחוז משרה שנתי — Σ שעות שנספרו ÷ Σ שעות אפשריות של חודשי השנה (ראו הערת הראש:
 * זהו **אינו** ממוצע האחוזים החודשיים).
 *
 * נספרים רק חודשים שיש בהם נתוני נוכחות/היעדרות (hasData). חודש מתועד-אך-ריק היה מוסיף
 * ~186 שעות למכנה ו-0 למונה, ומדלל את השנה כאילו לא עבדתי בו — בעוד שהמשמעות האמיתית
 * היא "החודש לא תועד".
 *
 * @param {object} p
 * @param {number|string} p.year
 * @param {object[]} [p.months] state.months (מסונן כאן לפי השנה)
 * @param {object|null} [p.params] settings.national.attendanceParams
 * @param {string|null} [p.asOf] 'YYYY-MM-DD' — שנה מתמשכת: החודש הנוכחי נספר עד תאריך זה
 * @returns {{ year:number, presenceHours:number, leaveHours:number, countedHours:number,
 *             workDays:number, potentialHours:number, positionPct:number|null,
 *             monthsCounted:number, hasData:boolean }}
 */
export function calcYearPosition({ year, months = [], params = null, asOf = null } = {}) {
  const prefix = String(year);
  const list = Array.isArray(months) ? months : [];

  let presenceHours = 0, leaveHours = 0, countedHours = 0;
  let workDays = 0, potentialHours = 0, monthsCounted = 0;

  for (const m of list) {
    if (typeof m?.id !== 'string' || !m.id.startsWith(prefix + '-')) continue;

    const pos = monthPositionOf(m, params, asOf);
    if (!pos.hasData) continue;

    // חודש מתמשך (asOf בתוכו) נספר עד היום — אחרת המכנה של החודש הנוכחי מלא והמונה חלקי
    const eff = pos.toDate ?? pos;
    // חודש מ-snapshot אינו נושא פירוט נוכחות/היעדרות — נספר בסכום בלבד (?? 0)
    presenceHours  += eff.presenceHours ?? 0;
    leaveHours     += eff.leaveHours    ?? 0;
    countedHours   += eff.countedHours;
    workDays       += eff.workDays;
    potentialHours += eff.potentialHours;
    monthsCounted++;
  }

  return {
    year:           Number(year),
    presenceHours:  r2(presenceHours),
    leaveHours:     r2(leaveHours),
    countedHours:   r2(countedHours),
    workDays,
    potentialHours: r2(potentialHours),
    positionPct:    potentialHours > 0 ? r2((countedHours / potentialHours) * 100) : null,
    monthsCounted,
    hasData:        monthsCounted > 0,
  };
}

/** עיגול ל-2 ספרות אחרי הנקודה */
function r2(n) { return Math.round(n * 100) / 100; }
