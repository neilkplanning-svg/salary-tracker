/**
 * json-io.js — ייצוא/ייבוא JSON (גיבוי ושחזור)
 * Input: store state  Output: הורדת קובץ JSON / טעינה לתוך store
 * Deps: store.js, schema.js, strings.he.js
 *
 * applyImportedDoc() משותף גם ל-sync/filesync.js (WP5.2) — מקור אמת יחיד
 * לוולידציה + התראת גרסה לפני דריסה (כלל #7).
 */

import { store } from '../model/store.js';
import { validate } from '../model/schema.js';
import { STRINGS } from '../ui/strings.he.js';

const FILE_NAME = 'salary-backup.json';

/** @param {string} iso — appMeta.lastModified @returns {string} תאריך מתורגם לעברית, או '—' אם חסר */
function formatModified(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('he-IL');
}

/** הודעת אישור צפה (נספחת ל-body כדי לשרוד re-render של המסך) */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

/**
 * מיישם מסמך JSON מיובא על ה-store: ולידציה, התראת גרסה לפני דריסה (כלל #7), ואז replace.
 * @param {object} doc — מסמך מפוענח (JSON.parse)
 * @returns {boolean} true אם יושם בפועל
 */
export function applyImportedDoc(doc) {
  const { valid, errors } = validate(doc);
  if (!valid) {
    alert(`${STRINGS.io.errorBadSchema}\n${errors.join('\n')}`);
    return false;
  }

  const localModified  = store.getState().appMeta?.lastModified ?? '';
  const remoteModified = doc.appMeta?.lastModified ?? '';
  if (localModified && remoteModified && localModified !== remoteModified) {
    const msg = `${STRINGS.io.versionAlert}\n\n`
      + `קובץ נטען: ${formatModified(remoteModified)}\n`
      + `נתונים מקומיים: ${formatModified(localModified)}\n\n`
      + STRINGS.io.versionAlertConfirm;
    if (!confirm(msg)) return false;
  }

  store.replace(doc);
  return true;
}

/** ייצוא המצב המלא לקובץ salary-backup.json (הורדה) */
export function exportJSON() {
  const data = JSON.stringify(store.getState(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: FILE_NAME,
  });
  a.click();
  URL.revokeObjectURL(a.href);
  toast(STRINGS.io.exportOk);
}

/** ייבוא קובץ JSON דרך בורר קבצים (input[type=file]) */
export function importJSON() {
  const input = Object.assign(document.createElement('input'), {
    type: 'file', accept: '.json',
  });
  input.onchange = async () => {
    const text = await input.files[0]?.text();
    if (!text) return;
    let doc;
    try { doc = JSON.parse(text); } catch {
      alert(STRINGS.io.errorBadFile);
      return;
    }
    if (applyImportedDoc(doc)) toast(STRINGS.io.importOk);
  };
  input.click();
}
