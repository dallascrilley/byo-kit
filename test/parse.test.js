import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv, csvToObjects, parseNdjson, parseJson, detectFormat, parseText, ParseError, checkSize, formatBytes,
} from '../src/core/parse.js';

test('csv: plain rows with LF and CRLF', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\r1,2'), [['a', 'b'], ['1', '2']]);
});

test('csv: quotes, escaped quotes, commas and newlines inside quotes', () => {
  const rows = parseCsv('name,note\r\n"Smith, Ada","said ""hi"""\r\n"two\r\nlines",x\r\n');
  assert.deepEqual(rows, [['name', 'note'], ['Smith, Ada', 'said "hi"'], ['two\r\nlines', 'x']]);
});

test('csv: byte order mark is removed', () => {
  assert.deepEqual(parseCsv('\uFEFFid,name\n1,Ada'), [['id', 'name'], ['1', 'Ada']]);
});

test('csv: empty fields, trailing comma, no trailing newline, quoted empty', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,\n,"",3'), [['a', 'b', 'c'], ['1', '', ''], ['', '', '3']]);
  assert.deepEqual(parseCsv(''), []);
});

test('csv: a stray quote inside an unquoted field is kept', () => {
  assert.deepEqual(parseCsv('size\n5" pipe'), [['size'], ['5" pipe']]);
});

test('csv: unterminated quote and junk after a closing quote are errors', () => {
  assert.throws(() => parseCsv('a\n"open'), ParseError);
  assert.throws(() => parseCsv('a\n"x"y'), ParseError);
});

test('csvToObjects: headers made unique, blank lines skipped, short rows padded', () => {
  const objs = csvToObjects(parseCsv('id,id,\n1,2,3\n\n4\n'));
  assert.deepEqual(objs, [
    { id: '1', id_2: '2', column_3: '3' },
    { id: '4', id_2: '', column_3: '' },
  ]);
});

test('ndjson: parses lines, reports the failing line', () => {
  assert.deepEqual(parseNdjson('{"a":1}\n\n{"a":2}\r\n'), [{ a: 1 }, { a: 2 }]);
  assert.throws(() => parseNdjson('{"a":1}\nnope'), /Line 2/);
});

test('json: parses and reports errors as ParseError', () => {
  assert.deepEqual(parseJson('[1,2]'), [1, 2]);
  assert.throws(() => parseJson('{'), ParseError);
});

test('detectFormat: extension first, then content', () => {
  assert.equal(detectFormat('x', 'a.csv'), 'csv');
  assert.equal(detectFormat('x', 'a.jsonl'), 'ndjson');
  assert.equal(detectFormat('[1]', ''), 'json');
  assert.equal(detectFormat('{"a":1}\n{"a":2}', ''), 'ndjson');
  assert.equal(detectFormat('{"a":1}', ''), 'json');
  assert.equal(detectFormat('a,b\n1,2', ''), 'csv');
});

test('parseText: csv becomes records; json and ndjson pass through', () => {
  assert.deepEqual(parseText('a,b\n1,2', { name: 'x.csv' }), { data: [{ a: '1', b: '2' }], format: 'csv' });
  assert.deepEqual(parseText('[{"a":1}]').data, [{ a: 1 }]);
  assert.deepEqual(parseText('{"a":1}\n{"a":2}').data, [{ a: 1 }, { a: 2 }]);
});

test('parseText: a .json name on NDJSON content still works', () => {
  assert.equal(parseText('{"a":1}\n{"a":2}', { name: 'x.json' }).format, 'ndjson');
});

test('parseText: empty input is an error', () => {
  assert.throws(() => parseText('  \n '), /no data/);
});

test('size limit', () => {
  assert.equal(checkSize(100, 200), null);
  assert.match(checkSize(3 * 1024 * 1024, 1024 * 1024), /3\.0 MB.*1\.0 MB/);
  assert.equal(formatBytes(512), '512 B');
});
