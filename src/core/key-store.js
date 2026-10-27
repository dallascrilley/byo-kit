// Holds one key per provider. Memory is the default. sessionStorage is the only
// persistent option, and only when the user chooses it. Nothing else ever keeps a key.

const PREFIX = 'byo-kit:key:';

export function createKeyStore({ mode = 'memory', session } = {}) {
  const memory = new Map();
  let current = mode === 'session' ? 'session' : 'memory';
  const sess = () => {
    try {
      return session || globalThis.sessionStorage || null;
    } catch {
      return null;
    }
  };
  return {
    get mode() {
      return current;
    },
    get(id) {
      if (current === 'session') {
        const s = sess();
        return (s && s.getItem(PREFIX + id)) || null;
      }
      return memory.get(id) || null;
    },
    set(id, key) {
      if (current === 'session') {
        const s = sess();
        if (!s) throw new Error('sessionStorage is not available here.');
        s.setItem(PREFIX + id, key);
      } else {
        memory.set(id, key);
      }
    },
    clear(id) {
      memory.delete(id);
      const s = sess();
      if (s) s.removeItem(PREFIX + id);
    },
    // Move any held key to the new place and wipe the old one.
    setMode(next, id) {
      const target = next === 'session' ? 'session' : 'memory';
      if (target === current) return;
      const key = this.get(id);
      this.clear(id);
      current = target;
      if (key) this.set(id, key);
    },
  };
}

export function maskKey(key) {
  if (!key) return '';
  const k = key.trim();
  return k.length <= 8 ? '••••' : k.slice(0, 3) + '…' + k.slice(-4);
}
