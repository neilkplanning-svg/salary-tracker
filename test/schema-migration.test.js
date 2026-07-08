/**
 * schema-migration.test.js — fillNationalDefaults (השלמת שדות national חסרים בטעינה)
 * Input: מסמכים ישנים (לפני הוספת attendanceParams/breakWindows ב-WP8.1)  Output: PASS/FAIL
 * Deps: schema.js, engine/defaults.js
 *
 * רקע: משתמש שדיווח (2026-07-01) שתפריט הפסקת הצהריים בהגדרות מציג רק "ללא הפסקה".
 * שורש הבעיה: settings.national נשמר לפני שהתווסף attendanceParams/breakWindows
 * ל-NATIONAL_DEFAULTS, ו-loadFromStorage/store.replace לא מיזגו ברירות מחדל חדשות
 * לתוך מסמך ישן קיים. fillNationalDefaults סוגר את הפער בלי לדרוס עריכות קיימות.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATE, fillNationalDefaults } from '../src/model/schema.js';
import { NATIONAL_DEFAULTS, EARNING_COMPONENTS } from '../src/engine/defaults.js';

test('fillNationalDefaults — משלים attendanceParams שחסר לגמרי (מסמך מלפני WP8.1)', () => {
  const oldDoc = structuredClone(EMPTY_STATE);
  delete oldDoc.settings.national.attendanceParams;

  const result = fillNationalDefaults(oldDoc);
  assert.deepEqual(result.settings.national.attendanceParams, NATIONAL_DEFAULTS.attendanceParams);
  assert.equal(result.settings.national.attendanceParams.breakWindows.length, 3);
});

test('fillNationalDefaults — משלים רק breakWindows כשהוא חסר, לא דורס שדות attendanceParams אחרים שנערכו', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.settings.national.attendanceParams.fullDayHours = 9.5; // ערך מותאם אישית קיים
  delete doc.settings.national.attendanceParams.breakWindows;

  const result = fillNationalDefaults(doc);
  assert.deepEqual(result.settings.national.attendanceParams.breakWindows, NATIONAL_DEFAULTS.attendanceParams.breakWindows);
  assert.equal(result.settings.national.attendanceParams.fullDayHours, 9.5); // לא נדרס
});

test('fillNationalDefaults — לא נוגע במסמך שכבר מלא', () => {
  const doc = structuredClone(EMPTY_STATE);
  const before = structuredClone(doc);
  fillNationalDefaults(doc);
  assert.deepEqual(doc, before);
});

test('fillNationalDefaults — לא דורס ערכי personal שנערכו (ממלא רק חסרים)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.settings.personal.creditPointsQty = 3.5;
  fillNationalDefaults(doc);
  assert.equal(doc.settings.personal.creditPointsQty, 3.5);
});

// רגרסיה: מסמך שנשמר לפני WP10.10/WP10.8 חסר personal.dollarFundRules/standbyDayValue.
// setByPath בשמירת ההגדרות זרק TypeError על מסמך כזה — נסגר ע"י מילוי personal בטעינה.
test('fillNationalDefaults — משלים personal.dollarFundRules ו-standbyDayValue חסרים (מסמך ישן)', () => {
  const doc = structuredClone(EMPTY_STATE);
  delete doc.settings.personal.dollarFundRules;
  delete doc.settings.personal.standbyDayValue;
  fillNationalDefaults(doc);
  assert.ok(doc.settings.personal.dollarFundRules, 'dollarFundRules הושלם');
  assert.equal(doc.settings.personal.dollarFundRules.minBalanceUsd, 2000);
  assert.equal(doc.settings.personal.dollarFundRules.personalYearCapUsd, 5000);
  assert.equal(doc.settings.personal.standbyDayValue, 0);
});

// WP10.13: 'seniority' ("ותק") הוסר מהקטלוג הקנוני; מסמכים קיימים עם שורת earnings יתומה
// בשם זה צריכים להתנקות בטעינה, בלי לפגוע בשורות אחרות (כולל id מותאם/לא-קטלוגי).
test('fillNationalDefaults — מסיר שורת earnings יתומה עם id=seniority, משמר שורות אחרות (כולל id מותאם)', () => {
  const doc = structuredClone(EMPTY_STATE);
  doc.settings.personal.earnings = [
    { id: 'base', amount: 1000 },
    { id: 'seniority', amount: 500 },
    { id: 'custom_x', amount: 100 },
  ];

  const result = fillNationalDefaults(doc);

  const ids = result.settings.personal.earnings.map(e => e.id);
  assert.ok(!ids.includes('seniority'), 'seniority צריך להיעלם');
  assert.ok(ids.includes('base'), 'רכיב קטלוג רגיל נשמר');
  assert.ok(ids.includes('custom_x'), 'רכיב מותאם/לא-קטלוגי נשמר (לא מסננים לפי "לא מוכר")');
  assert.equal(result.settings.personal.earnings.length, 2);
});

test('fillNationalDefaults — null-safe: לא נכשל כש-personal.earnings חסר או ריק', () => {
  const doc1 = structuredClone(EMPTY_STATE);
  delete doc1.settings.personal.earnings;
  assert.doesNotThrow(() => fillNationalDefaults(doc1));

  const doc2 = structuredClone(EMPTY_STATE);
  doc2.settings.personal.earnings = [];
  fillNationalDefaults(doc2);
  assert.deepEqual(doc2.settings.personal.earnings, []);
});

test('EARNING_COMPONENTS — seniority הוסר מהקטלוג, researchSeniority נשאר', () => {
  const ids = EARNING_COMPONENTS.map(c => c.id);
  assert.ok(!ids.includes('seniority'), 'seniority לא אמור להיות בקטלוג');
  assert.ok(ids.includes('researchSeniority'), 'researchSeniority אמור להישאר בקטלוג');
});
