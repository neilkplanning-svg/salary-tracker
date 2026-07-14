/**
 * defaults.js — ברירות מחדל לאומיות (ניתנות לעריכה דרך settings)
 * Input: none  Output: NATIONAL_DEFAULTS — אובייקט ערכים רשמיים עדכניים לישראל 2026
 * Deps: none
 *
 * כל ערך מגיע מפרסום רשמי (רשות המיסים / ביטוח לאומי).
 * אין hard-coding של פרמטרים אישיים; ערכים אלו הם נקודת הפתיחה בלבד.
 * מאומת מול reference/original-salary.xlsx (WP0.2).
 */

/** @type {import('../model/schema.js').NationalSettings} */
export const NATIONAL_DEFAULTS = {
  // מדרגות מס הכנסה שולי (₪/חודש) — 2026.
  // מבנה האקסל: min = מקסימום_קודם + 1 (פער של ₪1 בין מדרגות, S7=7011 וכו') — excel-formulas.md §6.
  // min של המדרגה הראשונה (0 כאן) נדרס בזמן ריצה ע"י V33 = פנסיה+השתלמות (OI-02).
  incomeTaxBrackets: [
    { min: 0,      max: 7010,   rate: 0.10 },  // תחתית בפועל = V33 (דינמי)
    { min: 7011,   max: 10060,  rate: 0.14 },
    { min: 10061,  max: 19000,  rate: 0.20 },
    { min: 19001,  max: 25100,  rate: 0.31 },
    { min: 25101,  max: 46690,  rate: 0.35 },
    { min: 46691,  max: 60130,  rate: 0.47 },
    { min: 60131,  max: 150000, rate: 0.50 },
  ],

  // ערך נקודת זיכוי (₪/חודש) — 2026
  creditPointValue: 242,

  // מדרגות ביטוח לאומי (עובד שכיר) — 2026. תקרה עליונה: 47,465 ₪/חודש.
  // מבנה האקסל: מדרגה 2 מתחילה ב-7704 (=7703+1, S18) — excel-formulas.md §7.
  nationalInsuranceBands: [
    { min: 0,    max: 7703,  rate: 0.0104 },  // 1.04% מדרגה מופחתת
    { min: 7704, max: 47465, rate: 0.07   },  // 7% מדרגה מלאה עד תקרה
  ],

  // מדרגות מס בריאות (עובד שכיר) — 2026 (מדרגה 2 מ-7704, S24) — excel-formulas.md §8
  healthTaxBands: [
    { min: 0,    max: 7703,  rate: 0.0323 },  // 3.23%
    { min: 7704, max: 47465, rate: 0.0517 },  // 5.17%
  ],

  // תקרת שכר לקרן השתלמות (₪/חודש) — 2026
  trainingFundCap: 15712,

  // שיעור הפרשת מעסיק לקרן השתלמות — משמש לחישוב "השלמת קה"ש" מעל תקרה (excel-formulas.md §10)
  // כשבסיס קה"ש > תקרה ו-depositAboveCap=false: חלק המעסיק מעבר לתקרה מתווסף לברוטו כהכנסה חייבת
  trainingFundRateEmployer: 0.075,

  // "זיכוי חסכון" (סעיף 45א) — זיכוי מס בשל הפקדה לביטוח פנסיוני, מכויל מול קורפוס
  // תלושי 01–05/26 (WP8.8b): 35% × min(הפקדת עובד לפנסיה, תקרה חודשית 679 ₪). מחליף את
  // מנגנון "מדרגה ראשונה דינמית" (V33) הישן מהאקסל המקורי — ראו excel-formulas.md §16/OI-08.
  pensionSavingsCreditRate: 0.35,
  pensionSavingsCreditCap:  679,

  // פרמטרי קטגוריזציית שעות יומית (WP8.1) — excel-formulas.md §17.
  // כל הזמנים בשעות עשרוניות (06:30 = 6.5). ניתנים לעריכה דרך settings.
  attendanceParams: {
    approvedStartTime: 6.5,     // 06:30 — לפני כן: "ללא אישור"
    fullDayHours:      8.9,     // 8:54 — נוכחות ליום מלא (אחריה עודף→אפס/ש"נ)
    halfDayHours:      4.45,    // 4:27 — מינימום להשלמת חיסור ממאגרים
    zeroHourCutoff:    17.0,    // 17:00 — "שעות אפס" עד כאן; אחריה "ללא אישור"
    firstBandHours:    1.0,     // 1:00 — עודף עד שעה → אפס/ללא-אישור; מעל → ש"נ
    fridayAllOvertime: true,    // שישי: כל הנוכחות המאושרת → ש"נ
    // קוד הפסקה ברירת מחדל (WP8.4+: נקבע בהגדרות, לא בכל יום)
    // null = ללא הפסקה ברירת מחדל; אחרת = אינדקס בתוך breakWindows[]
    defaultBreakCode: 1,        // ברירת מחדל: 12:00–12:30
    // חלונות הפסקה אפשריים (breakCode = אינדקס; null = ללא הפסקה)
    // [start, end] בשעות עשרוניות. כל חלון = 30 דק' (קפיצות חצי שעה, 11:30–13:00 — צומצם 2026-07-01 לפי בקשת משתמש)
    breakWindows: [
      [11.5, 12.0],  // 0: 11:30–12:00
      [12.0, 12.5],  // 1: 12:00–12:30
      [12.5, 13.0],  // 2: 12:30–13:00
    ],
  },

  // כללי שעות נוספות (משוחזר מהאקסל, P18/P20) — excel-formulas.md §3.2.
  // הנוסחה לוגריתמית: P20 = P12 × LOG_logBase(P12) × גורם.
  overtimeRules: {
    logBase: 8,                  // בסיס הלוגריתם
    minOvertimeForBonus: 11.9,   // סף שעות לבונוס (P12>11.9)
    maxHoursForTier1: 19.9,      // גבול עליון למדרגת 1.25
    minDaysForBonus: 6,          // סף ימי ש"נ (P19≥6)
    factorBase: 1.0,             // ≤11.9 ש' או <6 ימים
    factorTier1: 1.25,           // 11.9–19.9 ש', ≥6 ימים
    factorTier2: 1.30,           // >19.9 ש', ≥6 ימים
  },
};

/**
 * GRADES — מודל דירוגים (WP8.5).
 * מקור: 3 קבצי reference/ — אקסל דירוג מחקר (4 תת-דרגות א/ב/ג/ד),
 * תלוש מהנדסים (05.26), תלוש חוזה אישי (05.25). ראו excel-formulas.md §15.
 *
 * 'all' = כל הדירוגים (פרמטרים לאומיים ושדות המשותפים לכולם).
 * @type {{id:string,label:string}[]}
 */
export const GRADES = [
  { id: 'research',  label: 'מחקר' },
  { id: 'engineers', label: 'מהנדסים' },
  { id: 'contract',  label: 'חוזה אישי' },
];

/** תווית קצרה — "כל הדירוגים" או רשימת שמות */
export function gradeLabel(gradeIds) {
  if (!gradeIds || !gradeIds.length) return '';
  if (gradeIds.includes('all') || gradeIds.length === GRADES.length) return 'כל הדירוגים';
  return gradeIds.map(id => GRADES.find(g => g.id === id)?.label ?? id).join(', ');
}

/**
 * EARNING_COMPONENTS — קטלוג קנוני קבוע של כל רכיבי השכר האפשריים (כל הדירוגים).
 *
 * חולץ מ-3 מקורות אמת ב-reference/: אקסל דירוג מחקר (4 תת-דרגות + נוסחאות בסיסים),
 * תלוש מהנדסים (05/26), תלוש חוזה אישי (05/25). השיוך לבסיסים (flags) נקבע מהנוסחאות
 * והקודים בתלוש (91025 בסיס פנסיה, 91202 בסיס קה"ש, 94010 ברוטו ב"ל) — ראו docs/excel-formulas.md §15.
 *
 * **רשימה קבועה, לא נערכת ע"י המשתמש.** המשתמש מזין רק amount לכל רכיב (0 = לא בדירוג שלי).
 * השיוך לבסיסים מובנה כאן — המשתמש לא צריך להבין/לבחור אותו.
 *
 * שדות flag:
 *   inTax      — נכנס לבסיס מס הכנסה (M18)
 *   inNI       — נכנס לבסיס ביטוח לאומי / מס בריאות (94010)
 *   inPension  — נכנס לבסיס פנסיה (91025)
 *   inTraining — נכנס לבסיס קרן השתלמות (91202)
 *
 * רכב (toggle נפרד) ושעות נוספות (תת-מנוע) אינם בקטלוג — מטופלים במנגנון ייעודי.
 *
 * @typedef {{id:string,label:string,group:string,inTax:boolean,inNI:boolean,inPension:boolean,inTraining:boolean}} EarningComponent
 * @type {EarningComponent[]}
 */
export const EARNING_COMPONENTS = [
  // קבוצה: שכר בסיס — נכנס לכל הבסיסים (פנסיה+קה"ש+מס+ב"ל)
  // appliesToGrades: 'all' = כל הדירוגים. מפורט רק כשהרכיב ייחודי לדירוג מסוים.
  { id: 'base',              label: 'שכר יסוד',          group: 'base', inTax: true,  inNI: true,  inPension: true,  inTraining: true,  appliesToGrades: ['all'] },
  { id: 'researchSeniority', label: 'ותק למחקר',         group: 'base', inTax: true,  inNI: true,  inPension: true,  inTraining: true,  appliesToGrades: ['research'] },
  { id: 'misc',              label: 'שונות',             group: 'base', inTax: true,  inNI: true,  inPension: true,  inTraining: true,  appliesToGrades: ['research'] },
  { id: 'miscA',             label: 'שונות א׳',          group: 'base', inTax: true,  inNI: true,  inPension: true,  inTraining: true,  appliesToGrades: ['research'] },
  { id: 'incentive',         label: 'שכר עידוד',         group: 'base', inTax: true,  inNI: true,  inPension: true,  inTraining: true,  appliesToGrades: ['engineers', 'research'] },
  { id: 'contractSupplement',label: 'השלמת שכר (חוזה)',  group: 'base', inTax: true,  inNI: true,  inPension: true,  inTraining: true,  appliesToGrades: ['contract'] },

  // קבוצה: תוספות — בפנסיה אך לא בקה"ש (כוננות), או באף בסיס פרישה (תוספות/טלפון)
  { id: 'duty',              label: 'כוננות',            group: 'add',  inTax: true,  inNI: true,  inPension: true,  inTraining: false, appliesToGrades: ['all'] },
  { id: 'salaryAdditions',   label: 'תוספות לשכר',       group: 'add',  inTax: true,  inNI: true,  inPension: false, inTraining: false, appliesToGrades: ['engineers', 'research'] },
  { id: 'phone',             label: 'טלפון',             group: 'add',  inTax: true,  inNI: true,  inPension: false, inTraining: false, appliesToGrades: ['all'] },
  { id: 'carInsurance',      label: 'החזר ביטוחי רכב',   group: 'add',  inTax: true,  inNI: true,  inPension: false, inTraining: false, appliesToGrades: ['contract'] },

  // קבוצה: מיוחד — מחקר דולרי משולם נטו (לא חייב במס/ב"ל/פרישה); מתווסף לנטו בלבד
];

/**
 * IMPUTATION_COMPONENTS — קטלוג קנוני קבוע של זקיפות (שווי חיובי במס שאינו תשלום במזומן).
 * חולץ מעמודת P בגיליון "חודשי" (original-salary.xlsx). כולן חייבות במס+ב"ל (נכנסות ל-M18/94010).
 * רשימה קבועה; המשתמש מזין amount (0 = לא רלוונטי החודש; שי לפסח עונתי).
 * @type {{id:string,label:string,taxable:boolean}[]}
 */
export const IMPUTATION_COMPONENTS = [
  { id: 'passoverGift',       label: 'שווי שי לפסח',        taxable: true, appliesToGrades: ['all'] },
  { id: 'mealsValue',         label: 'שווי לארוחות',        taxable: true, appliesToGrades: ['all'] },
  { id: 'dentalValue',        label: 'שווי לביטוח שיניים',  taxable: true, appliesToGrades: ['all'] },
  { id: 'mealsParticipation', label: 'השתתפות בארוחות',     taxable: true, appliesToGrades: ['all'] },
  { id: 'cellularValue',      label: 'שווי לסלולרי',        taxable: true, appliesToGrades: ['all'] },
];

/**
 * זוקף flags לרכיב earning: inline (אם קיים — ל-golden cases) או lookup מהקטלוג לפי id.
 * @param {object} earning — { id?, amount, inTax?, inNI?, inPension?, inTraining? }
 * @returns {{inTax:boolean,inNI:boolean,inPension:boolean,inTraining:boolean}}
 */
export function resolveEarningFlags(earning) {
  if (earning.inTax !== undefined || earning.inNI !== undefined
      || earning.inPension !== undefined || earning.inTraining !== undefined) {
    return earning; // flags inline (golden cases / legacy)
  }
  const cat = EARNING_COMPONENTS.find(c => c.id === earning.id);
  return cat ?? { inTax: true, inNI: true, inPension: false, inTraining: false };
}

/** seed ל-personal.earnings: כל רכיבי הקטלוג עם amount 0. @returns {{id:string,amount:number}[]} */
export function seedEarnings() {
  return EARNING_COMPONENTS.map(c => ({ id: c.id, amount: 0 }));
}

/** seed ל-personal.imputations: כל הזקיפות עם amount 0. @returns {{id:string,amount:number,taxable:boolean}[]} */
export function seedImputations() {
  return IMPUTATION_COMPONENTS.map(c => ({ id: c.id, amount: 0, taxable: c.taxable }));
}
