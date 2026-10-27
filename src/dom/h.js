// Tiny DOM helpers. Text always goes in as text nodes, never as markup.

export const ElementBase = globalThis.HTMLElement || class {};

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// Constructed stylesheets work under a strict Content Security Policy;
// a <style> element is the fallback for older browsers.
export function applyStyles(root, css) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = css;
    root.append(style);
  }
}

export function defineOnce(name, cls) {
  if (globalThis.customElements && !globalThis.customElements.get(name)) {
    globalThis.customElements.define(name, cls);
  }
}

// Save text as a file in the browser. Nothing is sent anywhere.
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
