import test from 'node:test';
import assert from 'node:assert/strict';
import { neutralizeFormula, csvCell, toCsv } from '../src/core/csv-export.js';
import { parseCsv } from '../src/core/parse.js';

test('formula starters are neutralized', () => {
  for (const bad of ['=SUM(A1)', '+cmd|calc', '-2+3', '@HYPERLINK("x")', '\tpad', '\rcr', '=1+1']) {
    assert.ok(neutralizeFormula(bad).startsWith("'"), bad);
  }
});

test('plain text and plain numbers are left alone', () => {
  assert.equal(neutralizeFormula('hello'), 'hello');
  assert.equal(neutralizeFormula('-5'), '-5');
  assert.equal(neutralizeFormula('+1.5e3'), '+1.5e3');
  assert.equal(neutralizeFormula(''), '');
  assert.equal(csvCell(-3), '-3');
});

test('csvCell quotes commas, quotes and newlines, and handles null and objects', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('l1\nl2'), '"l1\nl2"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell({ a: 1 }), '"{""a"":1}"');
});

test('toCsv: arrays with columns, objects, CRLF endings, header neutralized', () => {
  assert.equal(toCsv([[1, 'x']], ['n', '=evil']), "n,'=evil\r\n1,x\r\n");
  assert.equal(toCsv([{ a: 1, b: '=2+2' }, { a: 3 }]), "a,b\r\n1,'=2+2\r\n3,\r\n");
});

test('round trip through the parser keeps awkward values', () => {
  const rows = [['a', 'b'], ['x, y', 'q"uote'], ['line\nbreak', ' pad ']];
  assert.deepEqual(parseCsv(toCsv(rows.slice(1), rows[0])), rows);
});
