/**
 * engine.test.js — בדיקות מנוע מול golden-cases.json
 * Input: golden-cases.json  Output: תוצאות PASS/FAIL בדפדפן (tests.html) + node --test
 * Deps: engine.js, attendance-hours.js, golden-cases.json
 *
 * סוגי מקרים:
 *   (ברירת מחדל)  — בדיקות מנוע שכר (calculate); סטייה ≤ ₪1
 *   type:"attendance" — בדיקות categorizeDay; סטייה ≤ 0.001 שעות + exact לבוליאנים
 *   type:"shortfall"  — בדיקות calcMonthlyShortfall; סטייה ≤ 0.001 שעות/%
 */

import { calculate, isActiveInMonth } from '../src/engine/engine.js';
import { categorizeDay } from '../src/engine/attendance-hours.js';
import { calcMonthlyShortfall } from '../src/engine/attendance-month.js';

const TOLERANCE      = 1;     // ₪ — סטייה מותרת בבדיקות שכר
const ATT_TOLERANCE  = 0.001; // שעות — סטייה מותרת בבדיקות קטגוריזציה

/** @type {Array} */
let goldenCases = [];

async function loadCases() {
  // QA #5: ב-Node — קרא מהמסלול מקובץ (fs); בדפדפן — fetch
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { resolve, dirname } = await import('node:path');
      const __dir = dirname(fileURLToPath(import.meta.url));
      const raw = readFileSync(resolve(__dir, 'golden-cases.json'), 'utf-8');
      goldenCases = JSON.parse(raw);
    } catch (err) {
      console.error('loadCases (node fs):', err.message);
      goldenCases = [];
    }
    return;
  }
  try {
    const res = await fetch('./test/golden-cases.json');
    goldenCases = await res.json();
  } catch {
    goldenCases = [];
  }
}

/**
 * מריץ בדיקות ומרנדר תוצאות ב-tests.html
 * @param {HTMLElement} resultsEl
 * @param {HTMLElement} summaryEl
 */
export async function runTests(resultsEl, summaryEl) {
  await loadCases();

  if (goldenCases.length === 0) {
    resultsEl.innerHTML = '<p style="color:orange">אין golden cases עדיין — יתווספו ב-WP0.2</p>';
    if (summaryEl) summaryEl.textContent = '';
    return;
  }

  let passed = 0, failed = 0;
  const rows = goldenCases.map(tc => {
    let checks;

    if (tc.type === 'shortfall') {
      // בדיקת calcMonthlyShortfall — חיסורים חודשיים (שעות/%)
      const result = calcMonthlyShortfall(tc.input.days, tc.input.params);
      const numFields = ['totalShortfall','coveredFromZero','coveredFromOT',
                         'coveredFromUnapproved','salaryCutHours','zeroUtilizationPct'];
      checks = numFields.map(f => {
        const expected = tc.expected[f] ?? null;
        if (expected === null) return { field: f, ok: true, diff: 0 };
        const diff = Math.abs((result[f] ?? 0) - expected);
        return { field: f, ok: diff <= ATT_TOLERANCE, diff, expected, got: result[f] };
      });
    } else if (tc.type === 'attendance') {
      // בדיקת categorizeDay — ניקוד שעות (לא ₪)
      const result = categorizeDay(tc.input.day, tc.input.params);
      const numFields  = ['regularPaid','zeroHours','unapprovedHours','overtimeHours','breakDeducted'];
      const boolFields = ['isFullDay','isHalfDay'];
      checks = [
        ...numFields.map(f => {
          const expected = tc.expected[f] ?? null;
          if (expected === null) return { field: f, ok: true, diff: 0 };
          const diff = Math.abs((result[f] ?? 0) - expected);
          return { field: f, ok: diff <= ATT_TOLERANCE, diff, expected, got: result[f] };
        }),
        ...boolFields.map(f => {
          const expected = tc.expected[f] ?? null;
          if (expected === null) return { field: f, ok: true, diff: 0 };
          const ok = result[f] === expected;
          return { field: f, ok, diff: ok ? 0 : 1, expected, got: result[f] };
        }),
      ];
    } else {
      // בדיקת calculate — שכר (₪)
      const result = calculate({
        national:  tc.input.national,
        personal:  tc.input.personal,
        month:     tc.input.month,
        reductions: tc.input.reductions,
      });
      const fields = ['gross', 'incomeTax', 'nationalInsurance', 'healthTax',
                      'pension', 'pension2', 'trainingFund', 'net', 'overtimePay',
                      'pensionBase', 'trainingFundBase', 'trainingComplement', 'niBase'];
      checks = fields.map(f => {
        const expected = tc.expected[f] ?? null;
        if (expected === null) return { field: f, ok: true, diff: 0 };
        const diff = Math.abs((result[f] ?? 0) - expected);
        return { field: f, ok: diff <= TOLERANCE, diff, expected, got: result[f] };
      });
    }

    const ok = checks.every(c => c.ok);
    if (ok) passed++; else failed++;

    const details = checks.filter(c => !c.ok)
      .map(c => `${c.field}: צפוי ${c.expected} קיבלנו ${c.got} (פער ${typeof c.diff === 'number' ? c.diff.toFixed(4) : c.diff})`)
      .join('; ');

    const tag = tc.type === 'attendance' ? ' <small>[נוכחות]</small>'
              : tc.type === 'shortfall'  ? ' <small>[חיסורים]</small>'
              : '';
    return `<tr>
      <td>${tc.id ?? '?'}${tag}</td>
      <td class="${ok ? 'pass' : 'fail'}">${ok ? 'PASS ✓' : 'FAIL ✗'}</td>
      <td>${details || '—'}</td>
    </tr>`;
  });

  resultsEl.innerHTML = `
    <table>
      <thead><tr><th>מזהה</th><th>תוצאה</th><th>פרטים</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;

  if (summaryEl) {
    summaryEl.className = failed > 0 ? 'fail' : 'pass';
    summaryEl.textContent = `${passed} עברו / ${failed} נכשלו מתוך ${goldenCases.length}`;
  }
}

// תמיכה ב-node --test
if (typeof process !== 'undefined' && process.env.NODE_TEST_CONTEXT) {
  const { describe, it } = await import('node:test');
  const assert = await import('node:assert/strict');
  await loadCases();
  describe('engine golden cases', () => {
    for (const tc of goldenCases.filter(t => !t.type)) {
      it(tc.id ?? 'case', () => {
        const result = calculate({ ...tc.input });
        for (const [field, expected] of Object.entries(tc.expected ?? {})) {
          const diff = Math.abs((result[field] ?? 0) - expected);
          assert.ok(diff <= TOLERANCE, `${field}: diff ${diff} > ${TOLERANCE}`);
        }
      });
    }
  });
  describe('attendance categorizeDay', () => {
    for (const tc of goldenCases.filter(t => t.type === 'attendance')) {
      it(tc.id ?? 'att-case', () => {
        const result = categorizeDay(tc.input.day, tc.input.params);
        for (const [field, expected] of Object.entries(tc.expected ?? {})) {
          if (typeof expected === 'boolean') {
            assert.strictEqual(result[field], expected, `${field}: expected ${expected} got ${result[field]}`);
          } else {
            const diff = Math.abs((result[field] ?? 0) - expected);
            assert.ok(diff <= ATT_TOLERANCE, `${field}: diff ${diff.toFixed(4)} > ${ATT_TOLERANCE}`);
          }
        }
      });
    }
  });
  describe('shortfall calcMonthlyShortfall', () => {
    for (const tc of goldenCases.filter(t => t.type === 'shortfall')) {
      it(tc.id ?? 'sf-case', () => {
        const result = calcMonthlyShortfall(tc.input.days, tc.input.params);
        for (const [field, expected] of Object.entries(tc.expected ?? {})) {
          const diff = Math.abs((result[field] ?? 0) - expected);
          assert.ok(diff <= ATT_TOLERANCE, `${field}: diff ${diff.toFixed(4)} > ${ATT_TOLERANCE}`);
        }
      });
    }
  });

  // WP10.11: customDeductions — ניכויים קבועים מותאמים-אישית (סקלר מסוכם כבר ב-UI)
  describe('calculate — customDeductions (WP10.11)', () => {
    const baseCase = goldenCases.find(t => !t.type);

    it('customDeductions=0 (ברירת מחדל) — netAfterReductions זהה למקרה ללא הפרמטר (regression guard)', () => {
      const withDefault = calculate({ ...baseCase.input });
      const withExplicitZero = calculate({ ...baseCase.input, customDeductions: 0 });
      assert.equal(withExplicitZero.netAfterReductions, withDefault.netAfterReductions);
      assert.equal(withDefault.netAfterReductions, withDefault.net, 'ללא reductions/aidFund/customDeductions, netAfterReductions === net');
    });

    it('customDeductions>0 — מנוכה במדויק מ-netAfterReductions (net עצמו לא משתנה)', () => {
      const without = calculate({ ...baseCase.input });
      const withCustom = calculate({ ...baseCase.input, customDeductions: 250 });
      assert.equal(withCustom.net, without.net, 'net (לפני הפחתות) לא אמור להשתנות');
      assert.ok(
        Math.abs((without.netAfterReductions - withCustom.netAfterReductions) - 250) < 0.01,
        `netAfterReductions צריך לרדת ב-250 בדיוק (ירד ב-${without.netAfterReductions - withCustom.netAfterReductions})`,
      );
    });

    it('customDeductions מצטרף לניכויים אחרים (reductions + aidFundRepayment) ללא הפרעה הדדית', () => {
      const result = calculate({
        ...baseCase.input,
        reductions: { fromRegular: 100, fromOvertime: 0, quarterlyBonus: 50, bonusDeduction: 0 },
        aidFundRepayment: 75,
        customDeductions: 60,
      });
      const expectedNetAfter = result.net - 100 + 50 - 75 - 60;
      assert.ok(Math.abs(result.netAfterReductions - expectedNetAfter) < 0.01);
    });
  });

  // WP10.11: isActiveInMonth — סינון טווח תאריכים ל-customDeductions ולהלוואות קרן עזרה
  describe('isActiveInMonth (WP10.11)', () => {
    it('פתוח-קצה (ללא startMonth/endMonth) — תמיד פעיל', () => {
      assert.equal(isActiveInMonth({}, '2026-01'), true);
      assert.equal(isActiveInMonth({ startMonth: null, endMonth: null }, '2099-12'), true);
    });

    it('בתוך הטווח — פעיל', () => {
      assert.equal(isActiveInMonth({ startMonth: '2026-03', endMonth: '2026-08' }, '2026-05'), true);
      assert.equal(isActiveInMonth({ startMonth: '2026-03', endMonth: '2026-08' }, '2026-03'), true, 'גבול תחתון כולל');
      assert.equal(isActiveInMonth({ startMonth: '2026-03', endMonth: '2026-08' }, '2026-08'), true, 'גבול עליון כולל');
    });

    it('לפני תחילת הטווח — לא פעיל', () => {
      assert.equal(isActiveInMonth({ startMonth: '2026-03', endMonth: '2026-08' }, '2026-02'), false);
    });

    it('אחרי סוף הטווח — לא פעיל', () => {
      assert.equal(isActiveInMonth({ startMonth: '2026-03', endMonth: '2026-08' }, '2026-09'), false);
    });

    it('רק startMonth (ללא endMonth) — פעיל מ-startMonth ואילך ללא הגבלה', () => {
      assert.equal(isActiveInMonth({ startMonth: '2026-03' }, '2026-02'), false);
      assert.equal(isActiveInMonth({ startMonth: '2026-03' }, '2026-03'), true);
      assert.equal(isActiveInMonth({ startMonth: '2026-03' }, '2099-01'), true);
    });

    it('רק endMonth (ללא startMonth) — פעיל עד endMonth כולל', () => {
      assert.equal(isActiveInMonth({ endMonth: '2026-08' }, '2000-01'), true);
      assert.equal(isActiveInMonth({ endMonth: '2026-08' }, '2026-08'), true);
      assert.equal(isActiveInMonth({ endMonth: '2026-08' }, '2026-09'), false);
    });
  });

  // 2026-07: רכיב "נטו-בלבד" (כל 4 ה-flags כבויים) אינו חלק מהתלוש — לא בברוטו ולא בנטו.
  // (כסף כזה, למשל מחקר דולרי, מנוהל בקרן הדולרית הנפרדת; researchDollar הוסר מהקטלוג.)
  describe('calculate — רכיב נטו-בלבד אינרטי (לא בברוטו, לא בנטו)', () => {
    const catalogCase = goldenCases.find(t => t.id === 'catalog-lookup-by-id');

    it('רכיב עם כל ה-flags false (inline) — לא משנה gross, net, ואף בסיס', () => {
      const without = calculate({ ...catalogCase.input });
      const withNetOnly = calculate({
        ...catalogCase.input,
        personal: {
          ...catalogCase.input.personal,
          earnings: [...catalogCase.input.personal.earnings,
            { id: 'fundDeposit', amount: 300, inTax: false, inNI: false, inPension: false, inTraining: false }],
        },
      });
      assert.equal(withNetOnly.gross, without.gross, 'רכיב נטו-בלבד לא נכנס לברוטו');
      assert.equal(withNetOnly.net, without.net, 'רכיב נטו-בלבד לא נכנס לנטו');
      assert.equal(withNetOnly.pensionBase, without.pensionBase);
      assert.equal(withNetOnly.trainingFundBase, without.trainingFundBase);
      assert.equal(withNetOnly.niBase, without.niBase);
      assert.equal(withNetOnly.incomeTax, without.incomeTax);
    });

    it('רכיב עם flag פעיל (phone, לא משפיע על תקרת קה"ש) עדיין נכנס ל-gross כרגיל (regression guard)', () => {
      const without = calculate({ ...catalogCase.input });
      const withMorePhone = calculate({
        ...catalogCase.input,
        personal: {
          ...catalogCase.input.personal,
          earnings: catalogCase.input.personal.earnings.map(e => e.id === 'phone' ? { ...e, amount: e.amount + 100 } : e),
        },
      });
      assert.ok(Math.abs((withMorePhone.gross - without.gross) - 100) < 0.01);
    });
  });

  // WP10.8: כוננות לפי יום נוכחות — standbyDayValue × presenceDays (ערוץ נפרד מרכיב duty הקבוע)
  describe('calculate — standbyDayValue per presence-day (WP10.8)', () => {
    const catalogCase = goldenCases.find(t => t.id === 'catalog-lookup-by-id');

    // ימים: 2 נוכחות מלאה, יום חלקי שהושלם מחופשה (נחשב נוכחות), יום חופשה טהור (לא נחשב),
    // יום השתלמות טהור (לא נחשב). ללא attendanceParams ב-national (כמו catalogCase) — enrichedDays
    // נשארים כמות שהם (אין categorizeDay), כך שהבדיקה מבודדת אך ורק את פילטר הנוכחות של WP10.8.
    const days = [
      { date: '2026-01-04', start: '08:00', end: '16:00' },                                   // נוכחות מלאה
      { date: '2026-01-05', start: '08:00', end: '16:00' },                                   // נוכחות מלאה
      { date: '2026-01-06', start: '08:00', end: '12:00', leave: { type: 'vacation', hours: 4 } }, // יום חלקי + הושלם מחופשה — נספר
      { date: '2026-01-07', leave: { type: 'vacation', hours: 8 } },                           // חופשה טהורה — לא נספר
      { date: '2026-01-08', leave: { type: 'training', hours: 8 } },                           // השתלמות (leave.type) — לא נספר
      { date: '2026-01-11', training: true },                                                  // השתלמות (דגל training) — לא נספר
    ];
    const EXPECTED_PRESENCE_DAYS = 3; // 04, 05, 06 בלבד

    it('regression guard: standbyDayValue נעדר/0 — gross/net/pensionBase/niBase זהים למקרה בלי הפרמטר', () => {
      const without = calculate({ ...catalogCase.input });
      const withZero = calculate({ ...catalogCase.input, personal: { ...catalogCase.input.personal, standbyDayValue: 0 }, month: { days } });
      const withAbsent = calculate({ ...catalogCase.input, month: { days } });
      assert.equal(withZero.gross, without.gross);
      assert.equal(withZero.net, without.net);
      assert.equal(withZero.pensionBase, without.pensionBase);
      assert.equal(withZero.niBase, without.niBase);
      assert.equal(withZero.trainingFundBase, without.trainingFundBase);
      assert.equal(withZero.standbyPay, 0);
      assert.equal(withAbsent.standbyPay, 0, 'standbyDayValue נעדר לגמרי מ-personal ⇒ standbyPay=0');
      assert.equal(withAbsent.gross, without.gross, 'ימי נוכחות בלי standbyDayValue לא אמורים לשנות gross');
    });

    it('presenceDays סופר נוכחות בפועל (כולל יום חלקי שהושלם מחופשה), לא היעדרות טהורה/השתלמות', () => {
      const result = calculate({ ...catalogCase.input, month: { days } });
      assert.equal(result.presenceDays, EXPECTED_PRESENCE_DAYS);
    });

    it('standbyPay = standbyDayValue × presenceDays, ונכנס ל-gross/pensionBase/niBase/incomeTax אך לא ל-trainingFundBase', () => {
      const STANDBY = 150;
      const without = calculate({ ...catalogCase.input, month: { days } });
      const withStandby = calculate({
        ...catalogCase.input,
        personal: { ...catalogCase.input.personal, standbyDayValue: STANDBY },
        month: { days },
      });
      const expectedStandbyPay = STANDBY * EXPECTED_PRESENCE_DAYS;

      assert.equal(withStandby.standbyPay, expectedStandbyPay);
      assert.ok(Math.abs((withStandby.gross - without.gross) - expectedStandbyPay) < 0.01,
        `gross צריך לעלות ב-${expectedStandbyPay} (עלה ב-${withStandby.gross - without.gross})`);
      assert.ok(Math.abs((withStandby.pensionBase - without.pensionBase) - expectedStandbyPay) < 0.01,
        'standbyPay צריך להיכנס ל-pensionBase (duty base-flags: inPension=true)');
      assert.ok(Math.abs((withStandby.niBase - without.niBase) - expectedStandbyPay) < 0.01,
        'standbyPay צריך להיכנס ל-niBase (duty base-flags: inNI=true)');
      assert.equal(withStandby.trainingFundBase, without.trainingFundBase,
        'standbyPay לא אמור להיכנס ל-trainingFundBase (duty base-flags: inTraining=false)');
      // מס הכנסה עולה כי taxableIncome עלה (duty base-flags: inTax=true) — לא בהכרח שווה בדיוק ל-STANDBY
      // בגלל מדרגות/נקודות זיכוי, אך אמור לעלות (לא נשאר זהה) כשהמדרגה השולית לא אפסית.
      assert.ok(withStandby.incomeTax >= without.incomeTax,
        'incomeTax לא אמור לרדת כש-standbyPay>0 (inTax=true)');
      assert.ok(withStandby.pension > without.pension, 'pension אמור לעלות (pensionBase גדל)');
    });
  });
}
