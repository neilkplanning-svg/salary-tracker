/**
 * engine.js — pipeline חישוב שכר ראשי (pure functions, ללא DOM/UI)
 * Input: { settings, month, reductions?, aidFundRepayment? }
 * Output: estimate — { gross, incomeTax, nationalInsurance, healthTax,
 *                      pension, pension2, pensionSavingsCredit, trainingFund, creditCredit,
 *                      net, netAfterReductions, overtimePay, pensionBase, trainingFundBase, niBase,
 *                      trainingComplement, standbyPay, presenceDays, computedAt, paramsSnapshot }
 * Deps: overtime.js, defaults.js
 *
 * שני מסלולי חישוב:
 *   NEW (earnings[]): אם personal.earnings אינו ריק — מחשב gross/bases מרכיבי שכר עם base-flags (WP2.4)
 *   LEGACY (baseSalary): אחרת — baseSalary+fixedAdditions+pensionBaseFactor (תאימות לאחור)
 *
 * תיעוד פורמולות מלא: docs/excel-formulas.md
 * ראו PRD §5.3 לפירוט כל שלב.
 */

import { calcOvertime } from './overtime.js';
import { resolveEarningFlags } from './defaults.js';
import { categorizeDay } from './attendance-hours.js';
import { calcMonthlyShortfall } from './attendance-month.js';

/**
 * חישוב מס הכנסה לפי מדרגות שולי (משחזר V6:V12 מהאקסל — excel-formulas.md §6),
 * בניכוי נקודות זיכוי ו"זיכוי חסכון" (סעיף 45א, WP8.8b — ראו §16 ל-calcPensionSavingsCredit).
 * @param {number} taxableIncome ₪/חודש (M18 = ברוטו + זקיפות)
 * @param {Array<{min:number,max:number,rate:number}>} brackets
 * @param {number} creditPointsQty כמות נקודות זיכוי
 * @param {number} creditPointValue ערך נקודת זיכוי (₪)
 * @param {number} [pensionSavingsCredit] זיכוי חסכון מחושב (ראו calcPensionSavingsCredit) — WP8.8b
 * @returns {number} מס לאחר ניכוי נקודות זיכוי + זיכוי חסכון (לא קטן מ-0)
 */
export function calcIncomeTax(taxableIncome, brackets, creditPointsQty, creditPointValue, pensionSavingsCredit = 0) {
  let tax = 0;
  brackets.forEach(b => {
    const slice = Math.max(0, Math.min(taxableIncome - b.min, b.max - b.min));
    tax += slice * b.rate;
  });
  const credit = creditPointsQty * creditPointValue + pensionSavingsCredit;
  return Math.max(0, tax - credit);
}

/**
 * "זיכוי חסכון" (סעיף 45א) — 35% מהפקדת העובד לפנסיה (עיקרית+שנייה), עד תקרה חודשית.
 * מכויל מול קורפוס תלושי 01–05/26 (יציב על פני 2023/2025/2026: ₪237.65/חודש בפועל ב-2025–2026,
 * תקרה מקבילה שונה מעט ב-2023) — מחליף את מנגנון "מדרגה ראשונה דינמית" (V33) הישן; ראו
 * excel-formulas.md §16/OI-08 להסבר המלא ולפער השייר (~₪20–30/חודש מול תלוש אמיתי, בשל שיטת
 * הניכוי המצטברת-שנתית שהמנוע החד-חודשי אינו משחזר — כלל ה-snapshot #6 ב-CLAUDE.md).
 * @param {number} pensionDeposit סה"כ הפקדת עובד לפנסיה (עיקרית + שנייה, ₪/חודש)
 * @param {number} rate שיעור הזיכוי (0.35)
 * @param {number} cap תקרת ההפקדה המזכה (₪/חודש)
 * @returns {number} זיכוי חסכון (₪)
 */
export function calcPensionSavingsCredit(pensionDeposit, rate, cap) {
  return rate * Math.min(pensionDeposit, cap);
}

/**
 * בודק אם פריט עם טווח חודשים אופציונלי (startMonth/endMonth, 'YYYY-MM') פעיל בחודש נתון.
 * חסר startMonth/endMonth = פתוח-קצה באותו כיוון (תמיד פעיל). השוואה מחרוזתית לקסיקוגרפית
 * תקינה לפורמט 'YYYY-MM' (WP10.11 — סינון תאריכים ל-customDeductions ולהלוואות קרן עזרה).
 * @param {{startMonth?: string, endMonth?: string}} item
 * @param {string} monthId 'YYYY-MM'
 * @returns {boolean}
 */
export function isActiveInMonth(item, monthId) {
  const start = item?.startMonth ?? null;
  const end   = item?.endMonth   ?? null;
  return (!start || monthId >= start) && (!end || monthId <= end);
}

/**
 * חישוב מדורג כללי (ב"ל / מס בריאות)
 * @param {number} income
 * @param {Array<{min:number,max:number,rate:number}>} bands
 * @returns {number}
 */
export function calcBanded(income, bands) {
  let total = 0;
  for (const { min, max, rate } of bands) {
    const slice = Math.max(0, Math.min(income - min, max - min));
    total += slice * rate;
  }
  return total;
}

/**
 * חישוב שכר מלא לחודש נתון
 * @param {object} params
 * @param {object} params.national  — settings.national
 * @param {object} params.personal  — settings.personal
 * @param {object} params.month     — { days: [] } (רשת ימים)
 * @param {object} [params.reductions] — temporaryReductions לחודש זה (אופציונלי)
 * @param {number} [params.aidFundRepayment] — החזר קרן עזרה חודשי (₪)
 * @param {number} [params.customDeductions] — סה"כ ניכויים קבועים מותאמים-אישית הפעילים לחודש זה
 *   (WP10.11; מסוכם כבר ב-UI לפי טווח startMonth/endMonth — המנוע אינו עושה לוגיקת תאריכים).
 *   ברירת מחדל 0 — אינו משפיע על golden cases קיימים.
 * @returns {object} estimate
 */
export function calculate({ national, personal, month, reductions = null, aidFundRepayment = 0, customDeductions = 0 }) {

  // === שותף: שעות + השלמת חיסורים חודשית (WP8.2) ===
  // כשיש attendanceParams + ימים עם start/end — מחשב kategorizeDay ומפעיל רדוסר חיסורים.
  // אחרת (מצב ידני / golden cases ישנים) — נופל לסיכום שדות ידניים ללא שינוי.
  const attParams    = national.attendanceParams ?? null;
  const rawDays      = month.days ?? [];
  const enrichedDays = attParams
    ? rawDays.map(d => {
        if (d.start && d.end) {
          const cat = categorizeDay(
            { start: d.start, end: d.end, breakCode: d.breakCode ?? null, dow: _dayDow(d.date) },
            attParams,
          );
          return { ...d, ...cat };
        }
        return d;
      })
    : rawDays;

  const hasComputedDays = enrichedDays.some(d => d.presenceInQuota != null);
  const shortfall = (attParams && hasComputedDays)
    ? calcMonthlyShortfall(enrichedDays, attParams)
    : { coveredFromZero: 0, coveredFromOT: 0, coveredFromUnapproved: 0, salaryCutHours: 0, zeroUtilizationPct: 0 };

  const totalOT      = enrichedDays.reduce((s, d) => s + (d.overtimeHours ?? 0), 0);
  const adjustedOT   = Math.max(0, totalOT - shortfall.coveredFromOT);
  const overtimeDays = enrichedDays.filter(d => (d.overtimeHours ?? 0) > 0).length;

  // === שותף: כוננות (WP10.8) — מוענקת על כל יום נוכחות בפועל, כולל יום חלקי שהושלם בחופשה/מחלה,
  // אך לא על יום היעדרות טהור (חופשה/מחלה/השתלמות ללא נוכחות בפועל) — excel-formulas.md §17.
  // standbyDayValue=0 (ברירת מחדל) → standbyPay=0, ללא השפעה על golden cases קיימים.
  const presenceDays = enrichedDays.filter(d => d.start != null && d.leave?.type !== 'training' && !d.training).length;
  const standbyPay   = (personal.standbyDayValue ?? 0) * presenceDays;
  const otCap        = month.overtimeApprovedCap;
  const approvedOT   = (otCap != null) ? Math.min(adjustedOT, otCap) : adjustedOT;
  const overtimePay  = calcOvertime({
    overtimeHours:   approvedOT,
    overtimeDays,
    overtimeHourValue: personal.overtimeHourValue,
    rules:           national.overtimeRules,
    special:         month.overtimeSpecial ?? {},
  });

  // === שותף: רכב ===
  const car           = personal.car ?? null;
  const carAllowance  = (car && !car.hasCompanyCar) ? (car.allowance  ?? 0) : 0;
  const carImputation = (car &&  car.hasCompanyCar) ? (car.imputation ?? 0) : 0;

  // === שותף: גילומים וניכויים ===
  const imputations          = personal.imputations ?? [];
  const taxableImputations   = imputations.reduce((s, i) => s + (i.taxable  ? i.amount : 0), 0);
  const nonTaxableImputation = imputations.reduce((s, i) => s + (!i.taxable ? i.amount : 0), 0);
  const otherDeductions      = (personal.otherDeductions ?? []).reduce((s, d) => s + d.amount, 0);

  // === שותף: פנסיה שנייה על נלווים (OI-07, WP8.8b) ===
  // קרן/ביטוח נוסף על "ברוטו מבוטח נלווה" (למשל כוננות/ש"נ) — נפרד מבסיס הפנסיה העיקרי.
  // ancillaryPensionBase=0 (ברירת מחדל) → pension2=0, ללא השפעה על משתמשים שלא הזינו אותו.
  const ancillaryPensionBase = personal.ancillaryPensionBase ?? 0;
  const pension2             = ancillaryPensionBase * (personal.pensionRateEmployee2 ?? 0.07);

  // === בחירת מסלול ===
  // מסלול earnings פעיל אם יש לפחות רכיב אחד עם סכום ≠ 0 (קטלוג קבוע נטען עם אפסים — שלד ריק
  // לא אמור להפעיל אותו כדי שלא לדרוס golden cases legacy שאין להם earnings).
  const earningsList = Array.isArray(personal.earnings) ? personal.earnings : [];
  const hasEarnings  = earningsList.some(e => (e.amount ?? 0) !== 0);

  let gross, taxableIncome, pension, trainingFund;
  let incomeTax, creditCredit, nationalInsurance, healthTax, net, pensionSavingsCredit;
  let pensionBase, trainingFundBase, niBase, trainingComplement;

  if (hasEarnings) {
    // =====================================================================
    // NEW PATH — earnings[] גנרי עם base-flags (WP2.4, נק' 3+5+6)
    // כל רכיב: { label, amount, inTax, inNI, inPension, inTraining }
    // =====================================================================

    // זוקפים flags מהקטלוג (resolveEarningFlags): inline אם קיים, אחרת lookup לפי id
    const earn    = earningsList.map(e => ({ ...e, _flags: resolveEarningFlags(e) }));
    const sumFlag = flag => earn.filter(e => e._flags[flag]).reduce((s, e) => s + (e.amount ?? 0), 0);

    // רכיבים עם כל ה-flags כבויים (למשל researchDollar) הם "נטו-בלבד" — אינם חלק מהברוטו
    // (לא חייבים מס/ב"ל/פנסיה/קה"ש); מתווספים ישירות לנטו אחרי הניכויים (excel-formulas.md §שיוך לבסיסים).
    const isNetOnly       = f => !f.inTax && !f.inNI && !f.inPension && !f.inTraining;
    const netOnlyAmount   = earn.filter(e => isNetOnly(e._flags)).reduce((s, e) => s + (e.amount ?? 0), 0);
    const grossFromEarnings = earn.filter(e => !isNetOnly(e._flags)).reduce((s, e) => s + (e.amount ?? 0), 0);
    pensionBase      = sumFlag('inPension');
    trainingFundBase = sumFlag('inTraining');

    // תקרת קרן השתלמות (נק' 6)
    const depositAboveCap = personal.trainingFundDepositAboveCap ?? false;
    const cap             = national.trainingFundCap;
    const employerRate    = national.trainingFundRateEmployer ?? 0.075;

    if (trainingFundBase <= cap || depositAboveCap) {
      // מתחת לתקרה, או מפקיד מעבר לתקרה — % מהבסיס כולו
      trainingFund       = trainingFundBase * personal.trainingFundRateEmployee;
      trainingComplement = 0;
    } else {
      // מעל תקרה ולא מפקיד: עובד על תקרה; חלק מעסיק מעל תקרה → הכנסה חייבת (excel-formulas.md §10)
      trainingFund       = cap * personal.trainingFundRateEmployee;
      trainingComplement = (trainingFundBase - cap) * employerRate;
    }

    // ברוטו כולל תוספת רכב, ש"נ, השלמת קה"ש, וכוננות (WP10.8 — לא בבסיס קה"ש, ראו trainingFundBase לעיל)
    gross = grossFromEarnings + carAllowance + overtimePay + trainingComplement + standbyPay;

    // רכב חייב במס/ב"ל (לא בפנסיה/קה"ש): תוספת מזומן או שווי גילום רכב חברה (אחד מהם תמיד 0)
    const carTaxable = carAllowance + carImputation;
    // בסיס לב"ל/בריאות: רכיבי inNI + רכב + זקיפות + ש"נ + השלמת קה"ש + כוננות
    niBase        = sumFlag('inNI')  + carTaxable + taxableImputations + overtimePay + trainingComplement + standbyPay;
    taxableIncome = sumFlag('inTax') + carTaxable + taxableImputations + overtimePay + trainingComplement + standbyPay;

    // בסיס פנסיה כולל כוננות (duty base-flags: inPension=true) — לא בסיס קה"ש (inTraining=false)
    pensionBase          = pensionBase + standbyPay;
    pension              = pensionBase * personal.pensionRateEmployee;
    pensionSavingsCredit = calcPensionSavingsCredit(pension + pension2, national.pensionSavingsCreditRate ?? 0.35, national.pensionSavingsCreditCap ?? 679);

    incomeTax    = calcIncomeTax(taxableIncome, national.incomeTaxBrackets, personal.creditPointsQty, national.creditPointValue, pensionSavingsCredit);
    creditCredit = personal.creditPointsQty * national.creditPointValue;

    // ב"ל ובריאות על niBase (לא taxableIncome, כי ייתכן הבדל אם inNI ≠ inTax)
    nationalInsurance = calcBanded(niBase, national.nationalInsuranceBands);
    healthTax         = calcBanded(niBase, national.healthTaxBands);

    net = gross - incomeTax - nationalInsurance - healthTax - pension - pension2 - trainingFund - otherDeductions - nonTaxableImputation + netOnlyAmount;

  } else {
    // =====================================================================
    // LEGACY PATH — baseSalary + fixedAdditions + pensionBaseFactor
    // תאימות לאחור: golden cases קיימים, משתמשים שטרם עברו למודל החדש
    // =====================================================================

    const { baseConst, perHourConst } = personal.baseSalary;
    const adjustFactor   = personal.baseSalary.adjustFactor ?? 1; // הוסר מה-UI (WP2.3 נק' 4)
    const positionFactor = personal.positionPercent / 100;
    const basePay        = (baseConst + perHourConst * positionFactor) * adjustFactor;

    const fixedAdd = (personal.fixedAdditions?.phone ?? 0) + (personal.fixedAdditions?.other ?? 0);
    gross = basePay + fixedAdd + carAllowance + overtimePay;

    const imputationTotal = taxableImputations + carImputation;
    taxableIncome = gross + imputationTotal;

    // פנסיה: ברוטו × גורם (excel-formulas.md §9, OI-03)
    const pensionBaseFactor = personal.pensionBaseFactor ?? 1;
    pension              = personal.pensionRateEmployee * gross * pensionBaseFactor;
    trainingFund         = personal.trainingFundRateEmployee * Math.min(gross, national.trainingFundCap);
    pensionSavingsCredit = calcPensionSavingsCredit(pension + pension2, national.pensionSavingsCreditRate ?? 0.35, national.pensionSavingsCreditCap ?? 679);

    incomeTax    = calcIncomeTax(taxableIncome, national.incomeTaxBrackets, personal.creditPointsQty, national.creditPointValue, pensionSavingsCredit);
    creditCredit = personal.creditPointsQty * national.creditPointValue;

    // ב"ל ובריאות על taxableIncome (M18 — כולל זקיפות, OI-01)
    nationalInsurance = calcBanded(taxableIncome, national.nationalInsuranceBands);
    healthTax         = calcBanded(taxableIncome, national.healthTaxBands);

    net = gross - incomeTax - nationalInsurance - healthTax - pension - pension2 - trainingFund - otherDeductions - nonTaxableImputation;

    // ערכי בסיס משוערים עבור legacy path (לתצוגה)
    pensionBase      = gross * pensionBaseFactor;
    trainingFundBase = gross; // לפני תקרה
    niBase           = taxableIncome;
    trainingComplement = 0;
  }

  // === שלב 11: נטו לאחר הפחתות ===
  const redFromRegular  = reductions?.fromRegular   ?? 0;
  const redFromOvertime = reductions?.fromOvertime   ?? 0;
  const quarterlyBonus  = reductions?.quarterlyBonus ?? 0;
  const bonusDeduction  = reductions?.bonusDeduction ?? 0;
  const netAfterReductions = net - redFromRegular - redFromOvertime + quarterlyBonus - bonusDeduction - aidFundRepayment - customDeductions;

  return {
    gross:              round2(gross),
    overtimePay:        round2(overtimePay),
    standbyPay:         round2(standbyPay),
    presenceDays,
    incomeTax:          round2(incomeTax),
    creditCredit:       round2(creditCredit),
    nationalInsurance:  round2(nationalInsurance),
    healthTax:          round2(healthTax),
    pension:            round2(pension),
    pension2:           round2(pension2),
    pensionSavingsCredit: round2(pensionSavingsCredit),
    trainingFund:       round2(trainingFund),
    otherDeductions:    round2(otherDeductions),
    net:                round2(net),
    netAfterReductions: round2(netAfterReductions),
    // שדות בסיס — NEW (WP2.4)
    pensionBase:        round2(pensionBase),
    trainingFundBase:   round2(trainingFundBase),
    trainingComplement: round2(trainingComplement ?? 0),
    niBase:             round2(niBase),
    overtimeApprovedHours: round2(approvedOT),
    // WP8.2: נתוני השלמת חיסורים חודשית
    shortfallComputed:     hasComputedDays,
    salaryCutHours:        round2(shortfall.salaryCutHours),
    coveredFromOT:         round2(shortfall.coveredFromOT),
    coveredFromZero:       round2(shortfall.coveredFromZero),
    coveredFromUnapproved: round2(shortfall.coveredFromUnapproved),
    zeroUtilizationPct:    round2(shortfall.zeroUtilizationPct),
    computedAt:         new Date().toISOString(),
    paramsSnapshot:     { national, personal },
  };
}

function _dayDow(dateStr) {
  if (!dateStr) return 0;
  return new Date(dateStr + 'T12:00:00Z').getDay();
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
