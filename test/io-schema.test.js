/**
 * io-schema.test.js — round-trip JSON (ייצוא→ייבוא) + ולידציית schema (WP5.1)
 * Input: EMPTY_STATE + מסמך מלא עם שדות סבב 2  Output: PASS/FAIL תחת node --test
 * Deps: schema.js
 *
 * מכסה את קריטריון הקבלה "round-trip ללא אובדן נתונים" ברמת הלוגיקה הטהורה
 * (JSON.stringify/parse). זרימת ה-UI המלאה (input[type=file], Blob, כפתורים)
 * נבדקת ידנית ב-Claude_Preview — ראו docs/architecture.md יומן ההחלטות.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATE, validate } from '../src/model/schema.js';

test('round-trip JSON — EMPTY_STATE זהה ותקין אחרי ייצוא/ייבוא', () => {
  const roundTripped = JSON.parse(JSON.stringify(EMPTY_STATE));
  assert.deepEqual(roundTripped, EMPTY_STATE);
  assert.equal(validate(roundTripped).valid, true);
});

test('round-trip JSON — מסמך מלא עם שדות סבב 2 (breakCode/leave/imputations/inflationByYear)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.months.push({
    id: '2026-05',
    days: [
      { date: '2026-05-04', start: 7, end: 17.5, breakCode: 0, leave: { type: 'vacation', hours: 8 } },
    ],
    estimate: {
      gross: 20000, net: 15000, overtimePay: 500,
      computedAt: new Date().toISOString(),
      paramsSnapshot: { national: doc.settings.national, personal: doc.settings.personal },
    },
  });
  doc.settings.personal.earnings[0].amount = 15000;
  doc.settings.personal.imputations[0].amount = 500;
  doc.inflationByYear = { 2025: 0.031 };

  const roundTripped = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(roundTripped, doc);
  const { valid, errors } = validate(roundTripped);
  assert.equal(valid, true, errors.join(', '));
});

test('validate() דוחה settings.national/personal פגומים (ייבוא קובץ שגוי)', () => {
  const bad = { ...EMPTY_STATE, settings: { national: {}, personal: {} } };
  const { valid, errors } = validate(bad);
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

test('validate() דוחה schemaVersion שגוי', () => {
  const bad = { ...EMPTY_STATE, schemaVersion: 999 };
  const { valid, errors } = validate(bad);
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.includes('schemaVersion')));
});

// WP10.11: customDeductions — ניכויים קבועים מותאמים-אישית עם טווח חודשים אופציונלי
test('round-trip JSON — customDeductions עם ורק startMonth/endMonth תקינים', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.customDeductions = [
    { id: 'a', label: 'חברות בוועד', amount: 50 },                              // פתוח-קצה
    { id: 'b', label: 'הלוואה', amount: 300, startMonth: '2026-03', endMonth: '2026-08' },
  ];
  const roundTripped = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(roundTripped, doc);
  const { valid, errors } = validate(roundTripped);
  assert.equal(valid, true, errors.join(', '));
});

test('validate() דוחה customDeductions לא תקין (label חסר / amount שלילי / startMonth בפורמט שגוי)', () => {
  const bad1 = { ...structuredClone(EMPTY_STATE), customDeductions: [{ amount: 10 }] };
  assert.equal(validate(bad1).valid, false);

  const bad2 = { ...structuredClone(EMPTY_STATE), customDeductions: [{ label: 'x', amount: -5 }] };
  assert.equal(validate(bad2).valid, false);

  const bad3 = { ...structuredClone(EMPTY_STATE), customDeductions: [{ label: 'x', amount: 10, startMonth: '2026/03' }] };
  assert.equal(validate(bad3).valid, false);
});

// WP10.10: קרן דולרית — מעקב עצמאי (deposits/redemptions) + כללים ניתנים לעריכה (dollarFundRules)
test('round-trip JSON — dollarFund עם הפקדות ופדיונות תקינים (כל סוגי redemption)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.dollarFund = {
    deposits: [
      { id: 'd1', date: '2026-01-15', amountUsd: 1000, notes: 'הפקדה חודשית' },
    ],
    redemptions: [
      { id: 'r1', date: '2026-02-01', amountUsd: 500,  type: 'research-travel', notes: 'כנס' },
      { id: 'r2', date: '2026-03-01', amountUsd: 1000, type: 'personal',        notes: '' },
      { id: 'r3', date: '2026-04-01', amountUsd: 200,  type: 'retirement',      notes: '' },
    ],
  };
  const roundTripped = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(roundTripped, doc);
  const { valid, errors } = validate(roundTripped);
  assert.equal(valid, true, errors.join(', '));
});

test('validate() דוחה dollarFund עם type לא תקין / amountUsd שלילי / date בפורמט שגוי', () => {
  const bad1 = { ...structuredClone(EMPTY_STATE), dollarFund: { deposits: [], redemptions: [{ id: 'r1', date: '2026-01-01', amountUsd: 100, type: 'bogus' }] } };
  assert.equal(validate(bad1).valid, false);

  const bad2 = { ...structuredClone(EMPTY_STATE), dollarFund: { deposits: [{ id: 'd1', date: '2026-01-01', amountUsd: -50 }], redemptions: [] } };
  assert.equal(validate(bad2).valid, false);

  const bad3 = { ...structuredClone(EMPTY_STATE), dollarFund: { deposits: [{ id: 'd1', date: '2026/01/01', amountUsd: 50 }], redemptions: [] } };
  assert.equal(validate(bad3).valid, false);
});

test('EMPTY_STATE כולל dollarFund ריק כברירת מחדל, ותקין', () => {
  assert.deepEqual(EMPTY_STATE.dollarFund, { deposits: [], redemptions: [] });
  assert.equal(validate(EMPTY_STATE).valid, true);
});

test('EMPTY_STATE כולל settings.personal.dollarFundRules ניתן לעריכה (לא hard-coded בקוד)', () => {
  assert.deepEqual(EMPTY_STATE.settings.personal.dollarFundRules, {
    minBalanceUsd: 2000,
    personalYearCapUsd: 5000,
    personalTaxRate: 0.47,
  });
});

test('validate() דוחה settings.personal.dollarFundRules לא תקין (ערך שלילי / שיעור מס מחוץ ל-0..1)', () => {
  const bad1 = structuredClone(EMPTY_STATE);
  bad1.settings.personal.dollarFundRules.minBalanceUsd = -1;
  assert.equal(validate(bad1).valid, false);

  const bad2 = structuredClone(EMPTY_STATE);
  bad2.settings.personal.dollarFundRules.personalTaxRate = 1.5;
  assert.equal(validate(bad2).valid, false);
});

test('EMPTY_STATE ללא customDeductions (מסמך ישן) — עדיין תקין; UI חייב לגשת עם ?? []', () => {
  const doc = structuredClone(EMPTY_STATE);
  delete doc.customDeductions;
  const { valid, errors } = validate(doc);
  assert.equal(valid, true, errors.join(', '));
});

// WP10.11: aidFund.loans[].startMonth/endMonth — אופציונליים, ללא שבירת סכימה קיימת
test('round-trip JSON — aidFund.loans עם startMonth/endMonth אופציונליים', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.aidFund.loans = [
    { id: 'l1', date: '2026-01-01', amount: 5000, monthlyRepayment: 200, notes: '' }, // ללא תאריכים — פתוח-קצה
    { id: 'l2', date: '2026-02-01', amount: 3000, monthlyRepayment: 150, notes: '', startMonth: '2026-03', endMonth: '2026-08' },
  ];
  const roundTripped = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(roundTripped, doc);
  const { valid, errors } = validate(roundTripped);
  assert.equal(valid, true, errors.join(', '));
});

test('validate() דוחה aidFund.loans עם startMonth/endMonth בפורמט שגוי', () => {
  const bad = structuredClone(EMPTY_STATE);
  bad.aidFund.loans = [{ id: 'l1', date: '2026-01-01', amount: 100, monthlyRepayment: 10, startMonth: 'not-a-month' }];
  const { valid } = validate(bad);
  assert.equal(valid, false);
});

// WP10.6: manualYearSummaries — סיכומי שנה ידניים לשנים ללא חודשים מתועדים, הזנה חלקית
test('round-trip JSON — manualYearSummaries עם הזנה חלקית (רק חלק מהשדות)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.manualYearSummaries = {
    2019: { totalNet: 90000, monthsCount: 12 },              // חלקי — ללא totalGross/bonusesGross/notes
    2018: { totalGross: 120000, notes: 'הערה חופשית' },       // חלקי אחר
  };
  const roundTripped = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(roundTripped, doc);
  const { valid, errors } = validate(roundTripped);
  assert.equal(valid, true, errors.join(', '));
});

test('validate() דוחה manualYearSummaries עם מפתח שנה לא תקין / שדה מספרי שלילי / notes לא-מחרוזת', () => {
  const bad1 = { ...structuredClone(EMPTY_STATE), manualYearSummaries: { 'not-a-year': { totalGross: 100 } } };
  assert.equal(validate(bad1).valid, false);

  const bad2 = { ...structuredClone(EMPTY_STATE), manualYearSummaries: { 2019: { totalGross: -50 } } };
  assert.equal(validate(bad2).valid, false);

  const bad3 = { ...structuredClone(EMPTY_STATE), manualYearSummaries: { 2019: { notes: 123 } } };
  assert.equal(validate(bad3).valid, false);
});

test('EMPTY_STATE ללא manualYearSummaries (מסמך ישן) — עדיין תקין; UI חייב לגשת עם ?? {}', () => {
  const doc = structuredClone(EMPTY_STATE);
  delete doc.manualYearSummaries;
  const { valid, errors } = validate(doc);
  assert.equal(valid, true, errors.join(', '));
});
