/**
 * charts.js — גרפי SVG: ברוטו/נטו שנתי, ממוצע חודשי, שינוי הכנסה מול אינפלציה
 * Input: yearSummaries[]  Output: SVG elements
 * Deps: strings.he.js
 *
 * WP12.1 (גדול+ברור): קנבס ביחס 3:2 (480x320) שתואם בכוונה ל-aspect-ratio של מכל
 * הגרף ב-theme.css (#chart-annual/#chart-monthly/#chart-inflation) — כך שה-SVG
 * ממלא את המכל בלי "letterboxing" בכל רוחב שהפריסה נותנת. הבחירה ב-viewBox קטן
 * יחסית (480 יחידות, לא מספר גדול) היא מכוונת: הגודל הנראה בפועל של טקסט/צורות
 * הוא יחס (רוחב-המכל-בפועל)/(רוחב-ה-viewBox) — viewBox קטן יותר מייצר יחס-קנה-מידה
 * גדול יותר, ולכן טקסט/פסים גדולים וברורים יותר במכלים הריאליים (300–450px בדסקטופ,
 * ~300px במובייל), בלי לשנות את חוזה הנתונים/renderChart.
 *
 * המשך (ניגודיות מצב-כהה): פסי ה"נטו" (fill=--color-primary, נייבי) קיבלו
 * stroke="var(--color-text)" דק — בלי זה, נייבי כמעט זהה בבהירותו ל-(--color-surface)
 * הכהה של הכרטיס (ניגודיות ~1.05:1) וכמעט נעלם. --color-text בהיר-מאוד במצב כהה
 * ומייצר מתאר ברור; במצב בהיר --color-text כהה וקרוב ל-(--color-primary), כך שהמתאר
 * כמעט לא מורגש שם — אין רגרסיה חזותית במצב הבהיר. פסי ה"ברוטו" (accent/gold) לא
 * שונו — ניגודיות שלהם מול המשטח תקינה בשני המצבים.
 */

import { formatCurrency } from './strings.he.js';

const WIDTH = 480;
const HEIGHT = 320;   // יחס 3:2 — ראו הערה למעלה
const PAD_X = 80;
const PAD_TOP = 44;    // מקום למקרא דו-שורתי
const PAD_BOTTOM = 54; // מקום לתוויות ציר X, כולל שורת פיזור כשיש הרבה שנים

function toPctStr(val) {
  return (val * 100).toFixed(1) + '%';
}

/** מקצר סכומים גדולים לקריאות בשטח מוגבל (למשל "24.2K ₪" במקום "24,200 ₪") */
function formatCompact(val) {
  const n = val || 0;
  if (Math.abs(n) >= 10000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K ₪';
  }
  return formatCurrency(n);
}

function renderSvg(content) {
  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" height="100%" style="font-family:inherit; direction:ltr;">
    ${content}
  </svg>`;
}

function renderAxes(xLabels, maxY, minY = 0, isPercent = false) {
  const chartW = WIDTH - PAD_X * 2;
  const chartH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const range = maxY - minY || 1;

  let grid = '';
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const val = minY + (range * i) / ticks;
    const y = HEIGHT - PAD_BOTTOM - (chartH * i) / ticks;
    const label = isPercent ? toPctStr(val) : formatCompact(val);

    grid += `
      <line x1="${PAD_X}" y1="${y}" x2="${WIDTH - PAD_X}" y2="${y}" stroke="var(--color-border)" stroke-dasharray="4,4" opacity="0.6" />
      <text x="${PAD_X - 12}" y="${y + 5}" text-anchor="end" fill="var(--color-text-secondary)" font-size="14px">${label}</text>
    `;
  }

  // X axis labels — כשיש הרבה שנים, מפזרים לשתי שורות לסירוגין כדי שלא יתנגשו
  const dx = chartW / Math.max(1, xLabels.length);
  const stagger = xLabels.length > 6;
  xLabels.forEach((lbl, i) => {
    const x = PAD_X + dx * i + dx / 2;
    const y = HEIGHT - PAD_BOTTOM + (stagger && i % 2 === 1 ? 38 : 20);
    grid += `<text x="${x}" y="${y}" text-anchor="middle" fill="var(--color-text-secondary)" font-size="14px">${lbl}</text>`;
  });

  // Base line
  const zeroY = maxY > 0 && minY < 0 ? HEIGHT - PAD_BOTTOM - (chartH * (0 - minY)) / range : HEIGHT - PAD_BOTTOM;
  grid += `<line x1="${PAD_X}" y1="${zeroY}" x2="${WIDTH - PAD_X}" y2="${zeroY}" stroke="var(--color-text)" stroke-width="1.5" />`;

  return grid;
}

export function renderChart(container, type, summaries) {
  if (!summaries || summaries.length === 0) {
    container.innerHTML = `<p style="color:var(--color-text-secondary)">אין מספיק נתונים לגרף.</p>`;
    return;
  }

  // Sort chronologically for charts
  const data = [...summaries].sort((a, b) => a.year - b.year);
  const years = data.map(d => d.year.toString());
  const chartW = WIDTH - PAD_X * 2;
  const chartH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const dx = chartW / Math.max(1, data.length);

  let content = '';

  if (type === 'annual' || type === 'monthlyAvg') {
    const kGross = type === 'annual' ? 'totalGross' : 'avgMonthlyGross';
    const kNet = type === 'annual' ? 'totalNet' : 'avgMonthlyNet';

    let maxVal = 0;
    data.forEach(d => {
      // שנה ידנית עשויה להיות חלקית (רק נטו/רק ברוטו) — ערך undefined יהפוך את maxVal ל-NaN
      // וירעיל את כל סקאלת הגרף. מתייחסים לשדה חסר כ-0.
      maxVal = Math.max(maxVal, d[kGross] || 0, d[kNet] || 0);
    });
    // Headroom over the tallest bar כדי שתווית הערך לא תיחתך/תתנגש בציר העליון
    maxVal = maxVal * 1.15;

    content += renderAxes(years, maxVal, 0, false);

    // Render grouped bars
    const bw = Math.min(30, (dx * 0.8) / 2);
    data.forEach((d, i) => {
      const cx = PAD_X + dx * i + dx / 2;

      const vGross = d[kGross] || 0;
      const vNet = d[kNet] || 0;

      const hGross = (vGross / (maxVal || 1)) * chartH;
      const hNet = (vNet / (maxVal || 1)) * chartH;

      const yGross = HEIGHT - PAD_BOTTOM - hGross;
      const yNet = HEIGHT - PAD_BOTTOM - hNet;

      // Net Bar (Primary) — stroke ב-color-text: כמעט בלתי מורגש במצב בהיר (שני הגוונים כהים
      // וקרובים), אך יוצר מתאר מובחן במצב כהה, שם --color-primary (נייבי) כמעט זהה בבהירות
      // ל-color-surface של הכרטיס (ניגודיות ~1.05:1 ללא ה-stroke — כמעט בלתי-נראה).
      content += `
        <rect x="${cx - bw - 2}" y="${yNet}" width="${bw}" height="${hNet}" fill="var(--color-primary)" stroke="var(--color-text)" stroke-width="1" rx="3" />
        <text x="${cx - bw/2 - 2}" y="${yNet - 8}" text-anchor="middle" fill="var(--color-text)" font-size="13px">${formatCompact(vNet)}</text>
      `;
      // Gross Bar (Accent)
      content += `
        <rect x="${cx + 2}" y="${yGross}" width="${bw}" height="${hGross}" fill="var(--color-accent)" opacity="0.85" rx="3" />
        <text x="${cx + bw/2 + 2}" y="${yGross - 8}" text-anchor="middle" fill="var(--color-text)" font-size="13px">${formatCompact(vGross)}</text>
      `;
    });

    // Legend — שתי שורות (במקום זו-לצד-זו) כדי שלא יתנגש עם טקסט עברי ארוך יותר בגופן הגדול.
    // מקרא ה-נטו מקבל את אותו stroke כמו הפס עצמו (ראו הערה למעלה) — כדי שגם הריבוע הקטן
    // יהיה מובחן ממשטח הכרטיס במצב כהה, לא רק הפסים בגרף.
    content += `
      <rect x="${PAD_X}" y="8" width="14" height="14" fill="var(--color-primary)" stroke="var(--color-text)" stroke-width="1" rx="3"/>
      <text x="${PAD_X + 20}" y="19" font-size="14px" fill="var(--color-text)">נטו</text>
      <rect x="${PAD_X}" y="26" width="14" height="14" fill="var(--color-accent)" opacity="0.85" rx="3"/>
      <text x="${PAD_X + 20}" y="37" font-size="14px" fill="var(--color-text)">ברוטו</text>
    `;

  } else if (type === 'inflation') {
    // Income Change vs Inflation
    let maxVal = 0, minVal = 0;
    data.forEach(d => {
      const inc = d.incomeChangePct || 0;
      const inf = d.inflationPct || 0;
      maxVal = Math.max(maxVal, inc, inf);
      minVal = Math.min(minVal, inc, inf);
    });

    // Expand bounds slightly and keep symmetrical if close to 0
    maxVal = maxVal > 0 ? maxVal * 1.2 : 0.05;
    minVal = minVal < 0 ? minVal * 1.2 : -0.05;
    const range = maxVal - minVal;

    content += renderAxes(years, maxVal, minVal, true);

    const zeroY = HEIGHT - PAD_BOTTOM - (chartH * (0 - minVal)) / range;

    // We skip the first year for income change line (it's 0 usually) unless it has one
    let linePathInc = '', linePathInf = '';

    data.forEach((d, i) => {
      const cx = PAD_X + dx * i + dx / 2;
      const inc = d.incomeChangePct || 0;
      const inf = d.inflationPct || 0;

      const yInc = HEIGHT - PAD_BOTTOM - (chartH * (inc - minVal)) / range;
      const yInf = HEIGHT - PAD_BOTTOM - (chartH * (inf - minVal)) / range;

      linePathInc += (i === 0 ? `M ${cx} ${yInc}` : ` L ${cx} ${yInc}`);
      linePathInf += (i === 0 ? `M ${cx} ${yInf}` : ` L ${cx} ${yInf}`);

      content += `<circle cx="${cx}" cy="${yInc}" r="5" fill="var(--color-accent)" />`;
      content += `<circle cx="${cx}" cy="${yInf}" r="5" fill="var(--color-danger)" />`;
    });

    content += `<path d="${linePathInc}" fill="none" stroke="var(--color-accent)" stroke-width="2.5" />`;
    content += `<path d="${linePathInf}" fill="none" stroke="var(--color-danger)" stroke-width="2.5" stroke-dasharray="5,5" />`;

    // Legend — שתי שורות (ראו הערה למעלה)
    content += `
      <line x1="${PAD_X}" y1="12" x2="${PAD_X + 22}" y2="12" stroke="var(--color-accent)" stroke-width="2.5" />
      <circle cx="${PAD_X + 11}" cy="12" r="5" fill="var(--color-accent)" />
      <text x="${PAD_X + 30}" y="17" font-size="14px" fill="var(--color-text)">שינוי הכנסה</text>

      <line x1="${PAD_X}" y1="32" x2="${PAD_X + 22}" y2="32" stroke="var(--color-danger)" stroke-width="2.5" stroke-dasharray="5,5" />
      <circle cx="${PAD_X + 11}" cy="32" r="5" fill="var(--color-danger)" />
      <text x="${PAD_X + 30}" y="37" font-size="14px" fill="var(--color-text)">אינפלציה</text>
    `;
  }

  container.innerHTML = renderSvg(content);
}
