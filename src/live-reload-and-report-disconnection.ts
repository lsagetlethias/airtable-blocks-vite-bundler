/// <reference lib="dom" />
// Live-reload client shim for Vite.
// Keep this file stable and resilient across Vite versions. It does NOT
// require internal Vite client internals; instead it listens for well-known
// postMessage events and falls back to a heartbeat timeout to detect
// disconnection in environments that expect an uncaught error.

(function () {
  // Known event types emitted by various dev clients. We treat the
  // absence of messages as a potential disconnection, but avoid throwing
  // immediately to prevent noisy false positives.
  const KNOWN_CONNECTED_TYPES = new Set([
    'connected',
    'vite:connect',
    'vite:beforeUpdate',
    'update',
    'full-reload',
  ]);
  const POSSIBLE_DISCONNECT_TYPES = new Set(['viteClose', 'vite:disconnect', 'ws-close']);

  let lastSeen = Date.now();

  function onMessage(event: MessageEvent) {
    try {
      const data = event && event.data;
      const t = data && data.type;
      if (t && KNOWN_CONNECTED_TYPES.has(t)) {
        lastSeen = Date.now();
        return;
      }

      if (t && POSSIBLE_DISCONNECT_TYPES.has(t)) {
        throw new Error('Disconnected from development server');
      }
    } catch (err) {
      // Re-throw so the runtime surfaces an uncaught error as intended.
      setTimeout(() => {
        throw err;
      }, 0);
    }
  }

  addEventListener('message', onMessage);

  // Heartbeat: if we haven't seen any matching messages for a while, assume
  // the client was disconnected. We keep this timeout conservative.
  const HEARTBEAT_MS = 30_000; // 30s
  setInterval(() => {
    if (Date.now() - lastSeen > HEARTBEAT_MS) {
      // Throw asynchronously so it becomes an uncaught error in the page
      // and surfaces to the dev UI.
      setTimeout(() => {
        throw new Error('Disconnected from development server (no heartbeat)');
      }, 0);
    }
  }, HEARTBEAT_MS);
})();
