/**
 * charts.js — גרפי SVG: ברוטו/נטו שנתי, ממוצע חודשי, שינוי הכנסה מול אינפלציה
 * Input: yearSummaries[]  Output: SVG elements
 * Deps: strings.he.js
 */

import { formatCurrency } from './strings.he.js';

const WIDTH = 700;
const HEIGHT = 350;
const PAD_X = 60;
const PAD_Y = 40;

function toPctStr(val) {
  return (val * 100).toFixed(1) + '%';
}

function renderSvg(content) {
  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" height="100%" style="font-family:inherit; direction:ltr;">
    ${content}
  </svg>`;
}

function renderAxes(xLabels, maxY, minY = 0, isPercent = false) {
  const chartW = WIDTH - PAD_X * 2;
  const chartH = HEIGHT - PAD_Y * 2;
  const range = maxY - minY || 1;
  
  let grid = '';
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const val = minY + (range * i) / ticks;
    const y = HEIGHT - PAD_Y - (chartH * i) / ticks;
    const label = isPercent ? toPctStr(val) : formatCurrency(val);
    
    grid += `
      <line x1="${PAD_X}" y1="${y}" x2="${WIDTH - PAD_X}" y2="${y}" stroke="var(--color-border)" stroke-dasharray="4,4" opacity="0.5" />
      <text x="${PAD_X - 10}" y="${y + 4}" text-anchor="end" fill="var(--color-text-secondary)" font-size="12px">${label}</text>
    `;
  }

  // X axis labels
  const dx = chartW / Math.max(1, xLabels.length);
  xLabels.forEach((lbl, i) => {
    const x = PAD_X + dx * i + dx / 2;
    grid += `<text x="${x}" y="${HEIGHT - PAD_Y + 20}" text-anchor="middle" fill="var(--color-text-secondary)" font-size="12px">${lbl}</text>`;
  });

  // Base line
  const zeroY = maxY > 0 && minY < 0 ? HEIGHT - PAD_Y - (chartH * (0 - minY)) / range : HEIGHT - PAD_Y;
  grid += `<line x1="${PAD_X}" y1="${zeroY}" x2="${WIDTH - PAD_X}" y2="${zeroY}" stroke="var(--color-text)" stroke-width="1" />`;

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
  const chartH = HEIGHT - PAD_Y * 2;
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
    // Add 10% headroom
    maxVal = maxVal * 1.1;

    content += renderAxes(years, maxVal, 0, false);

    // Render grouped bars
    const bw = Math.min(40, (dx * 0.8) / 2);
    data.forEach((d, i) => {
      const cx = PAD_X + dx * i + dx / 2;
      
      const vGross = d[kGross] || 0;
      const vNet = d[kNet] || 0;
      
      const hGross = (vGross / (maxVal || 1)) * chartH;
      const hNet = (vNet / (maxVal || 1)) * chartH;
      
      const yGross = HEIGHT - PAD_Y - hGross;
      const yNet = HEIGHT - PAD_Y - hNet;

      // Net Bar (Primary)
      content += `
        <rect x="${cx - bw - 2}" y="${yNet}" width="${bw}" height="${hNet}" fill="var(--color-primary)" rx="2" />
        <text x="${cx - bw/2 - 2}" y="${yNet - 6}" text-anchor="middle" fill="var(--color-text)" font-size="10px">${formatCurrency(vNet)}</text>
      `;
      // Gross Bar (Accent)
      content += `
        <rect x="${cx + 2}" y="${yGross}" width="${bw}" height="${hGross}" fill="var(--color-accent)" opacity="0.8" rx="2" />
        <text x="${cx + bw/2 + 2}" y="${yGross - 6}" text-anchor="middle" fill="var(--color-text)" font-size="10px">${formatCurrency(vGross)}</text>
      `;
    });

    // Legend
    content += `
      <rect x="${PAD_X}" y="10" width="12" height="12" fill="var(--color-primary)" rx="2"/>
      <text x="${PAD_X + 20}" y="20" font-size="12px" fill="var(--color-text)">נטו</text>
      <rect x="${PAD_X + 60}" y="10" width="12" height="12" fill="var(--color-accent)" opacity="0.8" rx="2"/>
      <text x="${PAD_X + 80}" y="20" font-size="12px" fill="var(--color-text)">ברוטו</text>
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

    const zeroY = HEIGHT - PAD_Y - (chartH * (0 - minVal)) / range;

    // We skip the first year for income change line (it's 0 usually) unless it has one
    let linePathInc = '', linePathInf = '';
    
    data.forEach((d, i) => {
      const cx = PAD_X + dx * i + dx / 2;
      const inc = d.incomeChangePct || 0;
      const inf = d.inflationPct || 0;
      
      const yInc = HEIGHT - PAD_Y - (chartH * (inc - minVal)) / range;
      const yInf = HEIGHT - PAD_Y - (chartH * (inf - minVal)) / range;

      linePathInc += (i === 0 ? `M ${cx} ${yInc}` : ` L ${cx} ${yInc}`);
      linePathInf += (i === 0 ? `M ${cx} ${yInf}` : ` L ${cx} ${yInf}`);
      
      content += `<circle cx="${cx}" cy="${yInc}" r="4" fill="var(--color-accent)" />`;
      content += `<circle cx="${cx}" cy="${yInf}" r="4" fill="var(--color-danger)" />`;
    });

    content += `<path d="${linePathInc}" fill="none" stroke="var(--color-accent)" stroke-width="2" />`;
    content += `<path d="${linePathInf}" fill="none" stroke="var(--color-danger)" stroke-width="2" stroke-dasharray="4,4" />`;

    // Legend
    content += `
      <line x1="${PAD_X}" y1="15" x2="${PAD_X+20}" y2="15" stroke="var(--color-accent)" stroke-width="2" />
      <circle cx="${PAD_X+10}" cy="15" r="4" fill="var(--color-accent)" />
      <text x="${PAD_X + 25}" y="20" font-size="12px" fill="var(--color-text)">שינוי הכנסה</text>
      
      <line x1="${PAD_X+100}" y1="15" x2="${PAD_X+120}" y2="15" stroke="var(--color-danger)" stroke-width="2" stroke-dasharray="4,4" />
      <circle cx="${PAD_X+110}" cy="15" r="4" fill="var(--color-danger)" />
      <text x="${PAD_X + 125}" y="20" font-size="12px" fill="var(--color-text)">אינפלציה</text>
    `;
  }

  container.innerHTML = renderSvg(content);
}
