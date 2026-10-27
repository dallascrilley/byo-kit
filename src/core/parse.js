// Pure parsing for uploaded or pasted data. No DOM, no network.
// CSV follows RFC 4180: quoted fields, "" escapes, CRLF or LF, embedded
// newlines inside quotes, optional UTF-8 byte order mark.

export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}

export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

export function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

// Returns an array of records, each an array of strings.
export function parseCsv(input, { delimiter = ',' } = {}) {
  const text = stripBom(String(input));
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false; // just closed a quoted field
  let fieldStarted = false;
  let line = 1;
  const endField = () => {
    row.push(field);
    field = '';
    fieldStarted = false;
    afterQuote = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"') {
      if (!fieldStarted && !afterQuote) {
        inQuotes = true;
        fieldStarted = true;
      } else if (afterQuote) {
        throw new ParseError('Unexpected quote on line ' + line + '.');
      } else {
        field += c; // a stray quote inside an unquoted field is kept as text
      }
    } else if (c === delimiter) {
      endField();
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
    } else {
      if (afterQuote) throw new ParseError('Unexpected text after a closing quote on line ' + line + '.');
      field += c;
      fieldStarted = true;
    }
  }
  if (inQuotes) throw new ParseError('A quoted field is not closed (started before the end of the file).');
  if (fieldStarted || afterQuote || field !== '' || row.length > 0) endRow();
  return rows;
}

// First record is the header. Duplicate or blank headers are made unique.
export function csvToObjects(rows) {
  if (rows.length === 0) return [];
  const seen = new Map();
  const headers = rows[0].map((raw, i) => {
    let name = raw.trim() || 'column_' + (i + 1);
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    if (n > 1) name = name + '_' + n;
    return name;
  });
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const rec = rows[r];
    if (rec.length === 1 && rec[0] === '') continue; // blank line
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = i < rec.length ? rec[i] : '';
    });
    out.push(obj);
  }
  return out;
}

export function parseNdjson(input) {
  const lines = stripBom(String(input)).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      throw new ParseError('Line ' + (i + 1) + ' is not valid JSON.');
    }
  }
  return out;
}

export function parseJson(input) {
  try {
    return JSON.parse(stripBom(String(input)));
  } catch (e) {
    throw new ParseError('Not valid JSON: ' + e.message);
  }
}

export function detectFormat(text, name = '') {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext === 'csv') return 'csv';
  if (ext === 'ndjson' || ext === 'jsonl') return 'ndjson';
  if (ext === 'json') return 'json';
  const t = stripBom(text).trimStart();
  if (t.startsWith('[')) return 'json';
  if (t.startsWith('{')) {
    const lines = t.split(/\r?\n/).filter((l) => l.trim());
    return lines.length > 1 && lines.every((l) => l.trimStart().startsWith('{')) ? 'ndjson' : 'json';
  }
  return 'csv';
}

// Returns { data, format }. CSV becomes an array of objects keyed by header.
export function parseText(text, { name = '', format } = {}) {
  const body = stripBom(String(text));
  if (!body.trim()) throw new ParseError('There is no data to read.');
  let fmt = format || detectFormat(body, name);
  if (fmt === 'csv') return { data: csvToObjects(parseCsv(body)), format: 'csv' };
  if (fmt === 'ndjson') return { data: parseNdjson(body), format: 'ndjson' };
  try {
    return { data: parseJson(body), format: 'json' };
  } catch (err) {
    // A .json name on newline-delimited content: try NDJSON before giving up.
    if (!format) {
      try {
        return { data: parseNdjson(body), format: 'ndjson' };
      } catch {
        /* fall through to the original error */
      }
    }
    throw err;
  }
}

export function checkSize(bytes, maxBytes = DEFAULT_MAX_BYTES) {
  if (bytes > maxBytes) {
    return 'That is ' + formatBytes(bytes) + '. The limit is ' + formatBytes(maxBytes) + '.';
  }
  return null;
}
