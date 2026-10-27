// CSV output that is safe to open in a spreadsheet.
// A cell that starts with = + - @ tab or CR can run as a formula in Excel,
// Sheets and LibreOffice. We prefix such text with an apostrophe.

const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export function neutralizeFormula(value) {
  const s = String(value);
  if (s === '') return s;
  if (NUMERIC.test(s)) return s; // plain numbers stay numbers
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  s = neutralizeFormula(s);
  return /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// rows: array of arrays, or array of objects (columns default to the union of keys).
export function toCsv(rows, columns) {
  const objects = rows.length > 0 && !Array.isArray(rows[0]);
  let head = columns;
  let body = rows;
  if (objects) {
    head = head || [...new Set(rows.flatMap((r) => Object.keys(r)))];
    body = rows.map((r) => head.map((k) => r[k]));
  }
  const lines = [];
  if (head) lines.push(head.map(csvCell).join(','));
  for (const r of body) lines.push(r.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}
