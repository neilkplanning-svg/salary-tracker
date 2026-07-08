# salary-tracker — מעקב שכר

אפליקציית WEB לתיעוד נוכחות וחישוב שכר (IAI/MALAT).  
מחליפה קובץ Excel — vanilla HTML/JS, ללא התקנה, עובדת offline.

**🔗 קישור חי:** https://neilkplanning-svg.github.io/salary-tracker/

## פתיחה מהירה

**דרך קישור (מומלץ):** https://neilkplanning-svg.github.io/salary-tracker/

**מקומית:**
```
פתח index.html בדפדפן Chrome/Edge
```
> אם ES modules נחסמים מ-file://, הרץ `npx serve .` ופתח `http://localhost:3000`

**קובץ יחיד, offline לגמרי (USB/מייל/OneDrive):** `node build.mjs` → `salary.html` (ראו `docs/dev-guide.md`).

## מה האפליקציה עושה

- שעון כניסה/יציאה + עריכה ידנית של שעות
- חישוב נטו משוער מדויק (≤ ₪1 מול האקסל המקורי)
- הזנת תלוש בפועל + השוואה משוער↔בפועל
- מודולי הפחתות שכר זמני וקרן עזרה
- היסטוריה רב-שנתית + גרפים
- ייצוא/ייבוא JSON ו-Excel
- סנכרון קובץ OneDrive דרך File System Access API

## הרצת בדיקות

פתח `tests.html` בדפדפן — מריץ golden-cases ומציג PASS/FAIL.

## מסמכים

| מסמך | תיאור |
|------|-------|
| [WORK_PLAN.md](WORK_PLAN.md) | תוכנית עבודה + **סטטוס ביצוע** (מקור-אמת יחיד) |
| [docs/architecture.md](docs/architecture.md) | החלטות ארכיטקטורה (ADR) + יומן החלטות |
| [docs/data-schema.md](docs/data-schema.md) | סכמת JSON מלאה |
| [docs/excel-formulas.md](docs/excel-formulas.md) | תיעוד נוסחאות האקסל |
| [docs/dev-guide.md](docs/dev-guide.md) | פיתוח, הרצה, build, GitHub Pages |

## Stack

- Vanilla JS (ES modules), ללא framework, ללא build
- CSS custom properties — navy `#14274E` / gold `#C9A24B`
- IndexedDB + localStorage fallback
- SheetJS (vendored) לאקסל בלבד
- File System Access API (Edge/Chrome) + fallback

## אין שרת, אפס עלות חוזרת, local-first.
