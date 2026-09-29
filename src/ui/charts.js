/**
 * charts.js — גרפי SVG: ברוטו/נטו שנתי, ממוצע חודשי, שינוי הכנסה מול אינפלציה
 * Input: yearSummaries[]  Output: SVG elements
 * Deps: strings.he.js
 *
 * WP13.1: קנבס 900x420 (יחס 15:7), תואם ל-aspect-ratio של מכל הגרף ב-theme.css
 * (.chart-panel > #chart-*) כדי שה-SVG ימלא את המכל בלי "letterboxing".
 *
 * הערה על קנה מידה — מבטלת את הנימוק של WP12.1: הגודל הנראה של טקסט הוא
 * (רוחב-המכל-בפועל)/(רוחב-ה-viewBox), ולכן WP12.1 בחר viewBox קטן (480) כדי "להגדיל"
 * טקסט. זה טיפל בסימפטום: הבעיה האמיתית הייתה שהפריסה דחסה שלושה גרפים לשורה אחת
 * ברוחב ~300-420px כל אחד. משהמכל קיבל רוחב מלא (עד 1000px), viewBox של 900 נותן
 * קנה-מידה של ~1 — כלומר font-size ב-SVG שווה בקירוב לפיקסלים על המסך, ואפשר לתחזק
 * את המספרים כאן כמו CSS רגיל במקום לנחש דרך גורם הגדלה.
 *
 * המשך (ניגודיות מצב-כהה): פסי ה"נטו" (fill=--color-primary, נייבי) קיבלו
 * stroke="var(--color-text)" דק — בלי זה, נייבי כמעט זהה בבהירותו ל-(--color-surface)
 * הכהה של הכרטיס (ניגודיות ~1.05:1) וכמעט נעלם. --color-text בהיר-מאוד במצב כהה
 * ומייצר מתאר ברור; במצב בהיר --color-text כהה וקרוב ל-(--color-primary), כך שהמתאר
 * כמעט לא מורגש שם — אין רגרסיה חזותית במצב הבהיר. פסי ה"ברוטו" (accent/gold) לא
 * שונו — ניגודיות שלהם מול המשטח תקינה בשני המצבים.
 */

import { formatCurrency } from './strings.he.js';
import { CHART_COMPACT_MQ } from './ui-kit.js';

/**
 * שני פרופילי קנבס. הבחירה נעשית לפי רוחב המכל בפועל (ראו pickGeo), כי הגודל הנראה של
 * טקסט ב-SVG הוא (רוחב-המכל)/(רוחב-ה-viewBox): viewBox יחיד של 900 נתן במובייל (~347px)
 * קנה-מידה של 0.39, כלומר טקסט 15px הוצג כ-6px. viewBox צר יותר במסך צר מחזיר את קנה
 * המידה ל-~0.9 בשני המקרים.
 *
 * כל פרופיל חייב לשמור על WIDTH/HEIGHT ששווה ל-aspect-ratio של המכל ב-theme.css
 * (15:7 בדסקטופ, 4:3 במובייל) — אחרת נוצר "letterboxing".
 */
const GEO_WIDE = {
  WIDTH: 900, HEIGHT: 420,          // 15:7
  PAD_X: 92, PAD_TOP: 52, PAD_BOTTOM: 62,
  FONT_AXIS: 15, FONT_VALUE: 14,
  BAR_MAX: 46, STAGGER_AT: 9,
  SHOW_VALUE_LABELS: true,
  LEGEND_BOX: 14,
};
const GEO_COMPACT = {
  WIDTH: 380, HEIGHT: 285,          // 4:3
  PAD_X: 56, PAD_TOP: 42, PAD_BOTTOM: 46,
  // WP14: תוויות ציר Y קצרות ("286K" ולא "285.6K ₪") — ב-PAD_X של 56 יחידות התווית
  // המלאה נחתכה בקצה השמאלי של ה-SVG. יחידת המטבע ברורה מכותרת הגרף.
  SHORT_AXIS: true,
  FONT_AXIS: 13, FONT_VALUE: 11,
  BAR_MAX: 22, STAGGER_AT: 4,
  // תוויות ערך מעל הפסים מוסתרות במובייל: ברוחב ~275px לאזור הציור, 16 תוויות של
  // "199K ₪" מתנגשות בהכרח. הצירים והפסים מוסרים את המגמה; המספרים המדויקים בטבלה.
  SHOW_VALUE_LABELS: false,
  LEGEND_BOX: 11,
};

/**
 * בוחר פרופיל לפי **אותו** media query שמחליף את ה-aspect-ratio של המכל ב-theme.css
 * CHART_COMPACT_MQ ב-ui-kit.js. חשוב שהשניים לא ייקבעו לפי מדדים שונים (רוחב-מכל מול רוחב-חלון):
 * אי-הסכמה ביניהם מחזירה בדיוק את ה"letterboxing" שהפרופילים נועדו למנוע.
 * @returns {object}
 */
export function pickGeo() {
  const mobile = typeof window !== 'undefined'
    && window.matchMedia?.(CHART_COMPACT_MQ).matches;
  return mobile ? GEO_COMPACT : GEO_WIDE;
}

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

/** תווית ציר קצרה למובייל: "286K" / "23.8K" / "950" — ללא סימן מטבע */
function formatAxisShort(val) {
  const n = val || 0;
  if (Math.abs(n) >= 100000) return Math.round(n / 1000) + 'K';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}

function renderSvg(g, content) {
  return `<svg viewBox="0 0 ${g.WIDTH} ${g.HEIGHT}" width="100%" height="100%" style="font-family:inherit; direction:ltr;">
    ${content}
  </svg>`;
}

function renderAxes(g, xLabels, maxY, minY = 0, isPercent = false) {
  const chartW = g.WIDTH - g.PAD_X * 2;
  const chartH = g.HEIGHT - g.PAD_TOP - g.PAD_BOTTOM;
  const range = maxY - minY || 1;

  let grid = '';
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const val = minY + (range * i) / ticks;
    const y = g.HEIGHT - g.PAD_BOTTOM - (chartH * i) / ticks;
    const label = isPercent ? toPctStr(val) : (g.SHORT_AXIS ? formatAxisShort(val) : formatCompact(val));

    grid += `
      <line x1="${g.PAD_X}" y1="${y}" x2="${g.WIDTH - g.PAD_X}" y2="${y}" stroke="var(--color-border)" stroke-dasharray="4,4" opacity="0.4" />
      <text x="${g.PAD_X - 10}" y="${y + 5}" text-anchor="end" fill="var(--color-text-secondary)" font-size="${g.FONT_AXIS}px">${label}</text>
    `;
  }

  // X axis labels — כשיש הרבה שנים, מפזרים לשתי שורות לסירוגין כדי שלא יתנגשו.
  const dx = chartW / Math.max(1, xLabels.length);
  const stagger = xLabels.length > g.STAGGER_AT;
  xLabels.forEach((lbl, i) => {
    const x = g.PAD_X + dx * i + dx / 2;
    const y = g.HEIGHT - g.PAD_BOTTOM + (stagger && i % 2 === 1 ? g.FONT_AXIS * 2.6 : g.FONT_AXIS * 1.4);
    grid += `<text x="${x}" y="${y}" text-anchor="middle" fill="var(--color-text-secondary)" font-size="${g.FONT_AXIS}px">${lbl}</text>`;
  });

  // Base line
  const zeroY = maxY > 0 && minY < 0 ? g.HEIGHT - g.PAD_BOTTOM - (chartH * (0 - minY)) / range : g.HEIGHT - g.PAD_BOTTOM;
  grid += `<line x1="${g.PAD_X}" y1="${zeroY}" x2="${g.WIDTH - g.PAD_X}" y2="${zeroY}" stroke="var(--color-text)" stroke-width="1.5" />`;

  return grid;
}

export function renderChart(container, type, summaries) {
  if (!summaries || summaries.length === 0) {
    container.innerHTML = `<p style="color:var(--color-text-secondary)">אין מספיק נתונים לגרף.</p>`;
    return;
  }

  const g = pickGeo();

  // Sort chronologically for charts
  const data = [...summaries].sort((a, b) => a.year - b.year);
  const years = data.map(d => d.year.toString());
  const chartW = g.WIDTH - g.PAD_X * 2;
  const chartH = g.HEIGHT - g.PAD_TOP - g.PAD_BOTTOM;
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

    content += renderAxes(g, years, maxVal, 0, false);

    // Render grouped bars
    const bw = Math.min(g.BAR_MAX, (dx * 0.8) / 2);
    data.forEach((d, i) => {
      const cx = g.PAD_X + dx * i + dx / 2;

      const vGross = d[kGross] || 0;
      const vNet = d[kNet] || 0;

      const hGross = (vGross / (maxVal || 1)) * chartH;
      const hNet = (vNet / (maxVal || 1)) * chartH;

      const yGross = g.HEIGHT - g.PAD_BOTTOM - hGross;
      const yNet = g.HEIGHT - g.PAD_BOTTOM - hNet;

      // Net Bar (Primary) — stroke ב-color-text: כמעט בלתי מורגש במצב בהיר (שני הגוונים כהים
      // וקרובים), אך יוצר מתאר מובחן במצב כהה, שם --color-primary (נייבי) כמעט זהה בבהירות
      // ל-color-surface של הכרטיס (ניגודיות ~1.05:1 ללא ה-stroke — כמעט בלתי-נראה).
      content += `
        <rect x="${cx - bw - 2}" y="${yNet}" width="${bw}" height="${hNet}" fill="var(--color-primary)" stroke="var(--color-text)" stroke-width="1" rx="3" />
      `;
      // Gross Bar (Accent)
      content += `
        <rect x="${cx + 2}" y="${yGross}" width="${bw}" height="${hGross}" fill="var(--color-accent)" opacity="0.85" rx="3" />
      `;
      if (g.SHOW_VALUE_LABELS) {
        content += `
          <text x="${cx - bw/2 - 2}" y="${yNet - 10}" text-anchor="middle" fill="var(--color-text)" font-size="${g.FONT_VALUE}px" font-weight="600">${formatCompact(vNet)}</text>
          <text x="${cx + bw/2 + 2}" y="${yGross - 10}" text-anchor="middle" fill="var(--color-text)" font-size="${g.FONT_VALUE}px" font-weight="600">${formatCompact(vGross)}</text>
        `;
      }
    });

    // Legend — שתי שורות (במקום זו-לצד-זו) כדי שלא יתנגש עם טקסט עברי ארוך יותר בגופן הגדול.
    // מקרא ה-נטו מקבל את אותו stroke כמו הפס עצמו (ראו הערה למעלה) — כדי שגם הריבוע הקטן
    // יהיה מובחן ממשטח הכרטיס במצב כהה, לא רק הפסים בגרף.
    const lb = g.LEGEND_BOX, row2 = lb + 6;
    content += `
      <rect x="${g.PAD_X}" y="4" width="${lb}" height="${lb}" fill="var(--color-primary)" stroke="var(--color-text)" stroke-width="1" rx="3"/>
      <text x="${g.PAD_X + lb + 6}" y="${4 + lb - 2}" font-size="${g.FONT_AXIS}px" fill="var(--color-text)">נטו</text>
      <rect x="${g.PAD_X}" y="${4 + row2}" width="${lb}" height="${lb}" fill="var(--color-accent)" opacity="0.85" rx="3"/>
      <text x="${g.PAD_X + lb + 6}" y="${4 + row2 + lb - 2}" font-size="${g.FONT_AXIS}px" fill="var(--color-text)">ברוטו</text>
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

    content += renderAxes(g, years, maxVal, minVal, true);

    // We skip the first year for income change line (it's 0 usually) unless it has one
    let linePathInc = '', linePathInf = '';
    const r = g.FONT_AXIS / 3; // רדיוס נקודה פרופורציונלי לקנבס

    data.forEach((d, i) => {
      const cx = g.PAD_X + dx * i + dx / 2;
      const inc = d.incomeChangePct || 0;
      const inf = d.inflationPct || 0;

      const yInc = g.HEIGHT - g.PAD_BOTTOM - (chartH * (inc - minVal)) / range;
      const yInf = g.HEIGHT - g.PAD_BOTTOM - (chartH * (inf - minVal)) / range;

      linePathInc += (i === 0 ? `M ${cx} ${yInc}` : ` L ${cx} ${yInc}`);
      linePathInf += (i === 0 ? `M ${cx} ${yInf}` : ` L ${cx} ${yInf}`);

      content += `<circle cx="${cx}" cy="${yInc}" r="${r}" fill="var(--color-accent)" />`;
      content += `<circle cx="${cx}" cy="${yInf}" r="${r}" fill="var(--color-danger)" />`;
    });

    content += `<path d="${linePathInc}" fill="none" stroke="var(--color-accent)" stroke-width="2.5" />`;
    content += `<path d="${linePathInf}" fill="none" stroke="var(--color-danger)" stroke-width="2.5" stroke-dasharray="5,5" />`;

    // Legend — שתי שורות (ראו הערה למעלה)
    const lw = g.FONT_AXIS * 1.5, row2 = g.FONT_AXIS + 6;
    content += `
      <line x1="${g.PAD_X}" y1="8" x2="${g.PAD_X + lw}" y2="8" stroke="var(--color-accent)" stroke-width="2.5" />
      <circle cx="${g.PAD_X + lw / 2}" cy="8" r="${r}" fill="var(--color-accent)" />
      <text x="${g.PAD_X + lw + 8}" y="13" font-size="${g.FONT_AXIS}px" fill="var(--color-text)">שינוי הכנסה</text>

      <line x1="${g.PAD_X}" y1="${8 + row2}" x2="${g.PAD_X + lw}" y2="${8 + row2}" stroke="var(--color-danger)" stroke-width="2.5" stroke-dasharray="5,5" />
      <circle cx="${g.PAD_X + lw / 2}" cy="${8 + row2}" r="${r}" fill="var(--color-danger)" />
      <text x="${g.PAD_X + lw + 8}" y="${13 + row2}" font-size="${g.FONT_AXIS}px" fill="var(--color-text)">אינפלציה</text>
    `;
  }

  container.innerHTML = renderSvg(g, content);
}
