export const COMMAND_BAR_JS = `
  function renderAupCommandBar(node) {
    var el = document.createElement("div");
    var p = node.props || {};
    var s = node.state || {};
    var mode = (p && p.mode) || "chat";
    el.className = "aup-command-bar aup-agent-" + mode;
    var messages = Array.isArray(s.messages) ? s.messages : [];

    // ── History area (scrollable) ──
    var history = document.createElement("div");
    history.className = "aup-cb-history";
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var bubble = document.createElement("div");
      bubble.className = "aup-cb-msg aup-cb-msg-" + (msg.role || "user");
      if (msg.role === "assistant" || msg.role === "agent") {
        bubble.innerHTML = renderMarkdown(String(msg.content || ""));
      } else {
        bubble.textContent = String(msg.content || "");
      }
      history.appendChild(bubble);
    }
    el.appendChild(history);

    // ── Live timer for active states (Thinking / Working) ──
    _cbAttachTimer(history);

    // Auto-scroll to bottom after render
    setTimeout(function() { history.scrollTop = history.scrollHeight; }, 0);

    // ── Input bar ──
    var bar = document.createElement("div");
    bar.className = "aup-cb-bar";

    // Model indicator
    var model = document.createElement("span");
    model.className = "aup-cb-model";
    model.textContent = _escapeHtml(String(p.model || "sonnet"));
    bar.appendChild(model);

    // Text input
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "aup-cb-input";
    inp.placeholder = p.placeholder || "Ask anything...";
    inp.autocomplete = "off";
    inp.spellcheck = false;

    // Send handler
    var sending = false;
    function doSend() {
      var text = inp.value.trim();
      if (!text || sending) return;
      sending = true;
      inp.disabled = true;
      var sent = _fireAupEvent(node.id, "submit", { text: text });
      if (!sent) {
        // Connection lost — show error inline
        sending = false;
        inp.disabled = false;
        inp.focus();
        _cbShowError(history, "Service unreachable. Is AFS running?");
        return;
      }
      inp.value = "";
      // Re-enable after brief delay (server will patch UI)
      setTimeout(function() { sending = false; inp.disabled = false; inp.focus(); }, 300);
      // Timeout: if no server response patches UI within 30s, show error
      var guard = setTimeout(function() {
        var ts = window._cbTimerState;
        if (ts && ts.interval) {
          clearInterval(ts.interval);
          ts.interval = null;
          ts.start = 0;
          _cbShowError(history, "Request timed out. Service may be unreachable.");
        }
      }, 30000);
      window._cbTimeoutGuard = guard;
    }

    inp.onkeydown = function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    };
    bar.appendChild(inp);

    // Send button
    var btn = document.createElement("button");
    btn.className = "aup-cb-send";
    btn.textContent = "\\u2192"; // →
    btn.title = "Send";
    btn.onclick = doSend;
    bar.appendChild(btn);

    el.appendChild(bar);
    return el;
  }

  // ── Error display helper ──
  function _cbShowError(historyEl, msg) {
    var errBubble = document.createElement("div");
    errBubble.className = "aup-cb-msg aup-cb-msg-error";
    errBubble.textContent = msg;
    historyEl.appendChild(errBubble);
    setTimeout(function() { historyEl.scrollTop = historyEl.scrollHeight; }, 0);
  }

  // ── Timer helper (persistent across re-renders via window state) ──
  (function() {
    var _cb = window._cbTimerState || (window._cbTimerState = { start: 0, interval: null });

    function cleanup() {
      if (_cb.interval) { clearInterval(_cb.interval); _cb.interval = null; }
      if (window._cbTimeoutGuard) { clearTimeout(window._cbTimeoutGuard); window._cbTimeoutGuard = null; }
    }

    window._cbAttachTimer = function(historyEl) {
      var bubbles = historyEl.querySelectorAll(".aup-cb-msg-assistant, .aup-cb-msg-agent");
      if (!bubbles.length) { cleanup(); return; }
      var last = bubbles[bubbles.length - 1];
      var text = last.textContent || "";

      // Detect "Thinking..." (plain text, exact match)
      if (text.trim() === "Thinking...") {
        _cb.start = Date.now();
        last.innerHTML = "";
        var span = document.createElement("span");
        span.className = "aup-cb-timer";
        last.appendChild(span);
        cleanup();
        _cb.interval = setInterval(function() {
          var s = ((Date.now() - _cb.start) / 1000).toFixed(1);
          span.textContent = "Thinking " + s + "s";
          if (historyEl.scrollHeight - historyEl.scrollTop - historyEl.clientHeight < 50) historyEl.scrollTop = historyEl.scrollHeight;
        }, 100);
        return;
      }

      // Detect <em>Working (round N)...</em> or <em>Responding...</em>
      var ems = last.getElementsByTagName("em");
      var statusEm = null;
      var statusType = null;
      for (var i = 0; i < ems.length; i++) {
        if (/Working/.test(ems[i].textContent)) { statusEm = ems[i]; statusType = "working"; break; }
        if (/Responding/.test(ems[i].textContent)) { statusEm = ems[i]; statusType = "responding"; break; }
      }

      if (statusEm) {
        var roundNum = null;
        if (statusType === "working") {
          var match = statusEm.textContent.match(/round (\\d+)/);
          roundNum = match ? match[1] : "?";
        }
        if (!_cb.start) _cb.start = Date.now();

        statusEm.innerHTML = "";
        var timerSpan = document.createElement("span");
        timerSpan.className = "aup-cb-timer";
        statusEm.appendChild(timerSpan);
        cleanup();
        _cb.interval = setInterval(function() {
          var s = ((Date.now() - _cb.start) / 1000).toFixed(1);
          timerSpan.textContent = roundNum
            ? "Working (round " + roundNum + ") " + s + "s"
            : "Responding " + s + "s";
          if (historyEl.scrollHeight - historyEl.scrollTop - historyEl.clientHeight < 50) historyEl.scrollTop = historyEl.scrollHeight;
        }, 100);
        return;
      }

      // No active state — clean up
      cleanup();
      _cb.start = 0;
    };
  })();
`;
