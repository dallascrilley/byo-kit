// Column profiling for the example page. Pure functions, no DOM.
import { toCsv } from '../dist/byo-kit.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const isMissing = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Returns a list of problems. Empty means the data can be profiled.
export function validateRows(data) {
  const rows = Array.isArray(data) ? data : isPlainObject(data) ? [data] : null;
  if (!rows) return ['Expected a list of records or a CSV with a header row.'];
  if (rows.length === 0) return ['There are no rows to profile.'];
  const bad = rows.findIndex((r) => !isPlainObject(r));
  if (bad !== -1) return ['Row ' + (bad + 1) + ' is not a record (an object with named fields).'];
  return [];
}

export function toRows(data) {
  return Array.isArray(data) ? data : [data];
}

function inferType(values) {
  if (values.length === 0) return 'empty';
  if (values.some((v) => typeof v === 'object')) return 'json';
  if (values.every((v) => typeof v === 'number' || (typeof v === 'string' && NUMBER.test(v.trim())))) return 'number';
  if (values.every((v) => typeof v === 'boolean' || (typeof v === 'string' && /^(true|false)$/i.test(v.trim())))) return 'boolean';
  if (values.every((v) => typeof v === 'string' && ISO_DATE.test(v.trim()) && !Number.isNaN(Date.parse(v.trim())))) return 'date';
  return 'text';
}

const round = (n) => Math.round(n * 1e4) / 1e4;

export function profileColumns(data, { top = 3 } = {}) {
  const rows = toRows(data);
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return names.map((name) => {
    const all = rows.map((r) => r[name]);
    const values = all.filter((v) => !isMissing(v));
    const type = inferType(values);
    const asText = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v).trim());
    const counts = new Map();
    for (const v of values) counts.set(asText(v), (counts.get(asText(v)) || 0) + 1);
    const col = {
      name,
      type,
      filled: values.length,
      missing: rows.length - values.length,
      unique: counts.size,
      min: null,
      max: null,
      mean: null,
      top: [],
    };
    if (type === 'number') {
      const nums = values.map(Number);
      col.min = Math.min(...nums);
      col.max = Math.max(...nums);
      col.mean = round(nums.reduce((a, b) => a + b, 0) / nums.length);
    } else if (type === 'date') {
      const sorted = [...values].map((v) => v.trim()).sort((a, b) => Date.parse(a) - Date.parse(b));
      col.min = sorted[0];
      col.max = sorted[sorted.length - 1];
    }
    if (counts.size > 0 && counts.size < values.length) {
      col.top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([value, count]) => ({ value, count }));
    }
    return col;
  });
}

export function profileToCsv(profile) {
  const head = ['column', 'type', 'filled', 'missing', 'unique', 'min', 'max', 'mean'];
  return toCsv(profile.map((c) => [c.name, c.type, c.filled, c.missing, c.unique, c.min, c.max, c.mean]), head);
}

// What a model may see: names, types and counts. No cell values.
export function summarizeForModel(profile, rowCount) {
  return {
    rows: rowCount,
    columns: profile.map((c) => ({
      name: c.name,
      type: c.type,
      filled: c.filled,
      missing: c.missing,
      unique: c.unique,
      min: c.type === 'number' || c.type === 'date' ? c.min : undefined,
      max: c.type === 'number' || c.type === 'date' ? c.max : undefined,
    })),
  };
}
