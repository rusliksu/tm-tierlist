import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const source = await readFile(
  path.join(repoRoot, "apps/tm-site/src/sentry-client.js"),
  "utf8",
);

function runInBrowser(window) {
  const context = { window, globalThis: window, console };
  vm.runInNewContext(source, context, { filename: "sentry-client.js" });
}

function makeWindow(config = {}) {
  const listeners = new Map();
  const scripts = [];
  const window = {
    ...config,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    document: {
      createElement(type) {
        assert.equal(type, "script");
        return { onload: null, onerror: null };
      },
      head: {
        appendChild(script) {
          scripts.push(script);
        },
      },
    },
  };
  return { window, listeners, scripts };
}

{
  const { window, listeners, scripts } = makeWindow();
  runInBrowser(window);
  assert.equal(scripts.length, 0, "no DSN must not load the CDN");
  assert.equal(listeners.size, 0, "no DSN must not install listeners");
}

{
  const { window, listeners, scripts } = makeWindow({
    __TM_SENTRY_DSN__: "https://public@example.com/1",
    __TM_SENTRY_ENVIRONMENT__: "staging",
    __TM_SENTRY_RELEASE__: "tm-tierlist-test-abc123",
  });
  runInBrowser(window);
  assert.equal(scripts.length, 1);
  assert.equal(
    scripts[0].src,
    "https://browser.sentry-cdn.com/10.70.0/bundle.min.js",
  );
  assert.equal(listeners.size, 0, "listeners wait for the SDK load");

  const captured = [];
  const scopeTags = {};
  window.Sentry = {
    init(options) {
      this.options = options;
    },
    withScope(callback) {
      callback({
        setTag(key, value) {
          scopeTags[key] = value;
        },
      });
    },
    captureException(error) {
      const event = {
        event_id: "0123456789abcdef0123456789abcdef",
        environment: "staging",
        release: "tm-tierlist-test-abc123",
        message: "secret message",
        request: {
          headers: { authorization: "secretAuthorization" },
          cookies: { session: "secretCookie" },
          query_string: "secretQuery",
          data: "secretBody",
        },
        user: { ip_address: "10.0.0.42" },
        contexts: { nested: { value: "secretNested" } },
        extra: { token: "secretExtra" },
        tags: { ...scopeTags },
        exception: {
          values: [
            {
              type: "Error",
              value: error.message,
              stacktrace: {
                frames: [
                  {
                    filename: "bot/secretSentinel.js",
                    function: "secretFunction",
                    lineno: 17,
                    colno: 4,
                  },
                ],
              },
            },
          ],
        },
      };
      captured.push(this.options.beforeSend(event, {}));
    },
  };
  scripts[0].onload();
  assert.equal(listeners.size, 2);
  listeners.get("error")({ error: new Error("secretErrorMessage") });
  listeners.get("unhandledrejection")({ reason: "secretRejection" });
  assert.equal(captured.length, 2);
  for (const event of captured) {
    assert.equal(event.tags.service, "tm-tierlist-site");
    assert.equal(event.tags.runtime, "browser-static");
    assert.match(event.tags.error_kind, /^(browser_error|unhandled_rejection)$/);
    const serialized = JSON.stringify(event);
    for (const sentinel of [
      "secretErrorMessage",
      "secretRejection",
      "secretAuthorization",
      "secretCookie",
      "10.0.0.42",
      "secretQuery",
      "secretBody",
      "secretNested",
      "secretExtra",
      "secretSentinel.js",
      "secretFunction",
    ]) {
      assert.equal(serialized.includes(sentinel), false, sentinel);
    }
    assert.equal(event.exception.values[0].type, "Error");
    assert.equal(event.exception.values[0].stacktrace.frames[0].filename, "?");
    assert.equal(event.exception.values[0].stacktrace.frames[0].function, "?");
    assert.equal("message" in event, false);
    assert.equal("request" in event, false);
    assert.equal("user" in event, false);
    assert.equal("contexts" in event, false);
    assert.equal("extra" in event, false);
  }
}

{
  const { window, listeners, scripts } = makeWindow({
    __TM_SENTRY_DSN__: "HTTPS://public@example.com/1",
  });
  runInBrowser(window);
  assert.equal(scripts.length, 0);
  assert.equal(listeners.size, 0);
}

const require = createRequire(import.meta.url);
const { validDsn } = require(path.join(repoRoot, "apps/tm-site/src/sentry-client.js"));
assert.equal(validDsn("https://public@example.com/1"), true);
assert.equal(validDsn("https://public%5Fkey@example.com/1"), false);
assert.equal(validDsn("https://user:password@example.com/1"), false);
assert.equal(validDsn("https://public@example.com/1?secret=1"), false);

console.log("Sentry browser boundary tests: OK");
