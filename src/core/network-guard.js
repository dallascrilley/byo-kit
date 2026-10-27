// Counts fetch, XMLHttpRequest and sendBeacon calls made while a callback runs,
// so a page can truthfully say "0 network requests while processing".
//
// Honest limits: it sees only those three APIs. It does not see image or
// script loads, WebSockets, or requests from other origins' frames. It counts
// every call from this page during the window, including unrelated ones.

export async function countNetworkCalls(fn, env = globalThis) {
  const calls = [];
  const restore = [];
  const note = (kind, target) => {
    let url = '';
    try {
      const raw = typeof target === 'string' ? target : target?.url || String(target);
      const u = new URL(raw, env.location?.href || 'http://localhost/');
      url = u.origin + u.pathname; // drop query and hash
    } catch {
      url = '(unparsed)';
    }
    calls.push({ kind, url });
  };

  if (typeof env.fetch === 'function') {
    const original = env.fetch;
    env.fetch = function (input, ...rest) {
      note('fetch', input);
      return original.call(this, input, ...rest);
    };
    restore.push(() => {
      env.fetch = original;
    });
  }
  const xhrProto = env.XMLHttpRequest?.prototype;
  if (xhrProto && typeof xhrProto.open === 'function' && typeof xhrProto.send === 'function') {
    const origOpen = xhrProto.open;
    const origSend = xhrProto.send;
    xhrProto.open = function (method, url, ...rest) {
      this.__byoUrl = url;
      return origOpen.call(this, method, url, ...rest);
    };
    xhrProto.send = function (...args) {
      note('xhr', this.__byoUrl || '');
      return origSend.apply(this, args);
    };
    restore.push(() => {
      xhrProto.open = origOpen;
      xhrProto.send = origSend;
    });
  }
  const nav = env.navigator;
  if (nav && typeof nav.sendBeacon === 'function') {
    const original = nav.sendBeacon;
    nav.sendBeacon = function (url, ...rest) {
      note('beacon', url);
      return original.call(this, url, ...rest);
    };
    restore.push(() => {
      nav.sendBeacon = original;
    });
  }

  try {
    const result = await fn();
    return { result, count: calls.length, calls };
  } finally {
    for (const undo of restore.reverse()) undo();
  }
}
