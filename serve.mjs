/**
 * serve.mjs — שרת סטטי מינימלי לפיתוח (אפס תלויות, Node מובנה)
 * שימוש: `node serve.mjs` ואז http://127.0.0.1:8137
 * נחוץ כי הדפדפן חוסם ES modules מ-file:// (דאבל-קליק) — צריך http://.
 * הפצה (WP6.3) לא תלויה בקובץ זה; הוא לפיתוח/בדיקות מקומיות בלבד.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const PORT = Number(process.env.PORT) || 8137;
const types = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store', // פיתוח: תמיד טען מחדש (קבצים נקראים מהדיסק בכל בקשה)
    });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`serving http://127.0.0.1:${PORT}`));
