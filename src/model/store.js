/**
 * store.js — מצב אפליקציה בזיכרון + pub/sub פשוט
 * Input: פעולות setState  Output: מצב נוכחי + ה‑notify לכל מנויים
 * Deps: schema.js (ולידציה)
 */

import { EMPTY_STATE, fillNationalDefaults } from './schema.js';

let _state = structuredClone(EMPTY_STATE);
const _listeners = new Set();

export const store = {
  getState() { return _state; },

  /** @param {function(object): void} updater — מקבל draft ומשנה in-place */
  setState(updater) {
    const draft = structuredClone(_state);
    updater(draft);
    draft.appMeta.lastModified = new Date().toISOString();
    _state = draft;
    _notify();
  },

  /**
   * מחליף את המצב במלואו (טעינה מאחסון/ייבוא/סנכרון). משלים שדות settings.national
   * שנוספו ל-NATIONAL_DEFAULTS אחרי שהמסמך נשמר (ראו schema.js fillNationalDefaults).
   */
  replace(newState) {
    _state = fillNationalDefaults(newState);
    _notify();
  },
};

/** @param {function(): void} listener @returns {function(): void} unsubscribe */
export function subscribe(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function _notify() {
  _listeners.forEach(fn => fn());
}
