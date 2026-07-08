/**
 * persistence.js — שכבת אחסון: IndexedDB עם fallback ל-localStorage
 * Input: state object  Output: טעינה/שמירה שקופה
 * Deps: store.js, schema.js
 */

import { store, subscribe } from '../model/store.js';
import { validate } from '../model/schema.js';

const DB_NAME   = 'salary-tracker';
const DB_VER    = 1;
const STORE_KEY = 'salary-data';
const LS_KEY    = 'salary-tracker-data';

let _db       = null;
let _skipSave = false;  // מונע שמירה חוזרת בעת טעינה
let _saveTimer = null;  // debounce handle

async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('data');
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('data', 'readonly');
      const req = tx.objectStore('data').get(STORE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  } catch { return null; }
}

async function idbSet(data) {
  try {
    const db = await openDB();
    // await כדי שדחיית put תיתפס ב-catch החיצוני (ולא תימלט ממנו)
    await new Promise((resolve, reject) => {
      const tx  = db.transaction('data', 'readwrite');
      const req = tx.objectStore('data').put(data, STORE_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch {
    // IDB נכשל — נסה localStorage כ-fallback
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (lsErr) {
      console.error('persistence: שמירה נכשלה גם ב-localStorage', lsErr);
      window.dispatchEvent(new CustomEvent('salary-save-error'));
    }
  }
}

export async function loadFromStorage() {
  let data = await idbGet();
  if (!data) {
    try { data = JSON.parse(localStorage.getItem(LS_KEY)); } catch { data = null; }
  }
  if (!data) return;
  const { valid, errors } = validate(data);
  if (!valid) { console.warn('persistence: נתונים לא תקינים', errors); return; }
  // מניעת שמירה חוזרת שמופעלת ע"י store.replace → subscribe
  _skipSave = true;
  store.replace(data);
  _skipSave = false;
}

export async function saveToStorage() {
  const state = store.getState();
  await idbSet(state);
}

// שמירה אוטומטית עם debounce 300ms (מונע I/O מיותר על כל הקשה)
subscribe(() => {
  if (_skipSave) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveToStorage(), 300);
});
