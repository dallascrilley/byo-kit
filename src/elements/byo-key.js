import { h, applyStyles, defineOnce, ElementBase } from '../dom/h.js';
import { BASE_CSS, KEY_CSS } from '../dom/styles.js';
import { getProvider, normalizeProvider, checkKeyFormat, describeRoute } from '../core/providers.js';
import { createKeyStore, maskKey } from '../core/key-store.js';

// <byo-key provider="anthropic" storage="memory"></byo-key>
//
//   el.provider = 'openai' | descriptor object
//   el.test = async (key, provider) => ({ ok, message })   optional
//   el.getKey() -> string | null
//   el.addEventListener('byo-key', (e) => e.detail)
//     { provider, state: 'set'|'forgotten'|'tested', hasKey, storage, ok?, message? }
//
// The event never carries the key. Call getKey() when you need it.
export class ByoKey extends ElementBase {
  constructor() {
    super();
    this._provider = null;
    this._test = null;
    this._store = createKeyStore({ mode: 'memory' });
    this._root = this.attachShadow({ mode: 'open' });
    applyStyles(this._root, BASE_CSS + KEY_CSS);
  }

  static get observedAttributes() {
    return ['provider', 'relay-origin'];
  }

  connectedCallback() {
    // Attributes are not readable in the constructor for parser-created elements.
    if (!this._storageRead) {
      this._storageRead = true;
      if (this.getAttribute('storage') === 'session') {
        try {
          this._store.setMode('session', '');
        } catch {
          /* stays in memory */
        }
      }
    }
    // Properties set before this element was defined sit on the instance.
    for (const prop of ['provider', 'test']) {
      if (Object.prototype.hasOwnProperty.call(this, prop)) {
        const value = this[prop];
        delete this[prop];
        this[prop] = value;
      }
    }
    if (!this._provider && this.getAttribute('provider')) this.provider = this.getAttribute('provider');
    if (!this._built) this._render();
  }

  attributeChangedCallback(name) {
    if (name === 'provider' && this.isConnected) this.provider = this.getAttribute('provider');
    if (name === 'relay-origin' && this._built) this._render();
  }

  get provider() {
    return this._provider;
  }

  set provider(value) {
    try {
      const d = typeof value === 'string' ? getProvider(value) : value;
      if (!d) throw new TypeError('Unknown provider "' + value + '".');
      this._provider = normalizeProvider(d);
      this._providerError = '';
    } catch (e) {
      this._provider = null;
      this._providerError = e.message;
    }
    if (this.isConnected) this._render();
  }

  get test() {
    return this._test;
  }

  set test(fn) {
    this._test = typeof fn === 'function' ? fn : null;
    if (this._built && this._testBtn) this._testBtn.hidden = !this._test;
  }

  get storage() {
    return this._store.mode;
  }

  getKey() {
    return this._provider ? this._store.get(this._provider.id) : null;
  }

  _origin() {
    return this.getAttribute('relay-origin') || globalThis.location?.origin || '';
  }

  _emit(state, extra = {}) {
    const detail = {
      provider: this._provider ? this._provider.id : null,
      state,
      hasKey: !!this.getKey(),
      storage: this._store.mode,
      ...extra,
    };
    this.dispatchEvent(new CustomEvent('byo-key', { detail, bubbles: true, composed: true }));
  }

  _render() {
    this._built = true;
    this._root.replaceChildren();
    const p = this._provider;
    if (!p) {
      this._root.append(
        h('section', { class: 'box', part: 'box' }, h('p', { class: 'status', 'data-tone': 'bad', role: 'alert' }, this._providerError || 'Set a provider for this element.')),
      );
      return;
    }
    const route = describeRoute(p, this._origin());
    const held = this._store.get(p.id);

    this._input = h('input', {
      id: 'key',
      type: 'password',
      part: 'input',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      'data-1p-ignore': true,
      'data-lpignore': 'true',
      placeholder: 'Paste your ' + p.label + ' key',
    });
    if (held) this._input.value = held;
    this._show = h('button', { type: 'button', part: 'button', 'aria-pressed': 'false', 'aria-label': 'Show key' }, 'Show');
    this._use = h('button', { type: 'button', part: 'button primary', class: 'primary' }, 'Use key');
    this._forget = h('button', { type: 'button', part: 'button', class: 'link' }, 'Forget key');
    this._testBtn = h('button', { type: 'button', part: 'button', hidden: !this._test }, 'Test key');
    this._status = h('p', { class: 'status', part: 'status', role: 'status', 'aria-live': 'polite' });
    this._error = h('ul', { class: 'errors', part: 'errors', role: 'alert', hidden: true });

    const radio = (value, text) =>
      h(
        'label',
        { class: 'choice', part: 'choice' },
        h('input', { type: 'radio', name: 'storage', value, checked: this._store.mode === value }),
        text,
      );
    const fieldset = h(
      'div',
      { class: 'keep', role: 'radiogroup', 'aria-label': 'Where to keep the key' },
      h('span', { class: 'lead', 'aria-hidden': 'true' }, 'Keep it'),
      radio('memory', 'In memory (default)'),
      radio('session', 'In sessionStorage'),
    );

    const routeBox = h('p', { class: 'route', part: 'route' }, route.text);
    if (p.note) routeBox.append(h('span', { class: 'note' }, p.note));
    // Memory is gone on reload. sessionStorage is gone when the tab closes.
    fieldset.title = 'Memory: gone when you reload. sessionStorage: gone when you close the tab.';

    const head = h('div', { class: 'head' }, h('label', { for: 'key', part: 'label' }, p.label + ' API key'));
    if (p.docsUrl) {
      head.append(h('a', { href: p.docsUrl, target: '_blank', rel: 'noopener noreferrer', part: 'link' }, 'Get a key'));
    }

    this._root.append(
      h(
        'section',
        { class: 'box', part: 'box' },
        head,
        h('div', { class: 'field' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, this._input), this._show, this._use)),
        h('div', { class: 'row actions' }, this._testBtn, this._forget),
        fieldset,
        routeBox,
        this._status,
        this._error,
      ),
    );
    this._wire(fieldset);
    this._refresh();
  }

  _wire(fieldset) {
    this._show.addEventListener('click', () => {
      const show = this._input.type === 'password';
      this._input.type = show ? 'text' : 'password';
      this._show.textContent = show ? 'Hide' : 'Show';
      this._show.setAttribute('aria-pressed', String(show));
      this._show.setAttribute('aria-label', show ? 'Hide key' : 'Show key');
    });
    this._use.addEventListener('click', () => this._save());
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._save();
      }
    });
    this._forget.addEventListener('click', () => this._forgetKey());
    this._testBtn.addEventListener('click', () => this._runTest());
    fieldset.addEventListener('change', (e) => {
      if (e.target.name !== 'storage') return;
      try {
        this._store.setMode(e.target.value, this._provider.id);
      } catch (err) {
        this._store.setMode('memory', this._provider.id);
        this._showError([err.message]);
      }
      for (const r of fieldset.querySelectorAll('input')) r.checked = r.value === this._store.mode;
      this._refresh();
      this._emit('set');
    });
  }

  _showError(list) {
    this._error.replaceChildren(...list.map((m) => h('li', null, m)));
    this._error.hidden = list.length === 0;
  }

  _setStatus(text, tone) {
    this._status.textContent = text;
    if (tone) this._status.setAttribute('data-tone', tone);
    else this._status.removeAttribute('data-tone');
  }

  _refresh() {
    const key = this.getKey();
    this._forget.disabled = !key;
    this._testBtn.disabled = !key;
    if (key) {
      const where = this._store.mode === 'session' ? 'in sessionStorage for this tab' : 'in memory';
      this._setStatus('Key ready (' + maskKey(key) + '), held ' + where + '.', 'good');
    } else {
      this._setStatus('No key set. Features that need a key stay off.');
    }
  }

  _save() {
    const value = this._input.value.trim();
    const problem = checkKeyFormat(this._provider, value);
    if (problem) {
      this._showError([problem]);
      return;
    }
    this._showError([]);
    try {
      this._store.set(this._provider.id, value);
    } catch (err) {
      this._showError([err.message]);
      return;
    }
    this._refresh();
    this._emit('set');
  }

  _forgetKey() {
    this._store.clear(this._provider.id);
    this._input.value = '';
    this._showError([]);
    this._refresh();
    this._emit('forgotten');
  }

  async _runTest() {
    const key = this.getKey();
    if (!key || !this._test) return;
    this.setAttribute('data-test', 'running');
    this._testBtn.disabled = true;
    this._setStatus('Testing the key…');
    let result;
    try {
      result = await this._test(key, this._provider);
    } catch {
      result = { ok: false, message: 'The test call failed.' };
    }
    const ok = !!(result && result.ok);
    const message = (result && result.message) || (ok ? 'The key works.' : 'The key did not work.');
    this.setAttribute('data-test', ok ? 'ok' : 'fail');
    this._testBtn.disabled = !this.getKey();
    this._setStatus(message, ok ? 'good' : 'bad');
    this._emit('tested', { ok, message });
  }
}

defineOnce('byo-key', ByoKey);
