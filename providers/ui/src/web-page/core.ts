export const CORE_HEAD_JS = `
  // ── XSS protection ──
  function _escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function sanitizeHtml(html) {
    if (typeof DOMPurify !== "undefined") return DOMPurify.sanitize(html);
    // Fallback: strip all tags when DOMPurify unavailable
    return _escapeHtml(html);
  }

  // ── i18n ──
  var LOCALES = {
    en: { title: "AFS", connected: "Connected", disconnected: "Disconnected",
          connecting: "Connecting...", send: "Send", backToChat: "Back",
          inputPlaceholder: "Type a message... (Enter to send, Shift+Enter for newline)",
          aupDisplay: "AUP Display" },
    zh: { title: "AFS", connected: "\\u5df2\\u8fde\\u63a5", disconnected: "\\u5df2\\u65ad\\u5f00",
          connecting: "\\u8fde\\u63a5\\u4e2d...", send: "\\u53d1\\u9001", backToChat: "\\u8fd4\\u56de",
          inputPlaceholder: "\\u8f93\\u5165\\u6d88\\u606f... (Enter \\u53d1\\u9001, Shift+Enter \\u6362\\u884c)",
          aupDisplay: "AUP \\u663e\\u793a" },
    ja: { title: "AFS", connected: "\\u63a5\\u7d9a\\u6e08\\u307f", disconnected: "\\u5207\\u65ad",
          connecting: "\\u63a5\\u7d9a\\u4e2d...", send: "\\u9001\\u4fe1", backToChat: "\\u623b\\u308b",
          inputPlaceholder: "\\u30e1\\u30c3\\u30bb\\u30fc\\u30b8\\u3092\\u5165\\u529b... (Enter\\u3067\\u9001\\u4fe1)",
          aupDisplay: "AUP \\u8868\\u793a" }
  };
  var currentLocale = "en";
  function t(key) { return (LOCALES[currentLocale] || LOCALES.en)[key] || LOCALES.en[key] || key; }
  function setLocale(loc) {
    if (LOCALES[loc]) { currentLocale = loc; }
    else { var base = loc.split("-")[0]; currentLocale = LOCALES[base] ? base : "en"; }
    var h1 = document.querySelector("header h1"); if (h1) h1.textContent = t("title");
    var send = document.getElementById("btn-send"); if (send) send.textContent = t("send");
    var inp = document.getElementById("input"); if (inp) inp.placeholder = t("inputPlaceholder");
    var back1 = document.getElementById("back-to-chat"); if (back1) back1.textContent = t("backToChat");
    var back2 = document.getElementById("aup-back-to-chat"); if (back2) back2.textContent = t("backToChat");
    var sel = document.getElementById("locale-select"); if (sel) sel.value = currentLocale;
    // Sync locale to URL so it persists across navigation (Web ↔ AUP)
    try {
      var u = new URL(location.href);
      if (currentLocale && currentLocale !== "en") u.searchParams.set("locale", currentLocale);
      else u.searchParams.delete("locale");
      history.replaceState(history.state, "", u.toString());
    } catch(_) {}
  }
  (function initLocale() {
    var urlLoc = new URLSearchParams(location.search).get("locale");
    if (urlLoc) setLocale(urlLoc);
    else { var nav = navigator.language || "en"; setLocale(nav); }
    var sel = document.getElementById("locale-select");
    if (sel) sel.onchange = function() {
      setLocale(sel.value);
      // Send locale change to server for AUP page re-render
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "aup", action: "locale", locale: sel.value }));
      }
    };
  })();

  // ── Style Manager (three axes: tone + palette + mode) ──
  // Initial values match <html data-tone="editorial" data-palette="neutral" data-mode="dark">
  var currentTone = document.documentElement.getAttribute("data-tone") || "editorial";
  var currentPalette = document.documentElement.getAttribute("data-palette") || "neutral";
  var currentModeChoice = document.documentElement.getAttribute("data-mode") || "dark";
  var _userSetStyle = false;
  var _userSetMode = false;

  function applyStyleMode() {
    document.documentElement.setAttribute("data-tone", currentTone);
    document.documentElement.setAttribute("data-palette", currentPalette);
    document.documentElement.setAttribute("data-mode", currentModeChoice);
  }
  function setTone(name, fromUser) {
    if (name) currentTone = name;
    if (fromUser) {
      _userSetStyle = true;
      try { localStorage.setItem("web-tone", name); } catch(_) {}
    }
    applyStyleMode();
  }
  function setPalette(name, fromUser) {
    if (name) currentPalette = name;
    if (fromUser) {
      _userSetStyle = true;
      try { localStorage.setItem("web-palette", name); } catch(_) {}
    }
    applyStyleMode();
  }
  function setMode(mode, fromUser) {
    currentModeChoice = mode === "dark" ? "dark" : "light";
    if (fromUser) {
      _userSetMode = true;
      try { localStorage.setItem("web-mode", currentModeChoice); } catch(_) {}
    }
    applyStyleMode();
  }
  (function initStyleMode() {
    try {
      var savedTone = localStorage.getItem("web-tone");
      var savedPalette = localStorage.getItem("web-palette");
      var savedMode = localStorage.getItem("web-mode");
      if (savedTone) { currentTone = savedTone; _userSetStyle = true; }
      if (savedPalette) { currentPalette = savedPalette; _userSetStyle = true; }
      if (savedMode) { currentModeChoice = savedMode; _userSetMode = true; }
    } catch(_) {}
    applyStyleMode();
  })();

  // ── Markdown renderer (lazy init — CDN scripts load async) ──
  var _markdownReady = false;
  function _ensureMarkdown() {
    if (_markdownReady) return;
    if (typeof marked !== "undefined" && typeof markedHighlight !== "undefined" && typeof hljs !== "undefined") {
      marked.use(markedHighlight.markedHighlight({
        langPrefix: "hljs language-",
        highlight: function(code, lang) {
          if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
          return hljs.highlightAuto(code).value;
        }
      }));
      marked.use({ breaks: true, gfm: true });
      _markdownReady = true;
    }
  }

  function renderMarkdown(raw) {
    _ensureMarkdown();
    if (typeof marked !== "undefined") {
      var html = marked.parse(raw);
      return typeof DOMPurify !== "undefined" ? DOMPurify.sanitize(html) : _escapeHtml(raw);
    }
    return _escapeHtml(raw);
  }

  // ── DOM refs (chat/session UI — not present in snapshot mode) ──
  if (typeof _SNAPSHOT_MODE !== "undefined" && _SNAPSHOT_MODE) {
    // Skip all chat/session/WebSocket initialization in snapshot mode.
    // Jump straight to AUP Runtime section below.
  } else {
  var messagesEl = document.getElementById("messages");
  var inputEl = document.getElementById("input");
  var btnSend = document.getElementById("btn-send");
  var dotEl = document.getElementById("dot");
  var statusEl = document.getElementById("status");
  var promptArea = document.getElementById("prompt-area");
  var promptMsg = document.getElementById("prompt-msg");
  var promptOptions = document.getElementById("prompt-options");
  var pageView = document.getElementById("page-view");
  var pageContent = document.getElementById("page-content");
  var pageTitle = document.getElementById("page-title");
  var backBtn = document.getElementById("back-to-chat");
  var inputBar = document.getElementById("input-bar");
  var desktopSplash = document.getElementById("desktop-splash");
  var splashDot = document.getElementById("splash-dot");
  var splashStatus = document.getElementById("splash-status");
  var sessionBadge = document.getElementById("session-badge");
  var sessionDot = document.getElementById("session-dot");
  var sessionIdEl = document.getElementById("session-id");
  // chromeToolbar removed — settings bar is now inside #aup-display
  var ws = null;
  var currentPrompt = null;

  // ── Live channel detection ──
  var _liveChannelId = null;
  (function() {
    var m = location.pathname.match(/^\\/live\\/([^/]+)/);
    if (m) {
      try { _liveChannelId = decodeURIComponent(m[1]); } catch(_) {}
    }
  })();

  // ── Session stickiness: read ?sid= from URL ──
  var _urlSessionId = null;
  // ── Blocklet param: ?blocklet=name ──
  var _blockletName = null;
  // ── Instance ID param: ?instanceId=id ──
  var _instanceId = null;
  // ── Page param: ?page=name — direct page navigation ──
  var _urlPageName = null;
  // ── Initial URL locale — saved before setLocale() can overwrite it ──
  var _initialUrlLocale = null;
  (function() {
    var params = new URLSearchParams(location.search);
    var sid = params.get("sid");
    if (sid) _urlSessionId = sid;
    var bl = params.get("blocklet");
    if (bl) _blockletName = bl;
    var iid = params.get("instanceId");
    if (iid) _instanceId = iid;
    var pg = params.get("page");
    if (pg) _urlPageName = pg;
    var loc = params.get("locale");
    if (loc) _initialUrlLocale = loc;
  })();
  var _storedSessionId = null;
  var _storedSessionToken = null;
  var _sessionStoreKey = "afs:web:session:" + location.pathname + (_blockletName ? ":bl:" + _blockletName : "") + (_instanceId ? ":inst:" + _instanceId : "");
  (function() {
    if (_liveChannelId) return;
    try {
      var raw = sessionStorage.getItem(_sessionStoreKey);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.sid === "string" &&
        parsed.sid &&
        typeof parsed.st === "string" &&
        parsed.st
      ) {
        _storedSessionId = parsed.sid;
        _storedSessionToken = parsed.st;
      }
    } catch (_) {}
  })();

  // ── Copy button ──
  function createCopyBtn(getText) {
    var btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "\\u2398";
    btn.title = "Copy";
    btn.onclick = function(e) {
      e.stopPropagation();
      navigator.clipboard.writeText(getText()).then(function() {
        btn.classList.add("copied");
        btn.textContent = "\\u2713";
        setTimeout(function() { btn.classList.remove("copied"); btn.textContent = "\\u2398"; }, 1500);
      });
    };
    return btn;
  }

  // ── Component rendering ──
  function renderComponent(content, component, props) {
    props = props || {};
    switch (component) {
      case "code-block": {
        var lang = props.language || "";
        var highlighted = content;
        if (typeof hljs !== "undefined" && lang && hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(content, { language: lang }).value;
        } else if (typeof hljs !== "undefined") {
          highlighted = hljs.highlightAuto(content).value;
        }
        return '<pre><code class="hljs' + (lang ? " language-" + lang : "") + '">' + highlighted + "</code></pre>";
      }
      case "table": {
        var headers = props.headers || [];
        var rows = props.rows || [];
        var html = '<table class="component-table"><thead><tr>';
        headers.forEach(function(h) { html += "<th>" + _escapeHtml(String(h)) + "</th>"; });
        html += "</tr></thead><tbody>";
        rows.forEach(function(row) {
          html += "<tr>";
          (row || []).forEach(function(cell) { html += "<td>" + _escapeHtml(String(cell)) + "</td>"; });
          html += "</tr>";
        });
        html += "</tbody></table>";
        return html;
      }
      case "image": {
        var src = escapeAttr(props.src || "");
        var alt = escapeAttr(props.alt || "");
        return '<img class="component-image" src="' + src + '" alt="' + alt + '">';
      }
      default:
        return "<pre>" + _escapeHtml(content) + "</pre>";
    }
  }

  // ── Message rendering ──
  function addMsg(content, cls, format, meta) {
    var el = document.createElement("div");
    el.className = "msg " + cls;
    format = format || "text";
    meta = meta || {};

    switch (format) {
      case "html":
        el.innerHTML = sanitizeHtml(content);
        break;
      case "markdown":
        el.innerHTML = renderMarkdown(content);
        break;
      case "component":
        el.innerHTML = renderComponent(content, meta.component, meta.componentProps);
        break;
      default:
        el.textContent = content;
        break;
    }

    if (cls === "user" || cls === "assistant") {
      el.dataset.rawText = content;
      el.appendChild(createCopyBtn(function() { return el.dataset.rawText; }));
    }

    if (messagesEl) { messagesEl.appendChild(el); messagesEl.scrollTop = messagesEl.scrollHeight; }
    return el;
  }

  // ── AFS Client Proxy ──
  var _afsReqId = 0;
  var _afsPending = {}; // reqId → { resolve, reject, timer }
  var _afsSubs = {};    // subId → callback
  var _afsSubId = 0;
  var _afsSessionId = null;
  var _afsSessionToken = null;
  var _aupTreeVersion = 0;
  // ── Kind Template Registry ──
  var _aupKindTemplates = {};
  window.aup = window.aup || {};
  window.aup.registerKindTemplate = function(kind, templateNode) {
    _aupKindTemplates[kind] = templateNode;
  };
  window.aup.getKindTemplate = function(kind) {
    if (!kind) return null;
    if (_aupKindTemplates[kind]) return _aupKindTemplates[kind];
    var colonIdx = kind.indexOf(":");
    if (colonIdx >= 0) {
      var prefix = kind.substring(0, colonIdx) + ":*";
      if (_aupKindTemplates[prefix]) return _aupKindTemplates[prefix];
    }
    return null;
  };

  if (_storedSessionId) _afsSessionId = _storedSessionId;
  if (_storedSessionToken) _afsSessionToken = _storedSessionToken;

  function _persistSessionAuth() {
    if (_liveChannelId) return;
    try {
      if (_afsSessionId && _afsSessionToken) {
        sessionStorage.setItem(
          _sessionStoreKey,
          JSON.stringify({ sid: _afsSessionId, st: _afsSessionToken }),
        );
      } else {
        sessionStorage.removeItem(_sessionStoreKey);
      }
    } catch (_) {}
  }

  function _afsSend(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function _afsRequest(type, params) {
    return new Promise(function(resolve, reject) {
      var reqId = "r" + (++_afsReqId);
      var timer = setTimeout(function() {
        delete _afsPending[reqId];
        reject(new Error("AFS request timeout: " + type));
      }, 30000);
      _afsPending[reqId] = { resolve: resolve, reject: reject, timer: timer };
      var msg = { type: type, reqId: reqId };
      for (var k in params) { if (params.hasOwnProperty(k)) msg[k] = params[k]; }
      _afsSend(msg);
    });
  }

  function _handleAfsResult(msg) {
    var p = _afsPending[msg.reqId];
    if (p) {
      clearTimeout(p.timer);
      delete _afsPending[msg.reqId];
      p.resolve(msg.data);
    }
  }

  function _handleAfsError(msg) {
    var p = _afsPending[msg.reqId];
    if (p) {
      clearTimeout(p.timer);
      delete _afsPending[msg.reqId];
      p.reject(new Error(msg.error || "AFS error"));
    }
  }

  function _handleAfsEvent(msg) {
    var cb = _afsSubs[msg.subId];
    if (cb) cb(msg.event);
  }

  // Global AFS object — browser becomes an AFS peer
  window.afs = {
    read: function(path) { return _afsRequest("afs_read", { path: path }); },
    list: function(path, options) {
      var params = { path: path };
      if (options) params.options = options;
      return _afsRequest("afs_list", params);
    },
    write: function(path, content, meta) {
      var params = { path: path };
      if (content !== undefined) params.content = content;
      if (meta !== undefined) params.meta = meta;
      return _afsRequest("afs_write", params);
    },
    exec: function(path, args) { return _afsRequest("afs_exec", { path: path, args: args || {} }); },
    stat: function(path) { return _afsRequest("afs_stat", { path: path }); },
    subscribe: function(filter, callback) {
      var subId = "s" + (++_afsSubId);
      _afsSubs[subId] = callback;
      _afsRequest("afs_subscribe", { subId: subId, filter: filter });
      return function() {
        delete _afsSubs[subId];
        _afsSend({ type: "afs_unsubscribe", reqId: "r" + (++_afsReqId), subId: subId });
      };
    },
    get sessionId() { return _afsSessionId; },
    get channelId() { return _liveChannelId; }
  };

  // ── src binding helper: loading/error lifecycle ──
  // Usage: _aupSrcBind(el, node.src, function(data) { ... })
  // Inserts a loading skeleton, fetches data, removes skeleton on success, shows error on fail.
  // Returns unsubscribe function (or null).
  function _aupSrcBind(el, srcPath, onData) {
    if (!srcPath || !window.afs) return null;
    // Loading skeleton
    var skel = document.createElement("div");
    skel.className = "aup-src-loading";
    skel.innerHTML = '<div class="aup-src-loading-bar"></div>';
    el.insertBefore(skel, el.firstChild);
    var removed = false;
    function removeSkel() { if (!removed && skel.parentNode) { skel.parentNode.removeChild(skel); removed = true; } }
    function showError(msg) {
      removeSkel();
      var existing = el.querySelector(".aup-src-error");
      if (existing) existing.parentNode.removeChild(existing);
      var errEl = document.createElement("div");
      errEl.className = "aup-src-error";
      errEl.textContent = msg || "Failed to load data";
      el.insertBefore(errEl, el.firstChild);
    }
    // Initial read
    window.afs.read(srcPath).then(function(result) {
      removeSkel();
      var existing = el.querySelector(".aup-src-error");
      if (existing) existing.parentNode.removeChild(existing);
      onData(result);
    }).catch(function(err) {
      showError(err.message || "Load failed");
    });
    // Subscribe for live updates
    var unsub = window.afs.subscribe({ type: "afs:write", path: srcPath }, function(event) {
      var existing = el.querySelector(".aup-src-error");
      if (existing) existing.parentNode.removeChild(existing);
      if (event && event.data) onData(event.data);
    });
    return unsub;
  }

  // ── Connection ──
  var _connState = "disconnected";
  function setConnected(ok) {
    _connState = ok ? "connected" : "disconnected";
    dotEl.className = "dot " + (ok ? "on" : "off");
    statusEl.textContent = ok ? t("connected") : t("disconnected");
    if (inputEl) inputEl.disabled = !ok;
    if (btnSend) btnSend.disabled = !ok;
    if (splashDot) splashDot.className = "dot " + (ok ? "on" : "off");
    if (splashStatus) splashStatus.textContent = ok ? "connected — waiting for content" : "connecting...";
    if (sessionDot) sessionDot.className = _connState;
    _updateBadgeTooltip();
  }
  function _updateBadgeTooltip() {
    if (!sessionBadge) return;
    sessionBadge.title = "AFS v" + (typeof _AFS_VERSION !== "undefined" ? _AFS_VERSION : "?") + "\\n" + _connState;
  }

  var reconnectDelay = 2000;

  function connect() {
    _connState = "connecting";
    if (sessionDot) sessionDot.className = "connecting";
    _updateBadgeTooltip();
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var wsUrl = proto + "//" + location.host;
    var existingSid = _afsSessionId || _urlSessionId;
    if (existingSid) wsUrl += "?sid=" + encodeURIComponent(existingSid);
    // Adopt early WS if available and still connecting/open
    if (typeof _earlyWs !== "undefined" && _earlyWs && _earlyWs.readyState <= 1) {
      ws = _earlyWs;
      _earlyWs = null;
    } else {
      ws = new WebSocket(wsUrl);
    }

    ws.onopen = function() {
      reconnectDelay = 2000;
      setConnected(true);
      if (_liveChannelId) {
        ws.send(JSON.stringify({ type: "join_channel", channelId: _liveChannelId }));
      } else {
        var handshake = { type: "join_session" };
        if (_afsSessionId || _urlSessionId) handshake.sessionId = _afsSessionId || _urlSessionId;
        if (_afsSessionToken) handshake.sessionToken = _afsSessionToken;
        if (_aupTreeVersion > 0) handshake.treeVersion = _aupTreeVersion;
        if (_blockletName) handshake.blocklet = _blockletName;
        if (_instanceId) handshake.instanceId = _instanceId;
        if (_urlPageName) handshake.page = _urlPageName;
        // Send initial locale from URL param or browser setting
        var _urlLocale = new URLSearchParams(location.search).get("locale");
        if (_urlLocale) handshake.locale = _urlLocale;
        else if (currentLocale && currentLocale !== "en") handshake.locale = currentLocale;
        ws.send(JSON.stringify(handshake));
        // Send pending deep link request if any
        if (window._aupPendingDeepLink) {
          var dl = window._aupPendingDeepLink;
          delete window._aupPendingDeepLink;
          if (dl.type === "page") {
            ws.send(JSON.stringify({ type: "navigate_request", pageId: dl.pageId }));
          }
        }
        if (inputEl) inputEl.focus();
      }
    };
    ws.onclose = function(e) {
      setConnected(false); ws = null;
      // Close code 4000+ = server explicitly rejected, don't reconnect
      if (e.code >= 4000) return;
      // Exponential backoff: 2s → 4s → 8s → 16s → 30s (cap)
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };
    ws.onerror = function() {};

    ws.onmessage = function(e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch(_ex) { return; }
      handleMessage(msg);
    };
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case "session":
        _afsSessionId = msg.sessionId;
        _afsSessionToken = msg.sessionToken || null;
        _persistSessionAuth();
        if (sessionIdEl && msg.sessionId) sessionIdEl.textContent = msg.sessionId;
        // Persist session ID in URL for stickiness across refreshes
        if (msg.sessionId && !_liveChannelId) {
          var u = new URL(location.href);
          if (u.searchParams.get("sid") !== msg.sessionId) {
            u.searchParams.set("sid", msg.sessionId);
            history.replaceState(null, "", u.toString());
          }
        }
        break;
      case "channel":
        if (sessionIdEl && msg.channelId) sessionIdEl.textContent = "live: " + msg.channelId;
        if (splashStatus) splashStatus.textContent = "live channel — waiting for content";
        // Hide input bar for live viewers (read-only)
        if (inputBar) inputBar.style.display = "none";
        break;
      case "afs_result":
        _handleAfsResult(msg);
        break;
      case "afs_error":
        _handleAfsError(msg);
        break;
      case "afs_event":
        _handleAfsEvent(msg);
        break;
      case "write":
        if (messagesEl) { showChat(); addMsg(msg.content, "assistant", msg.format, msg); }
        break;
      case "prompt":
        if (messagesEl) { showChat(); showPrompt(msg); }
        break;
      case "clear":
        if (messagesEl) messagesEl.innerHTML = "";
        break;
      case "notify":
        if (messagesEl) { showChat(); addMsg(msg.message, "notify"); }
        break;
      case "navigate":
        if (msg.url) { window.location.href = msg.url; break; }
        showPage(msg.pageId, msg.content, msg.format, msg.layout);
        break;
      case "aup":
        handleAup(msg);
        break;
      case "aup_event_result":
        handleAupEventResult(msg);
        break;
      case "open_url":
        if (msg.url) window.open(msg.url, "_blank");
        break;
      case "auth_logout":
        // Redirect to server-side logout (clears HttpOnly cookie via Set-Cookie header)
        window.location.href = "/.well-known/service/api/did/logout";
        break;
    }
  }

  function showPrompt(msg) {
    if (!promptMsg || !promptOptions) return;
    currentPrompt = msg;
    promptMsg.textContent = msg.message;
    promptOptions.innerHTML = "";

    if (msg.promptType === "confirm") {
      ["Yes", "No"].forEach(function(label) {
        var btn = document.createElement("button");
        btn.textContent = label;
        btn.onclick = function() { sendPromptResponse(label === "Yes"); };
        promptOptions.appendChild(btn);
      });
      if (promptArea) promptArea.style.display = "block";
    } else if ((msg.promptType === "select" || msg.promptType === "multiselect") && msg.options) {
      msg.options.forEach(function(opt) {
        var btn = document.createElement("button");
        btn.textContent = opt;
        btn.onclick = function() { sendPromptResponse(opt); };
        promptOptions.appendChild(btn);
      });
      if (promptArea) promptArea.style.display = "block";
    } else {
      addMsg(msg.message, "system");
      if (inputEl) {
        if (msg.promptType === "password") inputEl.type = "password";
        inputEl.focus();
      }
    }
  }

  function sendPromptResponse(value) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "prompt_response", value: value }));
    }
    if (promptArea) promptArea.style.display = "none";
    currentPrompt = null;
  }

  function showPage(pageId, content, format, layout) {
    dismissSplash();
    if (!pageView) return;
    if (pageTitle) pageTitle.textContent = pageId;
    if (format === "layout" && layout) {
      var html = '<div class="layout-page">';
      if (layout.header) html += '<div class="layout-header">' + _escapeHtml(layout.header) + '</div>';
      if (layout.sidebar) html += '<div class="layout-sidebar">' + _escapeHtml(layout.sidebar) + '</div>';
      html += '<div class="layout-main">' + _escapeHtml(layout.main || "") + '</div>';
      if (layout.footer) html += '<div class="layout-footer">' + _escapeHtml(layout.footer) + '</div>';
      html += '</div>';
      if (pageContent) pageContent.innerHTML = html;
    } else {
      if (pageContent) pageContent.innerHTML = sanitizeHtml(content);
    }
    if (messagesEl) messagesEl.style.display = "none";
    if (inputBar) inputBar.style.display = "none";
    if (promptArea) promptArea.style.display = "none";
    pageView.style.display = "flex";
  }

  function dismissSplash() {
    if (desktopSplash && !desktopSplash.classList.contains("hidden")) {
      desktopSplash.classList.add("hidden");
    }
  }

  function showChat() {
    dismissSplash();
    if (pageView) pageView.style.display = "none";
    if (messagesEl) messagesEl.style.display = "flex";
    if (inputBar) inputBar.style.display = "flex";
  }

  if (backBtn) backBtn.onclick = showChat;
  } // end if (!_SNAPSHOT_MODE) — chat/session block

  // ── AUP Runtime (AUI) ──
  var aupDisplayEl = document.getElementById("aup-display");
  var aupRootEl = document.getElementById("aup-root");
  var aupBackBtn = document.getElementById("aup-back-to-chat");
  var aupStatusEl = document.getElementById("aup-status");
  var aupNodeTree = null; // current node tree (JSON)
  var aupFullPage = false;
  var _aupCurrentPage = null; // current page name for URL sync
  var headerEl = document.querySelector("header");
  var aupToolbar = document.querySelector(".aup-toolbar");

  var aupBackBtn = document.getElementById("aup-back-to-chat");
  if (aupBackBtn) aupBackBtn.onclick = function() {
    aupFullPage = false;
    aupDisplayEl.classList.remove("active", "full-page");
    if (headerEl) headerEl.style.display = "none";
    if (aupToolbar) aupToolbar.style.display = "";
    // Settings bar is part of #aup-display, visibility controlled by CSS
    // Return to desktop splash
    if (desktopSplash) desktopSplash.classList.remove("hidden");
    if (messagesEl) messagesEl.style.display = "none";
    if (inputBar) inputBar.style.display = "none";
    document.title = "AFS";
  };

  var _aupTitle = null;
  var _aupLocaleApplied = false; // true after first render locale sync

  // ── Scene Buffer State (Stage-to-Live dual buffer) ──
  var _aupSceneBuffers = {}; // sceneId → DOM element
  var _aupActiveSceneId = null;

  function _cleanupTickerIntervals(root) {
    if (!root || !root.querySelectorAll) return;
    var tickers = root.querySelectorAll(".aup-ticker");
    for (var i = 0; i < tickers.length; i++) {
      var t = tickers[i];
      if (typeof t._flipTimer === "number") {
        clearInterval(t._flipTimer);
        t._flipTimer = null;
      }
    }
  }

  function _untrackFrameWindowsIn(root) {
    if (!root || !root.querySelectorAll || typeof _unregisterFrameWindow !== "function") return;
    var frames = root.querySelectorAll("iframe");
    for (var i = 0; i < frames.length; i++) {
      try { _unregisterFrameWindow(frames[i]); } catch (_ex) {}
    }
  }

  function _aupStageScene(sceneId, root, msg) {
    var buf = _aupSceneBuffers[sceneId];
    if (!buf) {
      buf = document.createElement("div");
      buf.className = "aup-buffer staged";
      buf.setAttribute("data-scene-id", sceneId);
      // Insert after aupRootEl inside the display container
      aupRootEl.parentNode.insertBefore(buf, aupRootEl.nextSibling);
      _aupSceneBuffers[sceneId] = buf;
    }
    // Render tree into buffer (off-screen via .staged visibility:hidden)
    _cleanupTickerIntervals(buf);
    _untrackFrameWindowsIn(buf);
    buf.innerHTML = "";
    var el = renderAupNode(root);
    if (el) buf.appendChild(el);
    // Apply tone/palette/locale
    if (msg.tone && !_userSetStyle) setTone(msg.tone);
    if (msg.palette && !_userSetStyle) setPalette(msg.palette);
    if (msg.mode && !_userSetMode) setMode(msg.mode);
    if (msg.locale) setLocale(msg.locale);
    if (msg.designMode) {
      document.documentElement.dataset.designMode = "true";
    } else if (msg.designMode === false) {
      delete document.documentElement.dataset.designMode;
    }
  }

  function _aupTakeScene(sceneId, transition, duration) {
    var buf = _aupSceneBuffers[sceneId];
    if (!buf) return;
    // Deactivate current active buffer
    if (_aupActiveSceneId && _aupSceneBuffers[_aupActiveSceneId]) {
      _aupSceneBuffers[_aupActiveSceneId].classList.remove("active");
      _aupSceneBuffers[_aupActiveSceneId].classList.add("staged");
    }
    // Hide the original aupRootEl if it was showing
    aupRootEl.classList.add("aup-buffer-hidden");
    // Activate new
    buf.classList.remove("staged");
    buf.classList.add("active");
    // Transition animation
    if (transition === "dissolve") {
      buf.style.animation = "aup-scene-fade-in " + (duration || 300) + "ms ease";
    }
    _aupActiveSceneId = sceneId;
    // Ensure AUP display is visible
    showAupDisplay();
  }

  function _aupReleaseScene(sceneId) {
    var buf = _aupSceneBuffers[sceneId];
    if (buf) {
      _cleanupTickerIntervals(buf);
      _untrackFrameWindowsIn(buf);
      buf.remove();
      delete _aupSceneBuffers[sceneId];
    }
  }

  // Session context for $session.* variable resolution in AUP templates
  var _sessionCtx = { authenticated: false };

  function handleAup(msg) {
    if (msg.treeVersion) _aupTreeVersion = msg.treeVersion;
    // Sync session context from server
    if (msg.sessionContext) _sessionCtx = msg.sessionContext;
    if (msg.action === "render") {
      aupNodeTree = msg.root;
      aupFullPage = !!msg.fullPage;
      _aupTitle = msg.title || null;
      // Track current page name for URL sync
      if (msg.page) _aupCurrentPage = msg.page;
      else if (!_aupCurrentPage) _aupCurrentPage = null;
      // Only apply server-sent tone/palette/mode if user hasn't manually overridden
      if (msg.tone && !_userSetStyle) setTone(msg.tone);
      if (msg.palette && !_userSetStyle) setPalette(msg.palette);
      if (msg.locale) setLocale(msg.locale);
      renderAupTree();
      showAupDisplay();
      // First-render locale sync: use _initialUrlLocale (saved at load time
      // before setLocale() can overwrite the URL). If the server-sent locale
      // differs from what the URL originally requested, re-send the correct one.
      if (!_aupLocaleApplied && msg.page) {
        _aupLocaleApplied = true;
        if (_initialUrlLocale && _initialUrlLocale !== (msg.locale || "en") && ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "aup", action: "locale", locale: _initialUrlLocale }));
        }
      }
    } else if (msg.action === "patch") {
      if (aupNodeTree && msg.ops) {
        applyAupPatches(msg.ops);
        applyAupDomPatches(msg.ops);
      }
    } else if (msg.action === "stage") {
      _aupStageScene(msg.sceneId, msg.root, msg);
      // Ensure display container is visible so buffer can pre-render
      showAupDisplay();
    } else if (msg.action === "take") {
      _aupTakeScene(msg.sceneId, msg.transition, msg.duration);
    } else if (msg.action === "release") {
      _aupReleaseScene(msg.sceneId);
    } else if (msg.action === "surface-update") {
      // Targeted surface content replacement — only touches one surface's DOM.
      // All other panels, dividers, scroll positions preserved.
      if (aupNodeTree && msg.surfaceId) {
        var surfNode = findAupNode(aupNodeTree, msg.surfaceId);
        if (surfNode) {
          surfNode.children = msg.children || [];
        }
      }
      if (aupRootEl && msg.surfaceId) {
        var surfEl = aupRootEl.querySelector('[data-aup-id="' + msg.surfaceId + '"]');
        if (surfEl) {
          var contentEl = surfEl.querySelector('.wm-surface-content');
          if (contentEl) {
            _cleanupTickerIntervals(contentEl);
            _untrackFrameWindowsIn(contentEl);
            contentEl.innerHTML = "";
            var children = msg.children || [];
            for (var ci = 0; ci < children.length; ci++) {
              var rendered = renderAupNode(children[ci]);
              if (rendered) contentEl.appendChild(rendered);
            }
          }
        }
      }
    }
  }

  function handleAupEventResult(_msg) {
    // Future: show loading state resolved, etc.
  }

  function showAupDisplay() {
    dismissSplash();
    if (messagesEl) messagesEl.style.display = "none";
    if (inputBar) inputBar.style.display = "none";
    if (pageView) pageView.style.display = "none";
    if (promptArea) promptArea.style.display = "none";
    aupDisplayEl.classList.add("active");

    // Always full-page: web endpoint is a pure AUP rendering surface
    aupDisplayEl.classList.add("full-page");
    if (headerEl) headerEl.style.display = "none";
    if (aupToolbar) aupToolbar.style.display = "none";
    // Hide session badge in full-page mode (no dev chrome)
    if (sessionBadge) sessionBadge.style.display = "none";
    var title = _aupTitle || findAupTitle(aupNodeTree);
    document.title = title || "AUP App";
  }

  function findAupTitle(node) {
    if (!node) return null;
    if (node.type === "text" && node.props && node.props.level === 1) return node.props.content;
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        var t = findAupTitle(node.children[i]);
        if (t) return t;
      }
    }
    return null;
  }

  function renderAupTree() {
    if (!aupNodeTree || !aupRootEl) return;
    _cleanupTickerIntervals(aupRootEl);
    // Remove body-mounted overlay frames from previous render
    var oldOverlays = document.querySelectorAll("[data-aup-overlay]");
    for (var oi = 0; oi < oldOverlays.length; oi++) {
      _untrackFrameWindowsIn(oldOverlays[oi]);
      oldOverlays[oi].remove();
    }
    _untrackFrameWindowsIn(aupRootEl);
    aupRootEl.innerHTML = "";
    var el = renderAupNode(aupNodeTree);
    if (el) aupRootEl.appendChild(el);
    // Page transition removed — instant rendering, no flicker
  }

  // ── URL Navigation: deep links & history ──
  var _aupCurrentRoute = null; // current route string (e.g., "#/aup" or "#/page/mypage")
  var _aupSuppressPopstate = false;

  function _aupPushRoute(route, replace) {
    if (_aupCurrentRoute === route) return;
    _aupCurrentRoute = route;
    _aupSuppressPopstate = true;
    try {
      if (replace) { history.replaceState({ aupRoute: route }, "", route); }
      else { history.pushState({ aupRoute: route }, "", route); }
    } catch(ex) {}
    _aupSuppressPopstate = false;
  }

  // Patch showPage to push URL state
  var _origShowPage = showPage;
  showPage = function(pageId, content, format, layout) {
    _origShowPage(pageId, content, format, layout);
    _aupPushRoute("#/page/" + encodeURIComponent(pageId));
    _aupDisplayPushed = false; // reset so returning to AUP creates new history entry
  };

  // Sync ?page= in URL when AUP page changes
  function _syncPageParam() {
    try {
      var u = new URL(location.href);
      var cur = u.searchParams.get("page");
      if (_aupCurrentPage && cur !== _aupCurrentPage) {
        u.searchParams.set("page", _aupCurrentPage);
        history.replaceState(history.state, "", u.toString());
      } else if (!_aupCurrentPage && cur) {
        u.searchParams.delete("page");
        history.replaceState(history.state, "", u.toString());
      }
    } catch(_) {}
  }

  // Patch showAupDisplay to push URL state (only first time; subsequent calls use replaceState)
  var _origShowAupDisplay = showAupDisplay;
  var _aupDisplayPushed = false;
  showAupDisplay = function() {
    _origShowAupDisplay();
    _aupPushRoute("#/aup", _aupDisplayPushed);
    _aupDisplayPushed = true;
    _syncPageParam();
  };

  // Handle browser back/forward
  window.addEventListener("popstate", function(e) {
    if (_aupSuppressPopstate) return;
    var route = (e.state && e.state.aupRoute) || location.hash || "";
    _aupCurrentRoute = route;
    if (route.indexOf("#/page/") === 0) {
      var pageId = decodeURIComponent(route.slice(7));
      // Request page from server
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "navigate_request", pageId: pageId }));
      }
    } else if (route === "#/aup") {
      // Re-show AUP display if available
      if (aupNodeTree) {
        _origShowAupDisplay();
      }
    }
  });

  // On initial load, check hash for deep link
  (function() {
    var hash = location.hash || "";
    if (hash.indexOf("#/page/") === 0) {
      var pageId = decodeURIComponent(hash.slice(7));
      // Will be sent after WS connects — store for later
      window._aupPendingDeepLink = { type: "page", pageId: pageId };
    } else if (hash === "#/aup") {
      window._aupPendingDeepLink = { type: "aup" };
    }
  })();

  function renderAupNode(node) {
    if (!node || !node.type) return null;
    // $session.* visible conditional rendering
    if (node.visible !== undefined) {
      var vis = node.visible;
      var negate = false;
      if (typeof vis === "string" && vis.charAt(0) === "!") { negate = true; vis = vis.slice(1); }
      var val = vis;
      if (typeof vis === "string" && vis.indexOf("$session.") === 0) {
        val = _sessionCtx[vis.slice(9)];
      }
      var show = negate ? !val : !!val;
      if (!show) return null;
    }
    var el;
    switch (node.type) {
      case "view": el = renderAupView(node); break;
      case "text": el = renderAupText(node); break;
      case "action": el = renderAupAction(node); break;
      case "input": el = renderAupInput(node); break;
      case "media": el = renderAupMedia(node); break;
      case "overlay": el = renderAupOverlay(node); break;
      case "broadcast": el = renderAupBroadcast(node); break;
      case "table": el = renderAupTable(node); break;
      case "time": el = renderAupTime(node); break;
      case "chart": {
        var cv = (node.props || {}).variant || "";
        el = (["candlestick","ohlc","trading-line","trading-area","baseline","volume"].indexOf(cv) >= 0) ? renderAupFinanceChart(node) : renderAupChart(node);
        break;
      }
      case "map": el = (node.props && node.props.variant === "globe") ? renderAupGlobe(node) : renderAupMap(node); break;
      case "calendar": el = renderAupCalendar(node); break;
      case "moonphase": el = renderAupMoonPhase(node); break;
      case "natal-chart": el = renderAupNatalChart(node); break;
      case "terminal": el = renderAupTerminal(node); break;
      case "editor": el = renderAupEditor(node); break;
      case "frame": el = renderAupFrame(node); break;
      case "canvas": el = renderAupCanvas(node); break;
      case "deck": el = renderAupDeck(node); break;
      case "ticker": el = renderAupTicker(node); break;
      case "afs-list": el = renderAupList(node); break;
      case "surface": el = renderAupSurface(node); break;
      case "command-bar": el = renderAupCommandBar(node); break;
      case "agent": el = renderAupCommandBar(node); break;
      case "webgl-hero": el = renderAupWebglHero(node); break;
      case "type-block": el = renderAupTypeBlock(node); break;
      case "hero-widget": el = renderAupHeroWidget(node); break;
      case "photo-story": el = renderAupPhotoStory(node); break;
      case "block-revealer": el = renderAupBlockRevealer(node); break;
      case "text-image-expand": el = renderAupTextImageExpand(node); break;
      case "text-highlight": el = renderAupTextHighlight(node); break;
      case "scroll-explainer": el = renderAupScrollExplainer(node); break;
      case "progress-bar-3d": el = renderAupProgressBar3d(node); break;
      case "xeyes": el = renderAupXeyes(node); break;
      default: el = renderAupUnknown(node); break;
    }
    if (el && node.id) el.setAttribute("data-aup-id", node.id);
    // Placeholder / hidden flags (set by _applyPlaceholders)
    if (el && node._aupHidden) {
      el.setAttribute("data-aup-hidden", "true");
    }
    if (el && node._aupPlaceholder) {
      el.classList.add("aup-placeholder");
    }
    // Universal region prop — for overlay-grid placement
    if (el) {
      var region = (node.props && node.props.region) || (node.state && node.state.region);
      if (region) el.setAttribute("data-region", region);
      var role = node.props && node.props.role;
      if (role) el.setAttribute("data-role", role);
    }
    return el;
  }
`;

export const CORE_TAIL_JS = `
  // ── AUP Patch application (client-side) ──
  function applyAupPatches(ops) {
    if (!aupNodeTree) return;
    for (var i = 0; i < ops.length; i++) {
      applyAupPatchOp(ops[i]);
    }
  }

  function applyAupPatchOp(op) {
    switch (op.op) {
      case "create": {
        var parent = findAupNode(aupNodeTree, op.parentId);
        if (!parent) return;
        if (!parent.children) parent.children = [];
        var node = Object.assign({}, op.node, { id: op.id });
        if (typeof op.index === "number") {
          parent.children.splice(op.index, 0, node);
        } else {
          parent.children.push(node);
        }
        break;
      }
      case "update": {
        var target = findAupNode(aupNodeTree, op.id);
        if (!target) return;
        if (op.src !== undefined) target.src = op.src;
        if (op.props) target.props = Object.assign(target.props || {}, op.props);
        if (op.state) target.state = Object.assign(target.state || {}, op.state);
        if (op.events !== undefined) target.events = op.events;
        if (op.children !== undefined) target.children = op.children;
        break;
      }
      case "remove": {
        removeAupNode(aupNodeTree, op.id);
        break;
      }
      case "reorder": {
        var rParent = findAupNode(aupNodeTree, op.parentId);
        if (!rParent || !rParent.children) return;
        var idx = -1;
        for (var j = 0; j < rParent.children.length; j++) {
          if (rParent.children[j].id === op.id) { idx = j; break; }
        }
        if (idx < 0) return;
        var moved = rParent.children.splice(idx, 1)[0];
        rParent.children.splice(op.index, 0, moved);
        break;
      }
    }
  }

  function findAupNode(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        var found = findAupNode(node.children[i], id);
        if (found) return found;
      }
    }
    return null;
  }

  function _findParentWm(node, childId) {
    if (!node || !node.children) return null;
    for (var i = 0; i < node.children.length; i++) {
      if (node.children[i].id === childId && node.type === "wm") return node;
      var found = _findParentWm(node.children[i], childId);
      if (found) return found;
    }
    return null;
  }

  function removeAupNode(root, id) {
    if (root.id === id) { aupNodeTree = null; return; }
    if (!root.children) return;
    for (var i = 0; i < root.children.length; i++) {
      if (root.children[i].id === id) { root.children.splice(i, 1); return; }
      removeAupNode(root.children[i], id);
    }
  }

  // ── Targeted DOM patching — avoids full re-render to preserve stateful nodes like afs-list ──
  function applyAupDomPatches(ops) {
    if (!aupRootEl) return;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.op === "remove") {
        var domEl = aupRootEl.querySelector('[data-aup-id="' + op.id + '"]');
        // Before removing, check if this is a wm-surface inside a panels WM
        // so we can re-render the panel's strip bar afterwards
        var rmWmEl = null;
        var rmWmId = null;
        if (domEl && typeof _wmAppendSurface === "function") {
          var closestWm = domEl.closest('.wm-panels[data-aup-id]');
          if (closestWm) {
            rmWmId = closestWm.getAttribute("data-aup-id");
            rmWmEl = closestWm;
          }
        }
        // Fallback: surface not in DOM (e.g. inactive tab in strip) — full WM re-render
        if (!domEl && !rmWmEl && op.id.indexOf("wm-surface-") === 0) {
          renderAupTree();
          continue;
        }
        if (domEl) {
          _cleanupTickerIntervals(domEl);
          _untrackFrameWindowsIn(domEl);
          if (domEl._aupTerminalCleanup) domEl._aupTerminalCleanup();
          domEl.remove();
        }
        // Fallback for surfaces inside child WMs (no data-aup-id on panels container)
        if (domEl && !rmWmEl && op.id.indexOf("wm-surface-") === 0) {
          renderAupTree();
          continue;
        }
        // Re-render the affected panel so strip bar updates
        if (rmWmEl && rmWmId) {
          var rmParentNode = findAupNode(aupNodeTree, rmWmId);
          if (rmParentNode && rmParentNode.type === "wm") {
            // Find which strip item references a surface that no longer exists
            var rmStripItems = rmWmEl.querySelectorAll('.wm-strip-item[data-surface-id]');
            for (var ri = 0; ri < rmStripItems.length; ri++) {
              var rmSurfId = rmStripItems[ri].getAttribute("data-surface-id");
              var rmChildren = rmParentNode.children || [];
              var stillExists = false;
              for (var rci = 0; rci < rmChildren.length; rci++) {
                var rcp = rmChildren[rci].props || {};
                if ((rcp.surfaceName || rmChildren[rci].id) === rmSurfId) { stillExists = true; break; }
              }
              if (!stillExists) {
                var panelEl = rmStripItems[ri].closest('[data-wm-panel]');
                if (panelEl) {
                  var panelId = panelEl.getAttribute("data-wm-panel");
                  var rmPanels = (rmParentNode.props || {}).panels || [];
                  var rmPanelCfg = null;
                  for (var rpi = 0; rpi < rmPanels.length; rpi++) {
                    if (rmPanels[rpi].id === panelId) { rmPanelCfg = rmPanels[rpi]; break; }
                  }
                  if (rmPanelCfg) {
                    var rmAllSurfs = [];
                    for (var rwi = 0; rwi < rmChildren.length; rwi++) {
                      if (rmChildren[rwi].type === "wm-surface") {
                        var rwp = rmChildren[rwi].props || {};
                        rmAllSurfs.push({
                          id: rmChildren[rwi].id,
                          name: rwp.surfaceName || rmChildren[rwi].id,
                          src: rmChildren[rwi].src || "",
                          title: rwp.title || rwp.surfaceName || rmChildren[rwi].id,
                          position: rwp.position || null,
                          size: rwp.size || null,
                          zIndex: rwp.zIndex || 0,
                          docked: !!rwp.docked,
                          panel: rwp.panel || null,
                          node: rmChildren[rwi],
                          background: rwp.background !== false,
                          titlebar: rwp.titlebar !== false,
                          closable: rwp.closable !== false,
                          movable: rwp.movable !== false,
                          resizable: rwp.resizable !== false,
                          interactive: rwp.interactive !== false,
                          bleed: !!rwp.bleed,
                          chromeActions: rwp.chromeActions || null
                        });
                      }
                    }
                    var rmPActives = (rmParentNode.state || {}).panelActives || {};
                    var rmTmpContainer = document.createElement("div");
                    var rmNewPanel = _wmRenderPanelEl(rmTmpContainer, rmPanelCfg, rmAllSurfs, rmPActives, rmParentNode);
                    if (panelEl.style.gridRow) rmNewPanel.style.gridRow = panelEl.style.gridRow;
                    if (panelEl.getAttribute("data-wm-flex")) rmNewPanel.setAttribute("data-wm-flex", "true");
                    _cleanupTickerIntervals(panelEl);
                    _untrackFrameWindowsIn(panelEl);
                    panelEl.replaceWith(rmNewPanel);
                  }
                }
                break;
              }
            }
          }
        }
      } else if (op.op === "create") {
        var createdNode = findAupNode(aupNodeTree, op.id);
        if (!createdNode) continue;
        // WM internal types: menubar → full re-render; surface → incremental append
        var parentNode = findAupNode(aupNodeTree, op.parentId);
        if (parentNode && parentNode.type === "wm" && createdNode.type === "wm-menubar") {
          var wmEl = aupRootEl.querySelector('[data-aup-id="' + op.parentId + '"]');
          if (wmEl) {
            var wmNewEl = renderAupNode(parentNode);
            if (wmNewEl) { _cleanupTickerIntervals(wmEl); _untrackFrameWindowsIn(wmEl); wmEl.replaceWith(wmNewEl); }
          }
          continue;
        }
        if (parentNode && parentNode.type === "wm" && createdNode.type === "wm-surface") {
          var wmEl2 = aupRootEl.querySelector('[data-aup-id="' + op.parentId + '"]');
          if (wmEl2 && typeof _wmAppendSurface === "function") {
            _wmAppendSurface(wmEl2, parentNode, createdNode);
          }
          continue;
        }
        var parentEl = aupRootEl.querySelector('[data-aup-id="' + op.parentId + '"]');
        if (!parentEl) continue;
        var newEl = renderAupNode(createdNode);
        if (!newEl) continue;
        if (typeof op.index === "number" && parentEl.children[op.index]) {
          parentEl.insertBefore(newEl, parentEl.children[op.index]);
        } else {
          parentEl.appendChild(newEl);
        }
      } else if (op.op === "update") {
        var updDomEl = aupRootEl.querySelector('[data-aup-id="' + op.id + '"]');
        var updNode = findAupNode(aupNodeTree, op.id);
        if (!updNode) continue;

        // wm-surface structural changes (dock/panel)
        // Check before updDomEl guard — docked surfaces have no DOM element.
        // NOTE: panel reassignment in panels strategy can require full WM re-render because
        // panel subtree morphing is not guaranteed to be structurally safe.
        if (updNode.type === "wm-surface" && op.props && (op.props.docked !== undefined || op.props.panel !== undefined)) {
          if (op.props.panel !== undefined) {
            renderAupTree(); return;
          }
          var wmParent = _findParentWm(aupNodeTree, updNode.id);
          if (wmParent) {
            var wmDomEl = aupRootEl.querySelector('[data-aup-id="' + wmParent.id + '"]');
            if (wmDomEl) {
              _wmMorphContainer(wmDomEl, wmParent);
              continue;
            }
          }
          renderAupTree(); return;
        }

        if (!updDomEl) continue;

        // wm: dock config changes → morph WM (no flicker)
        if (updNode.type === "wm" && op.props && Object.keys(op.props).some(function(k) { return k.indexOf("dock") === 0; })) {
          _wmMorphContainer(updDomEl, updNode);
          continue;
        }

        // wm: update style/theme/wallpaper in-place — avoid full re-render which destroys iframes
        if (updNode.type === "wm" && op.props && (op.props.style || op.props.theme || op.props.wallpaper !== undefined)) {
          if (typeof _wmUpdateStyleInPlace === "function") {
            _wmUpdateStyleInPlace(updDomEl, updNode);
          }
          continue;
        }

        // wm-surface: apply geometry directly — don't re-render (it's not a top-level type)
        if (updNode.type === "wm-surface") {
          var sp = updNode.props || {};
          if (sp.position) {
            updDomEl.style.left = sp.position.x + "px";
            updDomEl.style.top = sp.position.y + "px";
          }
          if (sp.size) {
            updDomEl.style.width = sp.size.width + "px";
            updDomEl.style.height = sp.size.height + "px";
          }
          // Update title bar text if title changed
          if (sp.title) {
            var titleEl = updDomEl.querySelector(".wm-title-text");
            if (titleEl) titleEl.textContent = sp.title;
          }
          continue;
        }

        // General update: re-render the specific node in place
        var updNewEl = renderAupNode(updNode);
        if (updNewEl) {
          _cleanupTickerIntervals(updDomEl);
          _untrackFrameWindowsIn(updDomEl);
          updDomEl.replaceWith(updNewEl);
        }
      } else if (op.op === "reorder") {
        // Fallback to full re-render for reorder
        renderAupTree();
        return;
      }
    }
  }

  // ── IntersectionObserver for standalone animate triggers ──
  var _animateObserver = null;
  function _setupAnimateObserver() {
    if (_animateObserver) _animateObserver.disconnect();
    _animateObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          // Skip if inside a deck (deck handles its own animations)
          if (el.closest(".aup-deck")) return;
          el.classList.add("aup-animated");
          // Trigger count-up if applicable
          if (el.getAttribute("data-animate") === "count-up" && typeof _startCountUp === "function") {
            _startCountUp(el);
          }
          _animateObserver.unobserve(el);
        }
      });
    }, { threshold: 0.15 });
    // Observe all [data-animate] elements outside decks
    var animatables = document.querySelectorAll("[data-animate]:not(.aup-deck [data-animate])");
    for (var i = 0; i < animatables.length; i++) _animateObserver.observe(animatables[i]);
  }

  // Hook into renderAupTree to re-setup observer after each render
  var _origRenderAupTree = renderAupTree;
  renderAupTree = function() {
    _origRenderAupTree();
    _setupAnimateObserver();
    // Also hook deck slide animations for count-up
    var deckAnimated = document.querySelectorAll(".aup-deck [data-animate='count-up'].aup-animated");
    for (var i = 0; i < deckAnimated.length; i++) {
      if (typeof _startCountUp === "function") _startCountUp(deckAnimated[i]);
    }
  };

  // ── Global Keyboard Shortcuts (from shortcut:* events in tree) ──
  var _prevShortcutHandler = null;
  var _origRenderForShortcuts = renderAupTree;
  renderAupTree = function() {
    _origRenderForShortcuts();
    if (_prevShortcutHandler) document.removeEventListener("keydown", _prevShortcutHandler);
    _prevShortcutHandler = null;
    var shortcuts = [];
    (function walkShortcuts(n) {
      if (!n) return;
      if (n.events) {
        for (var k in n.events) {
          if (k.indexOf("shortcut:") === 0) shortcuts.push({ spec: k.slice(9), nodeId: n.id, event: k });
        }
      }
      if (n.children) n.children.forEach(walkShortcuts);
    })(aupNodeTree);
    if (shortcuts.length === 0) return;
    _prevShortcutHandler = function(e) {
      for (var i = 0; i < shortcuts.length; i++) {
        if (_matchShortcut(e, shortcuts[i].spec)) {
          e.preventDefault();
          if (ws && ws.readyState === 1) ws.send(JSON.stringify({
            type: "aup_event", nodeId: shortcuts[i].nodeId, event: shortcuts[i].event
          }));
          return;
        }
      }
    };
    document.addEventListener("keydown", _prevShortcutHandler);
  };
  function _matchShortcut(e, spec) {
    var parts = spec.toLowerCase().split("+");
    var key = parts.pop();
    var wantMeta = false, wantCtrl = false, wantShift = false, wantAlt = false;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === "meta") wantMeta = true;
      else if (parts[i] === "ctrl") wantCtrl = true;
      else if (parts[i] === "shift") wantShift = true;
      else if (parts[i] === "alt") wantAlt = true;
    }
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
    // meta = Cmd on macOS, Ctrl on other platforms
    var metaPressed = wantMeta ? (isMac ? e.metaKey : e.ctrlKey) : false;
    var ctrlPressed = wantCtrl ? e.ctrlKey : false;
    if (wantMeta && !metaPressed) return false;
    if (wantCtrl && !ctrlPressed) return false;
    if (!wantMeta && (isMac ? e.metaKey : false)) return false;
    if (!wantCtrl && !wantMeta && e.ctrlKey) return false;
    if (wantShift !== e.shiftKey) return false;
    if (wantAlt !== e.altKey) return false;
    return e.key.toLowerCase() === key;
  }

  // ── MutationObserver for deck-triggered count-up ──
  var _countUpMo = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === "attributes" && m.attributeName === "class") {
        var el = m.target;
        if (el.classList.contains("aup-animated") &&
            el.getAttribute("data-animate") === "count-up" &&
            typeof _startCountUp === "function") {
          _startCountUp(el);
        }
      }
    }
  });
  _countUpMo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });

  // ── Frame Bridge postMessage handler ──
  var _frameBridgeMsgCount = {};
  var _frameBridgeLastReset = Date.now();

  function _isMountedFrameWindow(win) {
    if (!win) return false;
    var frames = document.querySelectorAll(".aup-frame iframe, .aup-frame-overlay iframe");
    for (var i = 0; i < frames.length; i++) {
      try {
        if (frames[i].contentWindow === win) return true;
      } catch (_ex) {}
    }
    return false;
  }

  window.addEventListener("message", function(e) {
    if (!e.data || typeof e.data.type !== "string") return;

    // Source check: only accept from known iframe contentWindows
    if (typeof _aupFrameWindows !== "undefined") {
      if (!_aupFrameWindows.has(e.source)) return;
      if (!_isMountedFrameWindow(e.source)) {
        _aupFrameWindows.delete(e.source);
        if (typeof _aupBridgeWindows !== "undefined") _aupBridgeWindows.delete(e.source);
        if (typeof _aupBridgeOriginByWindow !== "undefined" && _aupBridgeOriginByWindow.delete) {
          _aupBridgeOriginByWindow.delete(e.source);
        }
        return;
      }
    }
    var isBridgeMessage =
      e.data.type === "aup_event" ||
      e.data.type === "aup_navigate" ||
      e.data.type === "aup_toast" ||
      e.data.type === "aup_fetch_request" ||
      e.data.type === "aup_bridge_read" ||
      e.data.type === "aup_bridge_list" ||
      e.data.type === "aup_bridge_write" ||
      e.data.type === "aup_bridge_exec" ||
      e.data.type === "aup_bridge_subscribe" ||
      e.data.type === "aup_bridge_unsubscribe";
    // Bridge check: only accept from explicitly bridge-enabled frames.
    if (isBridgeMessage) {
      if (typeof _aupBridgeWindows === "undefined" || !_aupBridgeWindows.has(e.source)) return;
      if (typeof _aupBridgeOriginByWindow !== "undefined" && _aupBridgeOriginByWindow.get) {
        var expectedOrigin = _aupBridgeOriginByWindow.get(e.source);
        if (!expectedOrigin || e.origin !== expectedOrigin) return;
      }
    }

    // Rate limiting: max 60 messages per second per source
    var now = Date.now();
    if (now - _frameBridgeLastReset > 1000) {
      _frameBridgeMsgCount = {};
      _frameBridgeLastReset = now;
    }
    var srcKey = e.origin || "unknown";
    _frameBridgeMsgCount[srcKey] = (_frameBridgeMsgCount[srcKey] || 0) + 1;
    if (_frameBridgeMsgCount[srcKey] > 60) return;

    switch (e.data.type) {
      case "aup_event": {
        // Route to handleAupEvent same as button clicks
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: "aup_event",
            nodeId: "__bridge__",
            event: e.data.event || "message",
            data: e.data.data
          }));
        }
        break;
      }
      case "aup_navigate": {
        var path = e.data.path || "";
        // If path starts with /pages/, update the iframe src
        if (path.indexOf("/pages/") === 0) {
          var frames = document.querySelectorAll(".aup-frame iframe");
          if (frames.length > 0 && e.source) {
            for (var i = 0; i < frames.length; i++) {
              try {
                if (frames[i].contentWindow === e.source) {
                  var pageId = path.replace(/^\\/pages\\//, "");
                  var newSrc = location.origin + "/p/" + encodeURIComponent(pageId);
                  if (_afsSessionId) newSrc += "?sid=" + encodeURIComponent(_afsSessionId);
                  if (_afsSessionToken) {
                    newSrc += (_afsSessionId ? "&" : "?") + "st=" + encodeURIComponent(_afsSessionToken);
                  }
                  frames[i].src = newSrc;
                  break;
                }
              } catch(ex) {}
            }
          }
        }
        break;
      }
      case "aup_toast": {
        // Create a toast overlay via AUP patch
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: "aup_event",
            nodeId: "__bridge__",
            event: "toast",
            data: { message: e.data.message || "", intent: e.data.intent || "info" }
          }));
        }
        break;
      }
      case "aup_fetch_request": {
        var reqPath = typeof e.data.path === "string" ? e.data.path : "/";
        var reqId = typeof e.data.id === "string" ? e.data.id : "";
        var source = e.source;
        if (!reqPath || reqPath.charAt(0) !== "/" || reqPath.indexOf("..") >= 0) return;
        var respOrigin = e.origin;
        if (!respOrigin || respOrigin === "null") return;
        if (window.afs && window.afs.read) {
          window.afs.read(reqPath).then(function(result) {
            if (source) {
              source.postMessage({ type: "aup_fetch_response", id: reqId, payload: result }, respOrigin);
            }
          }).catch(function(err) {
            if (source) {
              source.postMessage(
                { type: "aup_fetch_response", id: reqId, payload: null, error: err.message },
                respOrigin,
              );
            }
          });
        }
        break;
      }
      case "aup_bridge_read":
      case "aup_bridge_list":
      case "aup_bridge_write":
      case "aup_bridge_exec": {
        var bp = e.data.params || {};
        var bId = typeof e.data.id === "string" ? e.data.id : "";
        var bSource = e.source;
        var bOrigin = e.origin;
        var bPath = typeof bp.path === "string" ? bp.path : "/";
        if (!bPath || bPath.charAt(0) !== "/" || bPath.indexOf("..") >= 0) return;
        if (!bOrigin || bOrigin === "null") return;
        if (!window.afs) return;
        var bPromise;
        switch (e.data.type) {
          case "aup_bridge_read": bPromise = window.afs.read(bPath); break;
          case "aup_bridge_list": bPromise = window.afs.list(bPath, bp.options || {}); break;
          case "aup_bridge_write": bPromise = window.afs.write(bPath, bp.content, bp.meta); break;
          case "aup_bridge_exec": bPromise = window.afs.exec(bPath, bp.args || {}); break;
        }
        if (bPromise && bPromise.then) {
          bPromise.then(function(result) {
            if (bSource) bSource.postMessage({ type: "aup_bridge_response", id: bId, payload: result }, bOrigin);
          }).catch(function(err) {
            if (bSource) bSource.postMessage({ type: "aup_bridge_response", id: bId, payload: null, error: err.message }, bOrigin);
          });
        }
        break;
      }
      case "aup_bridge_subscribe": {
        var subFilter = e.data.filter;
        var subId = e.data.subId;
        var subSource = e.source;
        var subOrigin = e.origin;
        if (!subId || !subOrigin || subOrigin === "null" || !window.afs || !window.afs.subscribe) return;
        var unsub = window.afs.subscribe(subFilter, function(payload) {
          if (subSource) {
            try { subSource.postMessage({ type: "aup_subscribe_event", subId: subId, payload: payload }, subOrigin); } catch(ex) {}
          }
        });
        if (!window._aupBridgeSubs) window._aupBridgeSubs = {};
        window._aupBridgeSubs[subId] = unsub;
        // Track which window owns this subscription for cleanup
        if (!window._aupBridgeSubsByWindow) window._aupBridgeSubsByWindow = new Map();
        if (!window._aupBridgeSubsByWindow.has(subSource)) window._aupBridgeSubsByWindow.set(subSource, new Set());
        window._aupBridgeSubsByWindow.get(subSource).add(subId);
        break;
      }
      case "aup_bridge_unsubscribe": {
        var uSubId = e.data.subId;
        if (window._aupBridgeSubs && window._aupBridgeSubs[uSubId]) {
          window._aupBridgeSubs[uSubId]();
          delete window._aupBridgeSubs[uSubId];
        }
        // Clean up reverse tracking
        if (window._aupBridgeSubsByWindow && e.source) {
          var uSubs = window._aupBridgeSubsByWindow.get(e.source);
          if (uSubs) {
            uSubs.delete(uSubId);
            if (uSubs.size === 0) window._aupBridgeSubsByWindow.delete(e.source);
          }
        }
        break;
      }
    }
  });

  // ── Send + Connect (skipped in snapshot mode) ──
  if (typeof _SNAPSHOT_MODE === "undefined" || !_SNAPSHOT_MODE) {
  function send() {
    if (!inputEl) return;
    var text = inputEl.value.trim();
    if (!text && !currentPrompt) return;
    var val = inputEl.value;
    inputEl.value = "";
    inputEl.style.height = "auto";

    if (currentPrompt) {
      addMsg(val, "user");
      sendPromptResponse(val);
    } else {
      addMsg(val, "user");
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "input", content: val }));
      }
    }
  }

  if (btnSend) btnSend.onclick = send;

  if (inputEl) {
    inputEl.onkeydown = function(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    };

    inputEl.oninput = function() {
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
    };
  }

  // ── Pre-render from snapshot (before WebSocket connects) ──
  // Mirrors handleAup render action — same fields, same order.
  // WebSocket render will overwrite this when it arrives.
  if (typeof _preloadedTree !== "undefined" && _preloadedTree && _preloadedTree.root) {
    aupNodeTree = _preloadedTree.root;
    aupFullPage = true;
    _aupTitle = _preloadedTree.title || null;
    if (_preloadedTree.page) _aupCurrentPage = _preloadedTree.page;
    if (_preloadedTree.tone && !_userSetStyle) setTone(_preloadedTree.tone);
    if (_preloadedTree.palette && !_userSetStyle) setPalette(_preloadedTree.palette);
    if (_preloadedTree.locale) setLocale(_preloadedTree.locale);
    renderAupTree();
    showAupDisplay();
  }

  connect();
  } // end if (!_SNAPSHOT_MODE) — send/connect block
})();
`;
