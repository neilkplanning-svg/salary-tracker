/**
 * filesync.js — סנכרון קובץ OneDrive דרך File System Access API + fallback
 * Input: state object  Output: קריאה/כתיבה של salary-data.json
 * Deps: store.js, schema.js, json-io.js (applyImportedDoc)
 *
 * תמיכה: Edge/Chrome (File System Access API); fallback: הורדה/העלאה ידנית.
 * ה-handle נשמר ב-IndexedDB נפרד (לא ב-persistence.js הראשי) כדי ש"שמור" בפעם
 * הבאה יכתוב לאותו קובץ גם אחרי רענון/סגירת הדפדפן (ראו PRD §5.4, WORK_PLAN WP5.2).
 */

import { store } from '../model/store.js';
import { STRINGS } from '../ui/strings.he.js';
import { applyImportedDoc } from '../io/json-io.js';

const FILE_NAME = 'salary-data.json';

const HANDLE_DB    = 'salary-tracker-sync';
const HANDLE_STORE = 'handles';
const HANDLE_KEY   = 'onedrive-file';

let _fileHandle = null;

/** @type {{connected: boolean, fileName: string|null, needsPermission: boolean}} */
let _status = { connected: false, fileName: null, needsPermission: false };

/** @returns {boolean} האם File System Access API נתמך */
export function isFSASupported() {
  return 'showOpenFilePicker' in window;
}

/** @returns {{connected: boolean, fileName: string|null, needsPermission: boolean}} מצב הסנכרון הנוכחי */
export function getSyncStatus() {
  return { ..._status };
}

/**
 * משחזר handle שנשמר מסשן קודם (אם קיים) ובודק הרשאה קיימת, ללא בקשת הרשאה חדשה
 * (בקשת הרשאה מחייבת user gesture — מתבצעת רק בתוך openFile/saveFile).
 * קוראים לזה פעם אחת בעת רינדור מסך ההגדרות.
 * @returns {Promise<{connected: boolean, fileName: string|null, needsPermission: boolean}>}
 */
export async function initSync() {
  if (!isFSASupported() || _fileHandle) return getSyncStatus();
  const handle = await _loadPersistedHandle();
  if (!handle) return getSyncStatus();
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    _fileHandle = handle;
    _status = { connected: perm === 'granted', fileName: handle.name, needsPermission: perm !== 'granted' };
  } catch {
    // handle פגום/לא נגיש עוד — מתעלמים, המשתמש יבחר קובץ מחדש
  }
  return getSyncStatus();
}

/**
 * פתיחת קובץ JSON מה-File System Access API (או fallback: input[type=file])
 * @returns {Promise<void>}
 */
export async function openFile() {
  if (!isFSASupported()) { return openFileFallback(); }
  try {
    [_fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    const file = await _fileHandle.getFile();
    const text = await file.text();
    _importJSON(text);
    _status = { connected: true, fileName: _fileHandle.name, needsPermission: false };
    await _persistHandle(_fileHandle);
  } catch (e) {
    _handleFsaError(e);
  }
}

/**
 * שמירת קובץ JSON (לאותו handle אם קיים, אחרת showSaveFilePicker)
 * @returns {Promise<void>}
 */
export async function saveFile() {
  if (!isFSASupported()) { return saveFileFallback(); }
  try {
    if (!_fileHandle) {
      _fileHandle = await window.showSaveFilePicker({
        suggestedName: FILE_NAME,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
    }
    const perm = await _fileHandle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      _status = { connected: false, fileName: _fileHandle.name, needsPermission: true };
      alert(STRINGS.io.errorPermissionDenied);
      return;
    }
    const writable = await _fileHandle.createWritable();
    await writable.write(JSON.stringify(store.getState(), null, 2));
    await writable.close();
    // אימות: קריאה חוזרת של הקובץ לאחר הכתיבה — מאשר שהכתיבה נחתה (גודל + זמן שמירה).
    // כך המשתמש רואה הוכחה מפורשת שהקובץ עודכן, ומבחין בין הצלחת-כתיבה לפיגור-סנכרון של OneDrive.
    let lastSavedBytes = null;
    try { lastSavedBytes = (await _fileHandle.getFile()).size; } catch { /* לא קריטי */ }
    _status = {
      connected: true, fileName: _fileHandle.name, needsPermission: false,
      lastSaved: new Date().toISOString(), lastSavedBytes,
    };
    await _persistHandle(_fileHandle);
  } catch (e) {
    _handleFsaError(e);
  }
}

/** ממפה שגיאות File System Access API להודעות ברורות (קובץ חסר / הרשאה נדחתה / אחר) */
function _handleFsaError(e) {
  if (e.name === 'AbortError') return; // המשתמש ביטל את הבורר — לא שגיאה
  if (e.name === 'NotFoundError') {
    _status = { connected: false, fileName: null, needsPermission: false };
    alert(STRINGS.io.errorFileMissing);
    return;
  }
  if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
    _status = { connected: false, fileName: _fileHandle?.name ?? null, needsPermission: true };
    alert(STRINGS.io.errorPermissionDenied);
    return;
  }
  alert(`${STRINGS.io.errorBadFile}: ${e.message}`);
}

function _importJSON(text) {
  let doc;
  try { doc = JSON.parse(text); } catch {
    alert(STRINGS.io.errorBadFile); return;
  }
  applyImportedDoc(doc);
}

// --- persist handle ל-IndexedDB (DB נפרד מ-persistence.js) ---

async function _openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(HANDLE_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = () => reject(req.error);
  });
}

async function _persistHandle(handle) {
  try {
    const db = await _openHandleDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch {
    // לא קריטי — אם השמירה נכשלה, ה-handle פשוט לא ישוחזר בטעינה הבאה
  }
}

async function _loadPersistedHandle() {
  try {
    const db = await _openHandleDB();
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  } catch { return null; }
}

// --- fallback (הורדה/העלאה) ---

function saveFileFallback() {
  const blob = new Blob([JSON.stringify(store.getState(), null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: FILE_NAME,
  });
  a.click(); URL.revokeObjectURL(a.href);
}

function openFileFallback() {
  const input = Object.assign(document.createElement('input'), {
    type: 'file', accept: '.json',
  });
  input.onchange = async () => {
    const text = await input.files[0]?.text();
    if (text) _importJSON(text);
  };
  input.click();
}
