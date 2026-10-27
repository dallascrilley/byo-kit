import { h, applyStyles, defineOnce, ElementBase } from '../dom/h.js';
import { BASE_CSS, DATA_CSS } from '../dom/styles.js';
import { parseText, byteLength, checkSize, formatBytes, DEFAULT_MAX_BYTES } from '../core/parse.js';
import { countNetworkCalls } from '../core/network-guard.js';

export const PRIVACY_LINE = 'Processed in your browser. Nothing is uploaded.';
const DEFAULT_LABEL = 'Drop a CSV, JSON or NDJSON file here';
const DEFAULT_PLACEHOLDER = 'name,score\nAda,12';
const DEFAULT_ACCEPT = '.csv,.json,.ndjson,.jsonl,.txt,text/csv,application/json';

// <byo-data sample-url="sample.csv" max-bytes="5242880"></byo-data>
//
//   Attributes (all optional)
//     sample-url         adds a "Use sample data" button
//     max-bytes          size limit, default 5 MiB
//     label              heading of the drop zone
//     paste-placeholder  placeholder text of the paste box
//     accept             accept value of the file picker, also shown as a hint
//     hide-paste         hides the paste box
//
//   el.validate = (data) => string[]     optional; any strings are shown as errors
//   el.addEventListener('byo-data', (e) => e.detail)   { data, name, source, bytes }
//   el.value, el.load(text, { name, source }), el.clear()
export class ByoData extends ElementBase {
  constructor() {
    super();
    this._value = null;
    this._root = this.attachShadow({ mode: 'open' });
    applyStyles(this._root, BASE_CSS + DATA_CSS);
    this._build();
  }

  get value() {
    return this._value;
  }

  get maxBytes() {
    const n = Number(this.getAttribute('max-bytes'));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
  }

  _build() {
    const sampleUrl = this.getAttribute('sample-url');
    this._file = h('input', {
      type: 'file',
      hidden: true,
      'aria-label': 'Choose a data file',
      accept: DEFAULT_ACCEPT,
    });
    this._pick = h('button', { type: 'button', part: 'button primary', class: 'primary' }, 'Choose file');
    this._sample = h('button', { type: 'button', part: 'button', hidden: !sampleUrl }, 'Use sample data');
    this._title = h('strong', null, DEFAULT_LABEL);
    this._hint = h('span', { class: 'hint', part: 'hint', hidden: true });
    this._dz = h(
      'div',
      { class: 'dz', part: 'dropzone', role: 'group', 'aria-label': 'Drop a data file here' },
      this._title,
      this._hint,
      h('div', { class: 'row' }, this._pick, this._sample, this._file),
    );
    this._text = h('textarea', {
      id: 'paste',
      part: 'textarea',
      rows: '2',
      spellcheck: 'false',
      placeholder: DEFAULT_PLACEHOLDER,
    });
    this._use = h('button', { type: 'button', part: 'button' }, 'Use pasted data');
    this._paste = h(
      'div',
      { class: 'paste' },
      h('label', { for: 'paste', part: 'label' }, 'Or paste data'),
      h('div', { class: 'pr' }, this._text, this._use),
    );
    this._privacy = h('p', { class: 'privacy', part: 'privacy' }, PRIVACY_LINE);
    this._status = h('p', { class: 'status', part: 'status', role: 'status', 'aria-live': 'polite' });
    this._errors = h('ul', { class: 'errors', part: 'errors', role: 'alert', hidden: true });
    this._root.append(h('section', { class: 'box', part: 'box' }, this._dz, this._paste, this._privacy, this._status, this._errors));

    this._applyOptions();
    this._pick.addEventListener('click', () => this._file.click());
    this._file.addEventListener('change', () => {
      const f = this._file.files && this._file.files[0];
      this._file.value = '';
      if (f) this._readFile(f);
    });
    this._sample.addEventListener('click', () => this._loadSample());
    this._use.addEventListener('click', () => {
      const text = this._text.value;
      this.load(text, { name: 'pasted data', source: 'paste' });
    });
    for (const type of ['dragenter', 'dragover']) {
      this._dz.addEventListener(type, (e) => {
        e.preventDefault();
        this.setAttribute('dragging', '');
      });
    }
    this._dz.addEventListener('dragleave', () => this.removeAttribute('dragging'));
    this._dz.addEventListener('drop', (e) => {
      e.preventDefault();
      this.removeAttribute('dragging');
      const files = e.dataTransfer?.files;
      if (files && files.length) this._readFile(files[0], files.length > 1);
    });
  }

  static get observedAttributes() {
    return ['sample-url', 'label', 'paste-placeholder', 'accept', 'hide-paste'];
  }

  attributeChangedCallback() {
    if (this._sample) this._applyOptions();
  }

  // Reads the display attributes. An empty or missing value restores the default.
  _applyOptions() {
    this._sample.hidden = !this.getAttribute('sample-url');
    this._title.textContent = this.getAttribute('label') || DEFAULT_LABEL;
    this._text.setAttribute('placeholder', this.getAttribute('paste-placeholder') || DEFAULT_PLACEHOLDER);
    const accept = (this.getAttribute('accept') || '').trim();
    this._file.setAttribute('accept', accept || DEFAULT_ACCEPT);
    this._hint.textContent = accept ? 'Accepted: ' + accept.split(',').map((t) => t.trim()).filter(Boolean).join(', ') : '';
    this._hint.hidden = !accept;
    this._paste.hidden = this.hasAttribute('hide-paste');
  }

  clear() {
    this._value = null;
    this._status.textContent = '';
    this._status.removeAttribute('data-tone');
    this._showErrors([]);
  }

  async _readFile(file, extra = false) {
    const tooBig = checkSize(file.size, this.maxBytes);
    if (tooBig) return this._fail([file.name + ': ' + tooBig]);
    let text;
    try {
      text = await file.text();
    } catch {
      return this._fail(['Could not read ' + file.name + '.']);
    }
    await this.load(text, { name: file.name, source: 'file', bytes: file.size, note: extra ? 'Using the first file only.' : '' });
  }

  async _loadSample() {
    const url = this.getAttribute('sample-url');
    if (!url) return;
    let text;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      text = await res.text();
    } catch {
      return this._fail(['Could not load the sample data.']);
    }
    const name = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || 'sample');
    await this.load(text, { name, source: 'sample' });
  }

  // Parse, validate and announce. Everything inside the guard is the
  // "processing" the page can truthfully report on.
  async load(text, { name = 'data', source = 'paste', bytes, note = '' } = {}) {
    const size = bytes ?? byteLength(text);
    const tooBig = checkSize(size, this.maxBytes);
    if (tooBig) return this._fail([tooBig]);
    let outcome;
    try {
      outcome = await countNetworkCalls(() => {
        const { data } = parseText(text, { name });
        let problems = [];
        if (typeof this.validate === 'function') {
          const r = this.validate(data);
          problems = Array.isArray(r) ? r.map(String) : [];
        }
        if (problems.length === 0) {
          const detail = { data, name, source, bytes: size };
          this._value = detail;
          this.dispatchEvent(new CustomEvent('byo-data', { detail, bubbles: true, composed: true }));
        }
        return { data, problems };
      });
    } catch (e) {
      return this._fail([e.message || 'Could not read that data.']);
    }
    const { problems } = outcome.result;
    if (problems.length) return this._fail(problems);
    this._showErrors([]);
    const { data } = outcome.result;
    const n = Array.isArray(data) ? data.length + (data.length === 1 ? ' record' : ' records') : 'one value';
    const net =
      outcome.count === 0
        ? '0 network requests while processing.'
        : outcome.count + ' network request' + (outcome.count === 1 ? '' : 's') + ' while processing (' + outcome.calls[0].url + ').';
    this._setStatus(
      'Loaded ' + name + ': ' + n + ', ' + formatBytes(size) + '. ' + net + (note ? ' ' + note : ''),
      outcome.count === 0 ? 'good' : 'warn',
    );
    return this._value;
  }

  _setStatus(text, tone) {
    this._status.textContent = text;
    if (tone) this._status.setAttribute('data-tone', tone);
    else this._status.removeAttribute('data-tone');
  }

  _showErrors(list) {
    this._errors.replaceChildren(...list.map((m) => h('li', null, m)));
    this._errors.hidden = list.length === 0;
  }

  _fail(list) {
    this._value = null;
    this._setStatus('Nothing was loaded.', 'bad');
    this._showErrors(list);
    this.dispatchEvent(new CustomEvent('byo-data-error', { detail: { errors: list }, bubbles: true, composed: true }));
  }
}

defineOnce('byo-data', ByoData);
