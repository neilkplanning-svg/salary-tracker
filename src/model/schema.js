/**
 * schema.js — סכמת JSON, schemaVersion, מצב ריק ופונקציית ולידציה
 * Input: אובייקט doc  Output: { valid: boolean, errors: string[] }
 * Deps: engine/defaults.js (פרמטרים לאומיים — מקור אמת יחיד)
 */

import { NATIONAL_DEFAULTS, seedEarnings, seedImputations } from '../engine/defaults.js';

export const SCHEMA_VERSION = 1;

export const EMPTY_STATE = {
  schemaVersion: SCHEMA_VERSION,
  appMeta: {
    lastModified: new Date().toISOString(),
    deviceId: crypto.randomUUID(),
    appVersion: '0.1.0',
  },
  settings: {
    // פרמטרים לאומיים — מקור אמת יחיד ב-engine/defaults.js (clone כדי שלא לדרוס את המקור)
    national: structuredClone(NATIONAL_DEFAULTS),
    personal: {
      // WP2.4: רכיבי שכר מקטלוג קנוני קבוע (EARNING_COMPONENTS). המשתמש מזין amount בלבד;
      // 0 = הרכיב לא בדירוג שלי. השיוך לבסיסים (פנסיה/קה"ש/מס/ב"ל) מובנה בקטלוג — לא נערך.
      // המסלול במנוע פעיל כשלפחות רכיב אחד ≠ 0 (ראו engine.js).
      earnings: seedEarnings(),
      // האם להמשיך להפקיד לקה"ש מעל התקרה (אחרת — עובד: על תקרה בלבד, השלמת מעסיק → ברוטו)
      trainingFundDepositAboveCap: false,

      // legacy / fallback (פעיל רק כשכל ה-earnings אפס — למשל golden cases ישנים)
      baseSalary: { baseConst: 0, perHourConst: 0 },
      positionPercent: 100,
      fixedAdditions: { phone: 0, other: 0 },
      pensionBaseFactor: 0.9895, // בסיס פנסיה = ברוטו × גורם זה — excel-formulas.md §9

      creditPointsQty: 2.25,
      pensionRateEmployee: 0.06,
      // פנסיה שנייה על נלווים (OI-07) — קרן/ביטוח נוסף על "ברוטו מבוטח נלווה" (למשל כוננות/ש"נ),
      // בנפרד מבסיס הפנסיה העיקרי. ancillaryPensionBase=0 → pension2=0 (אין השפעה כברירת מחדל).
      pensionRateEmployee2: 0.07,
      ancillaryPensionBase: 0,
      trainingFundRateEmployee: 0.025,
      overtimeHourValue: 0,
      // WP10.8: ערך יום כוננות (₪) — מוענק על כל יום נוכחות בפועל (כולל יום חלקי שהושלם בחופשה/מחלה);
      // 0 = כבוי (ברירת מחדל, ללא השפעה). ראו calculate() ב-engine.js לחישוב standbyPay.
      standbyDayValue: 0,
      // WP10.10: כללי קרן דולרית (מעקב עצמאי — ראו dollarFund למטה) — ניתנים לעריכה, לא hard-coded
      dollarFundRules: {
        minBalanceUsd:      2000,  // רצפה — אין לרדת מתחתיה בפדיון (למעט 'retirement')
        personalYearCapUsd: 5000,  // תקרת משיכה אישית לשנה קלנדרית
        personalTaxRate:    0.47,  // מס על משיכה אישית/פרישה
      },
      // רכב (WP2.3 נק' 8): אם רכב חברה → תוספת=0 ומזינים שווי גילום; אחרת → תוספת רכב (ברירת מחדל 3879)
      car: { hasCompanyCar: false, allowance: 3879, imputation: 0 },
      // זקיפות מקטלוג קנוני קבוע (IMPUTATION_COMPONENTS); amount 0 = לא רלוונטי החודש
      imputations: seedImputations(),
      otherDeductions: [],
    },
    theme: { mode: 'system' },
  },
  months: [],
  temporaryReductions: [],
  aidFund: {
    deposits: [],
    balanceSavings: 0,
    loans: [],
  },
  // WP10.10: קרן דולרית — מעקב עצמאי, אינו מופיע בתלוש ואינו חלק ממנוע החישוב (calculate()).
  // deposits: [{id, date:'YYYY-MM-DD', amountUsd, notes}]
  // redemptions: [{id, date:'YYYY-MM-DD', amountUsd, type:'research-travel'|'personal'|'retirement', notes}]
  // יתרה נגזרת בזמן render (לא נשמרת) — ראו src/ui/dollarfund.js
  dollarFund: {
    deposits: [],
    redemptions: [],
  },
  // WP10.11: ניכויים קבועים מותאמים-אישית (למשל "חברות בוועד", "הלוואה שיורדת מהשכר").
  // כל איבר: { id, label, amount, startMonth?, endMonth? } — startMonth/endMonth בפורמט 'YYYY-MM';
  // חסר = פתוח-קצה (תמיד פעיל בכיוון הזה). מסמכים ישנים ללא customDeductions — UI ניגש עם `?? []`.
  customDeductions: [],
  // אינפלציה שנתית מוזנת ידנית במסך היסטוריה; yearSummaries עצמו נגזר בזמן render (history.js), לא נשמר.
  inflationByYear: {},
  // WP10.6: סיכומי שנה ידניים לשנים ללא חודשים מתועדים (למשל שנים לפני תחילת השימוש באפליקציה).
  // מפתח = 'YYYY'; כל שדה אופציונלי (הזנה חלקית) — ראו computeYearSummaries ב-history.js למיזוג
  // עם שנים נגזרות מ-months[] (derived תמיד גובר; שנה עם months אינה נדרסת ע"י manual).
  manualYearSummaries: {},
};

/** @param {*} v @returns {boolean} true אם v הוא אובייקט פשוט (לא מערך, לא null) */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * משלים שדות חסרים ב-target מתוך source, רקורסיבית על אובייקטים פשוטים בלבד.
 * מערכים/פרימיטיבים שכבר קיימים ב-target (אפילו ריקים) לא נדרסים — רק שדה שהוא undefined לגמרי מושלם.
 * @param {object} target @param {object} source
 */
function fillMissing(target, source) {
  for (const key of Object.keys(source)) {
    if (target[key] === undefined) {
      target[key] = structuredClone(source[key]);
    } else if (isPlainObject(target[key]) && isPlainObject(source[key])) {
      fillMissing(target[key], source[key]);
    }
  }
}

/**
 * מסיר מ-doc.settings.personal.earnings שורות יתומות של רכיבים שהוסרו לגמרי מהקטלוג הקנוני
 * (WP10.13: 'seniority' — "ותק" הוסר; הוחלף ע"י 'researchSeniority' הנשאר בקטלוג).
 * ממוקד ל-id הספציפי בלבד — לא מסנן שורות "לא מוכרות" באופן כללי, כי ל-earnings
 * יכולות להיות שורות מותאמות/מיובאות (JSON/Excel) שלא נמצאות בקטלוג ואינן יתומות.
 * null-safe: לא עושה דבר אם personal/earnings חסרים או ריקים.
 * @param {object} doc
 * @returns {object} doc (אותו אובייקט, מעודכן in-place)
 */
function removeOrphanedEarnings(doc) {
  const earnings = doc?.settings?.personal?.earnings;
  if (Array.isArray(earnings)) {
    doc.settings.personal.earnings = earnings.filter(e => e?.id !== 'seniority');
  }
  return doc;
}

/**
 * משלים ב-doc.settings.national כל שדה שנוסף ל-NATIONAL_DEFAULTS מאז שהמסמך נשמר
 * (למשל attendanceParams/breakWindows שנוספו ב-WP8.1) — בלי לדרוס ערכים שהמשתמש כבר ערך.
 * משלים גם שדות personal חסרים מ-EMPTY_STATE (למשל dollarFundRules/standbyDayValue שנוספו
 * ב-WP10.10/10.8) — אחרת מסמך ישן חסר את dollarFundRules והשמירה במסך ההגדרות זורקת TypeError.
 * גם מנקה שורות earnings יתומות מרכיבים שהוסרו מהקטלוג (ראו removeOrphanedEarnings).
 * נקרא בכל טעינת מסמך חיצוני: persistence.js (אחסון מקומי) + json-io.js/filesync.js (ייבוא).
 * @param {object} doc
 * @returns {object} doc (אותו אובייקט, מעודכן in-place)
 */
export function fillNationalDefaults(doc) {
  if (isPlainObject(doc?.settings?.national)) {
    fillMissing(doc.settings.national, NATIONAL_DEFAULTS);
  }
  if (isPlainObject(doc?.settings?.personal)) {
    fillMissing(doc.settings.personal, EMPTY_STATE.settings.personal);
  }
  removeOrphanedEarnings(doc);
  return doc;
}

/**
 * ולידציה בסיסית של מסמך JSON
 * @param {object} doc
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(doc) {
  const errors = [];

  if (!doc || typeof doc !== 'object') {
    return { valid: false, errors: ['לא אובייקט תקין'] };
  }

  if (doc.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion ${doc.schemaVersion} לא נתמך (נדרש ${SCHEMA_VERSION})`);
  }

  if (!doc.appMeta?.lastModified) errors.push('appMeta.lastModified חסר');
  if (!doc.settings?.national)   errors.push('settings.national חסר');
  if (!doc.settings?.personal)   errors.push('settings.personal חסר');
  if (!Array.isArray(doc.months)) errors.push('months חייב להיות מערך');

  // ולידציית settings.national (WP9.1 §1.3 — קלט ייבוא לא תקין לא יגיע למנוע)
  const national = doc.settings?.national;
  if (national) {
    const validateBands = (bands, name) => {
      if (!Array.isArray(bands) || bands.length === 0) {
        errors.push(`settings.national.${name} חייב להיות מערך לא ריק`);
        return;
      }
      for (const b of bands) {
        if (typeof b?.min !== 'number' || typeof b?.max !== 'number' || typeof b?.rate !== 'number') {
          errors.push(`settings.national.${name}: איבר עם שדות לא מספריים`);
          continue;
        }
        if (b.min >= b.max) errors.push(`settings.national.${name}: min (${b.min}) חייב להיות קטן מ-max (${b.max})`);
        if (b.rate < 0 || b.rate > 1) errors.push(`settings.national.${name}: rate (${b.rate}) חייב להיות בין 0 ל-1`);
      }
    };
    validateBands(national.incomeTaxBrackets, 'incomeTaxBrackets');
    validateBands(national.nationalInsuranceBands, 'nationalInsuranceBands');
    validateBands(national.healthTaxBands, 'healthTaxBands');
    if (typeof national.creditPointValue !== 'number' || national.creditPointValue < 0)
      errors.push('settings.national.creditPointValue חייב להיות מספר אי-שלילי');
    if (typeof national.trainingFundCap !== 'number' || national.trainingFundCap < 0)
      errors.push('settings.national.trainingFundCap חייב להיות מספר אי-שלילי');
  }

  // ולידציית settings.personal (WP9.1 §1.3)
  const personal = doc.settings?.personal;
  if (personal) {
    if (typeof personal.creditPointsQty !== 'number' || personal.creditPointsQty < 0)
      errors.push('settings.personal.creditPointsQty חייב להיות מספר אי-שלילי');
    if (typeof personal.pensionRateEmployee !== 'number' || personal.pensionRateEmployee < 0)
      errors.push('settings.personal.pensionRateEmployee חייב להיות מספר אי-שלילי');
    if (personal.pensionRateEmployee2 != null && (typeof personal.pensionRateEmployee2 !== 'number' || personal.pensionRateEmployee2 < 0))
      errors.push('settings.personal.pensionRateEmployee2 חייב להיות מספר אי-שלילי');
    if (personal.ancillaryPensionBase != null && (typeof personal.ancillaryPensionBase !== 'number' || personal.ancillaryPensionBase < 0))
      errors.push('settings.personal.ancillaryPensionBase חייב להיות מספר אי-שלילי');
    if (personal.standbyDayValue != null && (typeof personal.standbyDayValue !== 'number' || personal.standbyDayValue < 0))
      errors.push('settings.personal.standbyDayValue חייב להיות מספר אי-שלילי');
    if (typeof personal.trainingFundRateEmployee !== 'number' || personal.trainingFundRateEmployee < 0)
      errors.push('settings.personal.trainingFundRateEmployee חייב להיות מספר אי-שלילי');
    if (personal.earnings != null) {
      if (!Array.isArray(personal.earnings)) errors.push('settings.personal.earnings חייב להיות מערך');
      else for (const e of personal.earnings) {
        if (!e?.id || typeof e.amount !== 'number')
          errors.push(`settings.personal.earnings: איבר לא תקין (${JSON.stringify(e)})`);
      }
    }
    if (personal.imputations != null) {
      if (!Array.isArray(personal.imputations)) errors.push('settings.personal.imputations חייב להיות מערך');
      else for (const im of personal.imputations) {
        if (typeof im?.amount !== 'number' || typeof im?.taxable !== 'boolean')
          errors.push(`settings.personal.imputations: איבר לא תקין (${JSON.stringify(im)})`);
      }
    }
    // WP10.10: כללי קרן דולרית — ניתנים לעריכה (settings), לא hard-coded
    if (personal.dollarFundRules != null) {
      const dfr = personal.dollarFundRules;
      if (typeof dfr.minBalanceUsd !== 'number' || dfr.minBalanceUsd < 0)
        errors.push('settings.personal.dollarFundRules.minBalanceUsd חייב להיות מספר אי-שלילי');
      if (typeof dfr.personalYearCapUsd !== 'number' || dfr.personalYearCapUsd < 0)
        errors.push('settings.personal.dollarFundRules.personalYearCapUsd חייב להיות מספר אי-שלילי');
      if (typeof dfr.personalTaxRate !== 'number' || dfr.personalTaxRate < 0 || dfr.personalTaxRate > 1)
        errors.push('settings.personal.dollarFundRules.personalTaxRate חייב להיות בין 0 ל-1');
    }
  }

  // ולידציית customDeductions (WP10.11) — ניכויים קבועים מותאמים-אישית עם טווח חודשים אופציונלי
  const monthRe = /^\d{4}-\d{2}$/;
  if (doc.customDeductions != null) {
    if (!Array.isArray(doc.customDeductions)) {
      errors.push('customDeductions חייב להיות מערך');
    } else {
      for (const cd of doc.customDeductions) {
        if (!cd?.label || typeof cd.label !== 'string')
          errors.push(`customDeductions: label חסר או לא תקין (${JSON.stringify(cd)})`);
        if (typeof cd?.amount !== 'number' || cd.amount < 0)
          errors.push(`customDeductions: amount חייב להיות מספר אי-שלילי (${JSON.stringify(cd)})`);
        if (cd?.startMonth != null && !monthRe.test(cd.startMonth))
          errors.push(`customDeductions: startMonth לא תקין (${cd.startMonth})`);
        if (cd?.endMonth != null && !monthRe.test(cd.endMonth))
          errors.push(`customDeductions: endMonth לא תקין (${cd.endMonth})`);
      }
    }
  }

  // ולידציית manualYearSummaries (WP10.6) — סיכומי שנה ידניים לשנים ללא חודשים; כל שדה אופציונלי
  if (doc.manualYearSummaries != null) {
    if (!isPlainObject(doc.manualYearSummaries)) {
      errors.push('manualYearSummaries חייב להיות אובייקט');
    } else {
      for (const [key, y] of Object.entries(doc.manualYearSummaries)) {
        if (!/^\d{4}$/.test(key)) errors.push(`manualYearSummaries: מפתח שנה לא תקין (${key})`);
        if (!isPlainObject(y)) {
          errors.push(`manualYearSummaries[${key}]: ערך חייב להיות אובייקט`);
          continue;
        }
        for (const field of ['totalGross', 'totalNet', 'bonusesGross', 'monthsCount']) {
          if (y[field] != null && (typeof y[field] !== 'number' || y[field] < 0))
            errors.push(`manualYearSummaries[${key}].${field} חייב להיות מספר אי-שלילי`);
        }
        if (y.notes != null && typeof y.notes !== 'string')
          errors.push(`manualYearSummaries[${key}].notes חייב להיות מחרוזת`);
      }
    }
  }

  // ולידציית aidFund.loans[].startMonth/endMonth (WP10.11) — אופציונליים, ללא שינוי לשדות קיימים
  const loans = doc.aidFund?.loans;
  if (Array.isArray(loans)) {
    for (const l of loans) {
      if (l?.startMonth != null && !monthRe.test(l.startMonth))
        errors.push(`aidFund.loans: startMonth לא תקין (${l.startMonth})`);
      if (l?.endMonth != null && !monthRe.test(l.endMonth))
        errors.push(`aidFund.loans: endMonth לא תקין (${l.endMonth})`);
    }
  }

  // ולידציית dollarFund (WP10.10) — מעקב עצמאי, נפרד ממנוע החישוב
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const dollarFund = doc.dollarFund;
  if (dollarFund != null) {
    const deposits = dollarFund.deposits;
    if (deposits != null) {
      if (!Array.isArray(deposits)) {
        errors.push('dollarFund.deposits חייב להיות מערך');
      } else {
        for (const d of deposits) {
          if (typeof d?.amountUsd !== 'number' || d.amountUsd < 0)
            errors.push(`dollarFund.deposits: amountUsd חייב להיות מספר אי-שלילי (${JSON.stringify(d)})`);
          if (d?.date != null && !dateRe.test(d.date))
            errors.push(`dollarFund.deposits: date לא תקין (${d.date})`);
        }
      }
    }
    const redemptions = dollarFund.redemptions;
    const validTypes = ['research-travel', 'personal', 'retirement'];
    if (redemptions != null) {
      if (!Array.isArray(redemptions)) {
        errors.push('dollarFund.redemptions חייב להיות מערך');
      } else {
        for (const r of redemptions) {
          if (typeof r?.amountUsd !== 'number' || r.amountUsd < 0)
            errors.push(`dollarFund.redemptions: amountUsd חייב להיות מספר אי-שלילי (${JSON.stringify(r)})`);
          if (!validTypes.includes(r?.type))
            errors.push(`dollarFund.redemptions: type לא תקין (${r?.type})`);
          if (r?.date != null && !dateRe.test(r.date))
            errors.push(`dollarFund.redemptions: date לא תקין (${r.date})`);
        }
      }
    }
  }

  // ולידציה attendanceParams (WP8.1 — QA #4)
  const ap = doc.settings?.national?.attendanceParams;
  if (ap) {
    if (typeof ap.fullDayHours !== 'number' || ap.fullDayHours <= 0)
      errors.push('attendanceParams.fullDayHours חייב להיות מספר חיובי');
    if (typeof ap.halfDayHours !== 'number' || ap.halfDayHours <= 0)
      errors.push('attendanceParams.halfDayHours חייב להיות מספר חיובי');
    if (!Array.isArray(ap.breakWindows))
      errors.push('attendanceParams.breakWindows חייב להיות מערך');
    // defaultBreakCode: null = ללא; מספר = אינדקס בתוך breakWindows
    if (ap.defaultBreakCode != null) {
      const bwLen = ap.breakWindows?.length ?? 0;
      if (!Number.isInteger(ap.defaultBreakCode) || ap.defaultBreakCode < 0 || ap.defaultBreakCode >= bwLen)
        errors.push(`attendanceParams.defaultBreakCode ${ap.defaultBreakCode} מחוץ לטווח breakWindows`);
    }
  }

  for (const m of (doc.months ?? [])) {
    if (!m.id || !/^\d{4}-\d{2}$/.test(m.id)) errors.push(`חודש עם id לא תקין: ${m.id}`);
    for (const d of (m.days ?? [])) {
      // שדות ידניים ישנים (legacy) — לא שליליים
      if ((d.regularHours ?? 0) < 0 || (d.overtimeHours ?? 0) < 0 || (d.zeroHours ?? 0) < 0) {
        errors.push(`שעות שליליות ביום ${d.date}`);
      }
      // breakCode (WP8.1) — null = ברירת מחדל; -1 = ללא ליום זה; ≥0 = אינדקס
      if (d.breakCode != null && d.breakCode !== -1) {
        const bwLen = ap?.breakWindows?.length ?? 0;
        if (!Number.isInteger(d.breakCode) || d.breakCode < 0 || (bwLen > 0 && d.breakCode >= bwLen))
          errors.push(`breakCode לא תקין ביום ${d.date}: ${d.breakCode}`);
      }
      // leave (WP8.3): { type, hours } — type חייב להיות מחרוזת מוכרת, hours ≥ 0
      if (d.leave) {
        const validTypes = ['vacation', 'sick', 'training'];
        if (!validTypes.includes(d.leave.type))
          errors.push(`leave.type לא תקין ביום ${d.date}: ${d.leave.type}`);
        if (typeof d.leave.hours !== 'number' || d.leave.hours < 0)
          errors.push(`leave.hours לא תקין ביום ${d.date}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

