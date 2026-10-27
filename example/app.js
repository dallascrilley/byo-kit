// Example page: both components, plus a small column profiler.
import { downloadText, createKeyTest, countNetworkCalls, hostOf, getProvider } from '../dist/byo-kit.js';
import { validateRows, toRows, profileColumns, profileToCsv, summarizeForModel } from './profile.js';
import { DEFAULT_MODELS, describeDataset } from './ai.js';

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text; // text only: user data never becomes markup
  return e;
}

const dataEl = $('data');
const keyEl = $('key');
let profile = null;
let rowCount = 0;
let dataName = 'dataset';

dataEl.validate = validateRows;
keyEl.test = (key, provider) => createKeyTest(provider)(key);

function fmt(n) {
  return typeof n === 'number' ? String(Math.round(n * 100) / 100) : String(n);
}

function render() {
  const body = $('cols').tBodies[0];
  body.replaceChildren();
  for (const c of profile) {
    const tr = el('tr');
    tr.append(el('td', 'name', c.name));
    const type = el('td');
    type.append(el('span', 'chip ' + c.type, c.type));
    tr.append(type);
    const pct = rowCount ? Math.round((100 * c.filled) / rowCount) : 0;
    const filled = el('td', 'num');
    const bar = el('span', 'bar2' + (pct < 90 ? ' low' : ''));
    const fill = el('i');
    fill.style.width = pct + '%';
    bar.append(fill);
    filled.append(bar, document.createTextNode(pct + '%'));
    tr.append(filled, el('td', 'num', String(c.unique)));
    tr.append(el('td', 'num', c.min !== null ? fmt(c.min) + ' to ' + fmt(c.max) : '–'));
    tr.append(el('td', 'common', c.top.length ? c.top.map((t) => t.value + ' ×' + t.count).join(', ') : c.unique === c.filled && c.filled > 1 ? 'every value is unique' : '–'));
    body.append(tr);
  }
  const gaps = profile.filter((c) => c.missing > 0).length;
  $('summary').textContent =
    dataName + ': ' + rowCount + ' rows, ' + profile.length + ' columns' + (gaps ? ', ' + gaps + ' with gaps' : '');
  $('empty').hidden = true;
  $('table-wrap').hidden = false;
  $('export').disabled = false;
}

dataEl.addEventListener('byo-data', (e) => {
  const rows = toRows(e.detail.data);
  profile = profileColumns(rows);
  rowCount = rows.length;
  dataName = e.detail.name;
  render();
  $('answer').textContent = '';
  $('answer').classList.remove('err');
  $('net').textContent = '';
  syncDescribe();
});

$('export').addEventListener('click', () => {
  if (profile) downloadText(dataName.replace(/\.[^.]+$/, '') + '-profile.csv', profileToCsv(profile));
});

function syncDescribe() {
  $('describe').disabled = !(profile && keyEl.getKey());
}
keyEl.addEventListener('byo-key', syncDescribe);

function setProvider(id) {
  keyEl.provider = id;
  $('model').value = DEFAULT_MODELS[id] || '';
  syncDescribe();
}
$('provider').addEventListener('change', (e) => setProvider(e.target.value));
$('model').value = DEFAULT_MODELS.openrouter;

$('describe').addEventListener('click', async () => {
  const key = keyEl.getKey();
  if (!profile || !key) return;
  const providerId = $('provider').value;
  const answer = $('answer');
  answer.classList.remove('err');
  answer.textContent = 'Asking ' + getProvider(providerId).label + '…';
  $('net').textContent = '';
  $('describe').disabled = true;
  try {
    const { result, calls } = await countNetworkCalls(() =>
      describeDataset({
        providerId,
        key,
        model: $('model').value.trim(),
        summary: summarizeForModel(profile, rowCount),
      }),
    );
    answer.textContent = result.text;
    $('net').textContent =
      calls.length + ' network request' + (calls.length === 1 ? '' : 's') + ' to ' + [...new Set(calls.map((c) => hostOf(c.url)))].join(', ') + '. Your rows were not sent.';
  } catch (err) {
    answer.classList.add('err');
    answer.textContent = err.message || 'The request failed.';
  } finally {
    syncDescribe();
  }
});
