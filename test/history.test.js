/**
 * history.test.js — computeYearSummaries: actual-first עם נפילה חזרה למשוער (WP10.1)
 * Input: state.months (estimate/actual)  Output: PASS/FAIL תחת node --test
 * Deps: history.js
 *
 * רקע: computeYearSummaries סיכם בעבר רק את estimate, גם כשהוזן תלוש בפועל, ובנוסף
 * קרא את המענק הרבעוני מ-state.temporaryReductions (מערך שאף מסך לא כותב אליו) במקום
 * מ-month.reductions.quarterlyBonus (ראו src/ui/reductions.js). ראו docs/data-schema.md.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATE } from '../src/model/schema.js';
import { computeYearSummaries } from '../src/ui/history.js';

function monthDoc(id, { estimate, actual, reductions } = {}) {
  return { id, days: [], estimate: estimate ?? null, actual: actual ?? null, reductions: reductions ?? null };
}

test('computeYearSummaries — actual גובר על estimate כששניהם קיימים', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000 },
    actual:   { gross: 10500, net: 8200 },
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.totalGross, 10500);
  assert.equal(summary.totalNet, 8200);
});

test('computeYearSummaries — נופל חזרה ל-estimate כש-actual חסר לגמרי', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000 },
    actual: null,
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.totalGross, 10000);
  assert.equal(summary.totalNet, 8000);
});

test('computeYearSummaries — נפילה per-field: actual.net קיים, actual.gross null → gross מ-estimate, net מ-actual', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000 },
    actual:   { gross: null, net: 8300 }, // כפי שנשמר כשהוזן רק שדה net (ראו actual.js parse())
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.totalGross, 10000); // מ-estimate, כי actual.gross === null
  assert.equal(summary.totalNet, 8300);    // מ-actual
});

test('computeYearSummaries — מענקים מ-actual.bonuses בלבד (WP12.5: reductions.quarterlyBonus הוסר)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000 },
    actual: { gross: 10000, net: 8000, bonuses: 1200 },
    // reductions.quarterlyBonus כבר לא נספר (הטופס הוסר) — נוודא שהוא מתעלם
    reductions: { fromRegular: 0, fromOvertime: 0, quarterlyBonus: 1500, bonusDeduction: 0 },
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.bonusesGross, 1200); // רק actual.bonuses, לא ה-1500 של quarterlyBonus
});

// WP10.6 — manualYearSummaries: שנים היסטוריות ללא חודשים מתועדים, הזנה חלקית, derived גובר

test('computeYearSummaries — שנה ידנית-בלבד (ללא months) מופיעה עם source:"manual" ושדות חלקיים', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.manualYearSummaries = { '2019': { totalNet: 90000, monthsCount: 12 } };

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.year, 2019);
  assert.equal(summary.source, 'manual');
  assert.equal(summary.totalNet, 90000);
  assert.equal(summary.avgMonthlyNet, 7500); // 90000 / 12
  assert.equal(summary.totalGross, undefined); // לא הוזן — נשאר ריק, לא 0
  assert.equal(summary.avgMonthlyGross, undefined); // אין totalGross → אין ממוצע
  assert.equal(summary.bonusesGross, undefined);
});

test('computeYearSummaries — שנה עם months נשארת derived גם כשיש לה גם manualYearSummaries (derived גובר)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', { estimate: { gross: 10000, net: 8000 } }));
  doc.manualYearSummaries = { '2026': { totalGross: 999999, totalNet: 999999 } };

  const summaries = computeYearSummaries(doc);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].source, 'derived');
  assert.equal(summaries[0].totalGross, 10000); // מה-months, לא מה-manual
  assert.equal(summaries[0].totalNet, 8000);
});

test('computeYearSummaries — שנה ללא ממוצע כש-monthsCount לא הוזן, גם אם total קיים', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.manualYearSummaries = { '2018': { totalGross: 120000 } };

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.totalGross, 120000);
  assert.equal(summary.avgMonthlyGross, undefined);
});

test('computeYearSummaries — ממזג שנים derived וmanual יחד, ממוין עולה, וincomeChangePct מחושב ביחס לשנה הקודמת ברשימה הממוזגת', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.manualYearSummaries = { '2019': { totalGross: 100000 } };
  doc.months.push(monthDoc('2020-01', { estimate: { gross: 120000, net: 90000 } }));

  const summaries = computeYearSummaries(doc);
  assert.deepEqual(summaries.map(s => s.year), [2019, 2020]);
  assert.equal(summaries[0].source, 'manual');
  assert.equal(summaries[1].source, 'derived');
  // 2020 גדל מ-100000 ל-120000 → +20%
  assert.equal(Math.round(summaries[1].incomeChangePct * 100), 20);
});

// WP10.7 — additionsGross: Σ רכיבי earnings שאינם 'base' + overtimePay + רכב, מ-estimate.paramsSnapshot
// השמור בלבד (כלל #6 — אין חישוב מחדש); bonusesGross נשאר כפי שהיה (Σ actual.bonuses + quarterlyBonus).

test('computeYearSummaries — additionsGross מסכם רכיבי earnings לא-base (כוננות/טלפון) + overtimePay + רכב מ-snapshot שמור', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: {
      gross: 15000,
      net: 11000,
      overtimePay: 800,
      paramsSnapshot: {
        national: {},
        personal: {
          earnings: [
            { id: 'base', amount: 10000 },       // group: base — לא נכלל
            { id: 'duty', amount: 500 },          // group: add — נכלל
            { id: 'phone', amount: 200 },         // group: add — נכלל
            { id: 'researchDollar', amount: 300 }, // group: special — נכלל
          ],
          car: { hasCompanyCar: false, allowance: 400 }, // תוספת רכב במזומן — נכלל
        },
      },
    },
  }));

  const [summary] = computeYearSummaries(doc);
  // 500 (duty) + 200 (phone) + 300 (researchDollar) + 800 (overtimePay) + 400 (car) = 2200
  assert.equal(summary.additionsGross, 2200);
});

test('computeYearSummaries — additionsGross מתעלם מתוספת רכב כש-hasCompanyCar=true (רכב חברה, לא תוספת מזומן)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: {
      gross: 15000, net: 11000, overtimePay: 0,
      paramsSnapshot: {
        national: {},
        personal: {
          earnings: [{ id: 'base', amount: 10000 }, { id: 'duty', amount: 500 }],
          car: { hasCompanyCar: true, allowance: 0, imputation: 700 },
        },
      },
    },
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.additionsGross, 500); // רק duty; רכב חברה אינו "תוספת" במזומן
});

test('computeYearSummaries — additionsGross מסכם על פני כמה חודשים באותה שנה', () => {
  const doc = structuredClone(EMPTY_STATE);
  const snap = amount => ({
    gross: 10000, net: 8000, overtimePay: 100,
    paramsSnapshot: { national: {}, personal: { earnings: [{ id: 'duty', amount }] } },
  });
  doc.months.push(monthDoc('2026-01', { estimate: snap(300) }));
  doc.months.push(monthDoc('2026-02', { estimate: snap(400) }));

  const [summary] = computeYearSummaries(doc);
  // חודש 1: 300+100=400, חודש 2: 400+100=500 → 900
  assert.equal(summary.additionsGross, 900);
});

test('computeYearSummaries — additionsGross סופר overtimePay גם כש-paramsSnapshot.personal ריק/חסר (legacy snapshot ישן)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000, overtimePay: 300, paramsSnapshot: {} }, // legacy — ללא personal
  }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.additionsGross, 300); // overtimePay נספר גם בלי snapshot.personal
});

test('computeYearSummaries — additionsGross הוא 0 (לא undefined) לשנה derived כש-estimate חסר', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', { estimate: null, actual: { gross: 10000, net: 8000 } }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.source, 'derived');
  assert.equal(summary.additionsGross, 0);
});

test('computeYearSummaries — additionsGross הוא undefined (ריק) לשנה ידנית-בלבד — אין snapshot לקרוא ממנו', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.manualYearSummaries = { '2019': { totalGross: 100000, totalNet: 80000, bonusesGross: 5000 } };

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.source, 'manual');
  assert.equal(summary.additionsGross, undefined);
  assert.equal(summary.bonusesGross, 5000); // בונוסים ידניים — כרגיל, לא חסום
});

// ─── WP13.3 — אחוז משרה, מענקים (ממוצע + שינוי), ושנה ראשונה ללא "0%" מטעה ───

test('WP13.3 — avgPositionPct מ-snapshot מחושב רק על חודשים שיש בהם ערך (לא משלים 100 לחודש חסר)', () => {
  const doc = structuredClone(EMPTY_STATE);
  const withPos = pct => ({
    gross: 10000, net: 8000,
    paramsSnapshot: { national: {}, personal: { positionPercent: pct } },
  });
  doc.months.push(monthDoc('2026-01', { estimate: withPos(120) }));
  doc.months.push(monthDoc('2026-02', { estimate: withPos(80) }));
  doc.months.push(monthDoc('2026-03', { estimate: { gross: 10000, net: 8000 } })); // ללא snapshot

  const [summary] = computeYearSummaries(doc);
  // ממוצע על שני החודשים בלבד: (120+80)/2 = 100. הקוד הישן היה מחשב (120+80+100)/3 = 100 במקרה,
  // אבל (120+80+100)/3 שונה מ-(120+80)/2 בכל מקרה שאינו סימטרי — ראו הבדיקה הבאה.
  assert.equal(summary.avgPositionPct, 100);
  assert.equal(summary.positionSource, 'snapshot');
});

test('WP13.3 — חודש ללא snapshot אינו נספר כ-100% (הטיה שתוקנה)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000, paramsSnapshot: { national: {}, personal: { positionPercent: 50 } } },
  }));
  doc.months.push(monthDoc('2026-02', { estimate: { gross: 10000, net: 8000 } }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.avgPositionPct, 50); // ולא (50+100)/2 = 75
});

test('WP13.3 — avgPositionPct נופל ל-positionPctByYear כשאין ולו snapshot אחד, ומסומן source:"manual"', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2019-01', { actual: { gross: 10000, net: 8000 } }));
  doc.positionPctByYear = { '2019': 111.37 };

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.avgPositionPct, 111.37);
  assert.equal(summary.positionSource, 'manual');
});

test('WP13.3 — snapshot גובר על positionPctByYear כששניהם קיימים', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', {
    estimate: { gross: 10000, net: 8000, paramsSnapshot: { national: {}, personal: { positionPercent: 90 } } },
  }));
  doc.positionPctByYear = { '2026': 111.37 };

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.avgPositionPct, 90);
  assert.equal(summary.positionSource, 'snapshot');
});

test('WP13.3 — avgPositionPct הוא undefined (—) כשאין לא snapshot ולא ערך שנתי', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2019-01', { actual: { gross: 10000, net: 8000 } }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.avgPositionPct, undefined);
  assert.equal(summary.positionSource, null);
});

test('WP13.3 — avgMonthlyBonuses מחלק במספר החודשים המתועדים', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', { actual: { gross: 10000, net: 8000, bonuses: 1200 } }));
  doc.months.push(monthDoc('2026-02', { actual: { gross: 10000, net: 8000, bonuses: 0 } }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.bonusesGross, 1200);
  assert.equal(summary.avgMonthlyBonuses, 600); // 1200 / 2 חודשים, לא / 12
});

test('WP13.3 — bonusesChangePct מול השנה הקודמת', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2025-01', { actual: { gross: 10000, net: 8000, bonuses: 2000 } }));
  doc.months.push(monthDoc('2026-01', { actual: { gross: 10000, net: 8000, bonuses: 3000 } }));

  const summaries = computeYearSummaries(doc);
  assert.equal(summaries[0].bonusesChangePct, undefined); // שנה ראשונה — אין בסיס
  assert.equal(Math.round(summaries[1].bonusesChangePct * 100), 50); // 2000 → 3000 = +50%
});

test('WP13.3 — bonusesChangePct הוא undefined כשלשנה הקודמת אין מענקים כלל (אין חלוקה ב-0)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2025-01', { actual: { gross: 10000, net: 8000, bonuses: 0 } }));
  doc.months.push(monthDoc('2026-01', { actual: { gross: 10000, net: 8000, bonuses: 3000 } }));

  const summaries = computeYearSummaries(doc);
  assert.equal(summaries[1].bonusesChangePct, undefined); // ולא Infinity ולא 0
});

test('WP13.3 — שנה ראשונה: incomeChangePct/netChangePct הם undefined ולא 0 (לא להציג "0%" מטעה)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push(monthDoc('2026-01', { actual: { gross: 10000, net: 8000 } }));

  const [summary] = computeYearSummaries(doc);
  assert.equal(summary.incomeChangePct, undefined);
  assert.equal(summary.netChangePct, undefined);
});
