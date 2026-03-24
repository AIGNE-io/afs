export const FRAME_JS = `
  // ── Frame Renderer (sandboxed iframe for page isolation) ──

  // Track known iframe contentWindows for origin validation
  var _aupFrameWindows = new Set();
  var _aupBridgeWindows = new Set();
  var _aupBridgeOriginByWindow = new Map();

  function _isHttpUrl(src) {
    try {
      var u = new URL(src, location.href);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch (_ex) {
      return false;
    }
  }

  function _isSameOriginUrl(src) {
    try {
      return new URL(src, location.href).origin === location.origin;
    } catch (_ex) {
      return false;
    }
  }

  function _resolveFrameSrc(rawSrc, bridgeRequested) {
    var src = typeof rawSrc === "string" ? rawSrc.trim() : "";
    if (!src) return null;

    if (src.indexOf("/pages/") === 0) {
      var pageId = src.replace(/^\\/pages\\//, "");
      if (!pageId) return null;
      var query = [];
      if (_afsSessionId) query.push("sid=" + encodeURIComponent(_afsSessionId));
      if (_afsSessionToken) query.push("st=" + encodeURIComponent(_afsSessionToken));
      if (bridgeRequested) query.push("bridge=1");
      var localUrl = location.origin + "/p/" + encodeURIComponent(pageId);
      if (query.length) localUrl += "?" + query.join("&");
      return { url: localUrl, bridgeEnabled: !!bridgeRequested };
    }

    // Same-origin relative path (e.g. /terminal)
    if (src.indexOf("/") === 0) {
      return { url: src, bridgeEnabled: !!bridgeRequested };
    }

    if (_isHttpUrl(src)) {
      return {
        url: src,
        bridgeEnabled: !!bridgeRequested && _isSameOriginUrl(src),
      };
    }

    return null;
  }

  function _normalizeSandbox(rawSandbox, bridgeEnabled) {
    var base = ["allow-scripts", "allow-forms", "allow-popups"];
    var allowed = {
      "allow-downloads": 1,
      "allow-forms": 1,
      "allow-modals": 1,
      "allow-orientation-lock": 1,
      "allow-pointer-lock": 1,
      "allow-popups": 1,
      "allow-popups-to-escape-sandbox": 1,
      "allow-presentation": 1,
      "allow-same-origin": 1,
      "allow-scripts": 1,
      "allow-storage-access-by-user-activation": 1,
      "allow-top-navigation": 1,
      "allow-top-navigation-by-user-activation": 1,
    };

    var seen = {};
    var out = [];
    var tokens = String(rawSandbox || "").split(/\\s+/);
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (!token || !allowed[token] || seen[token]) continue;
      seen[token] = 1;
      out.push(token);
    }
    for (var j = 0; j < base.length; j++) {
      if (!seen[base[j]]) out.push(base[j]);
    }
    if (!bridgeEnabled) {
      out = out.filter(function(token) { return token !== "allow-same-origin"; });
    }
    return out.join(" ");
  }

  function _unregisterFrameWindow(iframe) {
    var prev = iframe && iframe._aupTrackedWindow;
    if (!prev) return;
    _aupFrameWindows.delete(prev);
    _aupBridgeWindows.delete(prev);
    _aupBridgeOriginByWindow.delete(prev);
    // Clean up bridge subscriptions owned by this window
    if (window._aupBridgeSubsByWindow) {
      var subIds = window._aupBridgeSubsByWindow.get(prev);
      if (subIds) {
        subIds.forEach(function(sid) {
          if (window._aupBridgeSubs && window._aupBridgeSubs[sid]) {
            try { window._aupBridgeSubs[sid](); } catch(_ex) {}
            delete window._aupBridgeSubs[sid];
          }
        });
        window._aupBridgeSubsByWindow.delete(prev);
      }
    }
    iframe._aupTrackedWindow = null;
  }

  function _registerFrameWindow(iframe, bridgeEnabled, srcUrl) {
    _unregisterFrameWindow(iframe);
    try {
      var win = iframe.contentWindow;
      if (!win) return;
      iframe._aupTrackedWindow = win;
      _aupFrameWindows.add(win);
      if (bridgeEnabled) {
        _aupBridgeWindows.add(win);
        try {
          _aupBridgeOriginByWindow.set(win, new URL(srcUrl, location.href).origin);
        } catch (_ex) {}
      }
    } catch (_ex) {}
  }

  function renderAupFrame(node) {
    var el = document.createElement("div");
    el.className = "aup-frame";
    var p = node.props || {};
    var src = typeof p.src === "string" ? p.src : "";
    var bridge = !!p.bridge;
    var loading = p.loading || "lazy";
    var size = p.size || {};
    var fallback = p.fallback || "";

    if (size.width) el.setAttribute("data-size-width", "1");
    if (size.height) el.setAttribute("data-size-height", "1");

    if (!src) {
      var placeholder = document.createElement("div");
      placeholder.className = "aup-frame-error";
      placeholder.innerHTML = '<span class="aup-frame-error-icon">\\u26a0</span>'
        + '<span class="aup-frame-error-msg">Frame: set src prop to embed a page</span>';
      el.appendChild(placeholder);
      return el;
    }

    var resolved = _resolveFrameSrc(src, bridge);
    if (!resolved) {
      var invalid = document.createElement("div");
      invalid.className = "aup-frame-error";
      invalid.innerHTML = '<span class="aup-frame-error-icon">\\u26a0</span>'
        + '<span class="aup-frame-error-msg">Frame: src must be http(s) URL or /pages/*</span>';
      el.appendChild(invalid);
      return el;
    }
    var resolvedSrc = resolved.url;
    var bridgeEnabled = !!resolved.bridgeEnabled;
    var sandbox = _normalizeSandbox(p.sandbox, bridgeEnabled);
    // Same-origin iframes keep allow-same-origin so httpOnly cookies are shared
    if (_isSameOriginUrl(resolvedSrc) && sandbox.indexOf("allow-same-origin") === -1) {
      sandbox += " allow-same-origin";
    }

    // Create iframe
    var iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", sandbox);
    iframe.setAttribute("loading", loading === "eager" ? "eager" : "lazy");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    if (p.transparent) { iframe.setAttribute("allowtransparency", "true"); iframe.style.background = "transparent"; el.style.background = "transparent"; }
    if (p.overlay) {
      // Override .aup-frame class styles that break overlay
      el.className = "aup-frame-overlay";
      el.style.cssText = "position:fixed;inset:0;z-index:99999;pointer-events:none;background:transparent;border:none;overflow:visible;margin:0;padding:0;min-height:0;";
      iframe.style.cssText = "pointer-events:none;background:transparent;width:100%;height:100%;border:none;display:block;min-height:0;";
      iframe.setAttribute("allowtransparency", "true");
      el.setAttribute("data-aup-overlay", node.id || "");
      iframe.onload = function() {
        _registerFrameWindow(iframe, bridgeEnabled, resolvedSrc);
      };
      iframe.src = resolvedSrc;
      el.appendChild(iframe);
      setTimeout(function() { document.body.appendChild(el); }, 0);
      return document.createElement("div");
    }

    // Loading skeleton (non-overlay frames only)
    var skeleton = document.createElement("div");
    skeleton.className = "aup-frame-loading";
    skeleton.innerHTML = '<div class="aup-frame-loading-bar"></div>';
    el.appendChild(skeleton);
    if (size.width) iframe.style.width = size.width;
    if (size.height) { iframe.style.height = size.height; el.style.minHeight = "0"; }

    iframe.onload = function() {
      skeleton.remove();
      _registerFrameWindow(iframe, bridgeEnabled, resolvedSrc);
      // Fire AUP load event
      if (node.events && node.events.load) {
        _fireAupEvent(node.id, "load", {});
      }
    };

    iframe.onerror = function() {
      _showFrameError(el, skeleton, iframe, resolvedSrc, fallback, bridge, node);
    };

    // Also handle load errors via timeout — iframes don't reliably fire onerror
    var errorTimer = setTimeout(function() {
      if (skeleton.parentNode) {
        // Still loading after 30s — likely broken
        _showFrameError(el, skeleton, iframe, resolvedSrc, fallback, bridge, node);
      }
    }, 30000);

    iframe.addEventListener("load", function() { clearTimeout(errorTimer); }, { once: true });

    iframe.src = resolvedSrc;
    el.appendChild(iframe);

    return el;
  }

  function _showFrameError(wrapper, skeleton, iframe, src, fallback, bridge, node) {
    if (skeleton.parentNode) skeleton.remove();
    iframe.style.display = "none";
    _unregisterFrameWindow(iframe);

    // Remove existing error if retrying
    var old = wrapper.querySelector(".aup-frame-error");
    if (old) old.remove();

    var errorEl = document.createElement("div");
    errorEl.className = "aup-frame-error";
    errorEl.innerHTML = '<span class="aup-frame-error-icon">\\u26a0</span>'
      + '<span class="aup-frame-error-msg">Failed to load page</span>';

    var retryBtn = document.createElement("button");
    retryBtn.className = "aup-frame-retry";
    retryBtn.textContent = "Retry";
    retryBtn.onclick = function() {
      errorEl.remove();
      iframe.style.display = "";
      var retry = _resolveFrameSrc(fallback || src, bridge);
      iframe.src = retry ? retry.url : src;
    };
    errorEl.appendChild(retryBtn);
    wrapper.appendChild(errorEl);

    // Fire AUP error event
    if (node.events && node.events.error) {
      _fireAupEvent(node.id, "error", { src: src });
    }
  }

  function _fireAupEvent(nodeId, event, data) {
    // Check if this node lives inside a device container — route to device WS
    var nodeEl = document.querySelector('[data-aup-id="' + nodeId + '"]');
    if (nodeEl) {
      var deviceEl = nodeEl.closest('[data-aup-device-id]');
      if (deviceEl && deviceEl._aupDeviceWs && deviceEl._aupDeviceWs.readyState === 1) {
        deviceEl._aupDeviceWs.send(JSON.stringify({
          type: "aup_event", nodeId: nodeId, event: event, data: data
        }));
        return true;
      }
    }
    // Default: send to parent WS
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "aup_event", nodeId: nodeId, event: event, data: data }));
      return true;
    }
    return false;
  }
`;
