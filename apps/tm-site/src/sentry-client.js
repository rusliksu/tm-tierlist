/* Optional, privacy-safe browser error boundary for the static TM site. */
(function (root) {
  "use strict";

  var SDK_URL = "https://browser.sentry-cdn.com/10.70.0/bundle.min.js";
  var DSN_RE = /^https:\/\/[A-Za-z0-9_]+@[A-Za-z0-9.-]+\/\d+$/;
  var SAFE_VALUE_RE = /^[A-Za-z0-9_.:/-]{1,128}$/;
  var EVENT_ID_RE = /^[0-9a-f]{32}$/;
  var MAX_COORDINATE = 1000000;

  function validDsn(value) {
    return typeof value === "string" && DSN_RE.test(value);
  }

  function safeValue(value, fallback) {
    return typeof value === "string" && SAFE_VALUE_RE.test(value) ? value : fallback;
  }

  function safeCoordinate(value) {
    return Number.isInteger(value) && value >= 0 && value <= MAX_COORDINATE ? value : null;
  }

  function sanitizeEvent(event) {
    var exception = event && event.exception;
    var values = exception && Array.isArray(exception.values) ? exception.values : null;
    if (!values || values.length === 0) return null;

    var safeValues = values
      .filter(function (value) {
        return value && typeof value === "object";
      })
      .map(function (value) {
        var safeValueData = { type: "Error" };
        var stacktrace = value.stacktrace;
        var frames = stacktrace && Array.isArray(stacktrace.frames) ? stacktrace.frames : null;
        if (frames) {
          var safeFrames = frames
            .filter(function (frame) {
              return frame && typeof frame === "object";
            })
            .map(function (frame) {
              var safeFrame = { filename: "?", function: "?" };
              var lineno = safeCoordinate(frame.lineno);
              var colno = safeCoordinate(frame.colno);
              if (lineno !== null) safeFrame.lineno = lineno;
              if (colno !== null) safeFrame.colno = colno;
              return safeFrame;
            });
          if (safeFrames.length > 0) safeValueData.stacktrace = { frames: safeFrames };
        }
        return safeValueData;
      });

    if (safeValues.length === 0) return null;

    var requestedKind = event && event.tags && event.tags.error_kind;
    var errorKind = requestedKind === "unhandled_rejection" ? requestedKind : "browser_error";
    var safeEvent = {
      platform: "javascript",
      exception: { values: safeValues },
      tags: {
        service: "tm-tierlist-site",
        runtime: "browser-static",
        error_kind: errorKind,
      },
    };
    if (event && typeof event.event_id === "string" && EVENT_ID_RE.test(event.event_id)) {
      safeEvent.event_id = event.event_id;
    }
    if (event && typeof event.environment === "string" && SAFE_VALUE_RE.test(event.environment)) {
      safeEvent.environment = event.environment;
    }
    if (event && typeof event.release === "string" && SAFE_VALUE_RE.test(event.release)) {
      safeEvent.release = event.release;
    }
    return safeEvent;
  }

  function asError(value) {
    return value && typeof value === "object" && typeof value.stack === "string"
      ? value
      : new Error("Unhandled browser error");
  }

  function installReporter(sentry, config) {
    if (!sentry || typeof sentry.init !== "function") return false;
    if (root.__TM_SENTRY_INITIALIZED__) return true;
    try {
      sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        release: config.release,
        defaultIntegrations: false,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        profilesSampleRate: 0,
        enableLogs: false,
        beforeSend: sanitizeEvent,
      });
    } catch (_) {
      return false;
    }

    function capture(value, kind) {
      try {
        var error = asError(value);
        var captureException = function () {
          sentry.captureException(error);
        };
        if (typeof sentry.withScope === "function") {
          sentry.withScope(function (scope) {
            if (scope && typeof scope.setTag === "function") {
              scope.setTag("service", "tm-tierlist-site");
              scope.setTag("runtime", "browser-static");
              scope.setTag("error_kind", kind);
            }
            captureException();
          });
        } else {
          captureException();
        }
      } catch (_) {
        // Observability must never break a static page.
      }
    }

    root.addEventListener("error", function (event) {
      if (event && event.error) capture(event.error, "browser_error");
    });
    root.addEventListener("unhandledrejection", function (event) {
      if (event && event.reason) capture(event.reason, "unhandled_rejection");
    });
    root.__TM_SENTRY_INITIALIZED__ = true;
    root.__TM_SENTRY_CAPTURE__ = capture;
    return true;
  }

  function bootstrap() {
    var dsn = root.__TM_SENTRY_DSN__;
    if (!validDsn(dsn)) return false;
    var config = {
      dsn: dsn,
      environment: safeValue(root.__TM_SENTRY_ENVIRONMENT__, "production"),
      release: safeValue(root.__TM_SENTRY_RELEASE__, "static"),
    };
    if (root.Sentry && installReporter(root.Sentry, config)) return true;

    var documentRef = root.document;
    if (!documentRef || typeof documentRef.createElement !== "function") return false;
    var script = documentRef.createElement("script");
    script.src = SDK_URL;
    script.crossOrigin = "anonymous";
    script.onload = function () {
      installReporter(root.Sentry, config);
    };
    script.onerror = function () {};
    var parent = documentRef.head || documentRef.documentElement;
    if (!parent || typeof parent.appendChild !== "function") return false;
    parent.appendChild(script);
    root.__TM_SENTRY_SDK_URL__ = SDK_URL;
    return true;
  }

  var api = { bootstrap: bootstrap, sanitizeEvent: sanitizeEvent, validDsn: validDsn };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    bootstrap();
  }
})(typeof window !== "undefined" ? window : globalThis);
