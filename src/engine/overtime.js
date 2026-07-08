/**
 * overtime.js — תת-מנוע שעות נוספות (משוחזר מהאקסל, תאי P12–P21 בגיליון "חודשי")
 * Input: { overtimeHours, overtimeDays, overtimeHourValue, rules, special }
 * Output: overtimePay (₪) — ש"נ ברוטו (N5 = P20 × P21)
 * Deps: none
 *
 * ⚠ נוסחה לוגריתמית — לא 125%/150% פשוטים! ראו docs/excel-formulas.md §3.
 *   P18 = גורם הכפלה לפי שעות מאושרות (P12) ומספר ימי ש"נ (P19)
 *   P20 = (P12 × LOG_base(P12)) × P18 + P13 + P14×P15 + P16×P17
 *   N5  = P20 × P21            ← ש"נ ברוטו (מוחזר מכאן)
 *   M5  = N5 × 0.988           ← תרומה ל-M17; גורם 0.988 (OI-05) מיושם בהרכבת הברוטו (WP3.x)
 *
 * @typedef {object} OvertimeRules
 * @property {number} logBase             בסיס הלוגריתם בנוסחת P20 (8 באקסל)
 * @property {number} minOvertimeForBonus סף שעות לבונוס (P12>11.9)
 * @property {number} maxHoursForTier1    גבול עליון למדרגת 1.25 (≤19.9)
 * @property {number} minDaysForBonus     סף ימי ש"נ לבונוס (P19≥6)
 * @property {number} factorBase          גורם ברירת מחדל (1.0)
 * @property {number} factorTier1         גורם מדרגה 1 (1.25)
 * @property {number} factorTier2         גורם מדרגה 2 (1.30)
 */

/** ברירת מחדל מקומית (guard) — מקור האמת ב-engine/defaults.js NATIONAL_DEFAULTS.overtimeRules */
const DEFAULT_OVERTIME_RULES = {
  logBase: 8,
  minOvertimeForBonus: 11.9,
  maxHoursForTier1: 19.9,
  minDaysForBonus: 6,
  factorBase: 1.0,
  factorTier1: 1.25,
  factorTier2: 1.30,
};

/**
 * גורם הכפלה P18 לפי שעות מאושרות ומספר ימי ש"נ — excel-formulas.md §3.2
 * שחזור: IF(OR(P12<=11.9, AND(P12>11.9,P19<6)), 1, IF(AND(11.9<=P12<=19.9,P19>=6),1.25, IF(AND(P12>19.9,P19>=6),1.3,0)))
 * @param {number} hours שעות מאושרות (P12)
 * @param {number} days  מספר ימי ש"נ (P19)
 * @param {OvertimeRules} rules
 * @returns {number} גורם (1.0 / 1.25 / 1.3 / 0)
 */
export function overtimeFactor(hours, days, rules) {
  const { minOvertimeForBonus, maxHoursForTier1, minDaysForBonus,
          factorBase, factorTier1, factorTier2 } = rules;

  // ≤11.9 שעות, או >11.9 עם פחות מ-6 ימים → גורם בסיס
  if (hours <= minOvertimeForBonus || days < minDaysForBonus) return factorBase;
  // 11.9–19.9 שעות, ≥6 ימים → מדרגה 1
  if (hours <= maxHoursForTier1) return factorTier1;
  // >19.9 שעות, ≥6 ימים → מדרגה 2
  return factorTier2;
}

/**
 * חישוב תשלום שעות נוספות (ש"נ ברוטו, N5)
 * @param {object} params
 * @param {number} params.overtimeHours      שעות ש"נ מאושרות בחודש (P12; כבר אחרי מכסה)
 * @param {number} [params.overtimeDays]     מספר ימים עם ש"נ (P19)
 * @param {number} params.overtimeHourValue  ערך שעה נוספת (₪, P21)
 * @param {OvertimeRules} [params.rules]     פרמטרי מדרגות ש"נ (national.overtimeRules)
 * @param {object} [params.special]          רכיבים מיוחדים (שבת/חג/כוננות/100%) — P13..P17
 * @param {number} [params.special.hours100]          P13
 * @param {number} [params.special.satHolidayPremium] P14 (פרמיה ₪/שעה)
 * @param {number} [params.special.satHolidayHours]   P15
 * @param {number} [params.special.standbyPremium]    P16 (פרמיה ₪/שעה)
 * @param {number} [params.special.standbyHours]      P17
 * @returns {number} ש"נ ברוטו (₪)
 */
export function calcOvertime({ overtimeHours = 0, overtimeDays = 0, overtimeHourValue = 0,
                               rules = DEFAULT_OVERTIME_RULES, special = {} }) {
  // IFERROR בנוסחת האקסל: LOG על ≤0 נכשל → 0
  if (!overtimeHours || overtimeHours <= 0 || !overtimeHourValue) return 0;

  const factor = overtimeFactor(overtimeHours, overtimeDays, rules);
  const {
    hours100 = 0,
    satHolidayPremium = 0, satHolidayHours = 0,
    standbyPremium = 0, standbyHours = 0,
  } = special;

  // P20 — יחידות ש"נ: רכיב לוגריתמי × גורם + תוספות מיוחדות
  const logUnits = overtimeHours * (Math.log(overtimeHours) / Math.log(rules.logBase));
  const p20 = logUnits * factor
            + hours100
            + (satHolidayPremium * satHolidayHours)
            + (standbyPremium * standbyHours);

  // N5 = P20 × P21
  return p20 * overtimeHourValue;
}
