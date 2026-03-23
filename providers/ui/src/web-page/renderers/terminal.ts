export const TERMINAL_JS = `
  // ── Terminal Component (xterm.js v5) ──
  // Terminal has its own WS protocol — independent of AUP.

  function renderAupTerminal(node) {
    var el = document.createElement("div");
    el.className = "aup-terminal";
    var p = node.props || {};
    var rows = parseInt(p.rows) || 24;
    var fontSize = parseInt(p.fontSize) || 14;

    // Fill parent container; fitAddon adjusts rows/cols to match
    el.style.height = "100%";

    var endpoint = p.endpoint;
    if (!endpoint) {
      var errEl = document.createElement("div");
      errEl.className = "aup-terminal-placeholder";
      errEl.textContent = "Terminal: no endpoint configured";
      el.appendChild(errEl);
      return el;
    }

    // Snapshot mode — no live WebSocket available
    if (typeof _SNAPSHOT_MODE !== "undefined" && _SNAPSHOT_MODE) {
      var notice = document.createElement("div");
      notice.className = "aup-terminal-placeholder";
      notice.textContent = "Terminal (requires live connection)";
      el.appendChild(notice);
      return el;
    }

    // Loading skeleton
    var loading = document.createElement("div");
    loading.className = "aup-terminal-placeholder";
    loading.textContent = "Loading terminal...";
    el.appendChild(loading);

    // CDN lazy load (same pattern as chart/map)
    if (typeof Terminal === "undefined") {
      loadCSS("https://cdn.jsdelivr.net/npm/@xterm/xterm@5/css/xterm.min.css");
      loadScript("https://cdn.jsdelivr.net/npm/@xterm/xterm@5/lib/xterm.min.js", function() {
        loadScript("https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0/lib/addon-fit.min.js", function() {
          if (loading.parentNode) loading.parentNode.removeChild(loading);
          _bootTerminal(el, p, node.id);
        });
      });
    } else {
      if (loading.parentNode) loading.parentNode.removeChild(loading);
      _bootTerminal(el, p, node.id);
    }

    return el;
  }

  // ── CJK / fullwidth display-width helpers ──

  function _cw(ch) {
    var c = ch.charCodeAt(0);
    if (c >= 0x1100 && (
      c <= 0x115F ||
      c === 0x2329 || c === 0x232A ||
      (c >= 0x2E80 && c <= 0x303E) ||
      (c >= 0x3040 && c <= 0x33BF) ||
      (c >= 0x3400 && c <= 0x4DBF) ||
      (c >= 0x4E00 && c <= 0xA4CF) ||
      (c >= 0xAC00 && c <= 0xD7AF) ||
      (c >= 0xF900 && c <= 0xFAFF) ||
      (c >= 0xFE10 && c <= 0xFE6F) ||
      (c >= 0xFF01 && c <= 0xFF60) ||
      (c >= 0xFFE0 && c <= 0xFFE6)
    )) return 2;
    return 1;
  }

  function _sw(s) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += _cw(s.charAt(i));
    return w;
  }

  function _bootTerminal(el, props, nodeId) {
    // Read theme from CSS custom properties
    var cs = getComputedStyle(el);
    var bg = cs.getPropertyValue("--bg").trim();
    var fg = cs.getPropertyValue("--text").trim();
    var accent = cs.getPropertyValue("--accent").trim();

    var term = new Terminal({
      cursorBlink: true,
      fontSize: parseInt(props.fontSize) || 14,
      lineHeight: 1.2,
      fontFamily: props.fontFamily || '"Fira Code", "Cascadia Code", Menlo, monospace',
      theme: {
        background: bg || "#0a0e14",
        foreground: fg || "#b3b1ad",
        cursor: accent || "#e6b450",
        selectionBackground: "#1d3b53",
        green: "#91b362",
        brightGreen: "#a6cc70",
        red: "#f07178",
        brightRed: "#ff8f80",
        yellow: "#e6b450",
        brightYellow: "#ffee99",
        blue: "#59c2ff",
        brightBlue: "#73d0ff",
        magenta: "#d2a6ff",
        brightMagenta: "#dfbfff",
        cyan: "#95e6cb",
        brightCyan: "#a8e6cf",
        white: "#b3b1ad",
        brightWhite: "#ffffff",
      },
    });

    var fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    fitAddon.fit();

    // WebGL addon — loaded async, non-blocking
    loadScript("https://cdn.jsdelivr.net/npm/@xterm/addon-webgl@0/lib/addon-webgl.min.js", function() {
      try {
        var wa = new WebglAddon.WebglAddon();
        wa.onContextLoss(function() { wa.dispose(); });
        term.loadAddon(wa);
      } catch(e) {}
    });

    // ── State ──
    var endpoint = props.endpoint;
    var wsUrl = endpoint.match(/^wss?:/)
      ? endpoint
      : (location.protocol === "https:" ? "wss:" : "ws:")
        + "//" + location.host + endpoint;

    var ws = null;
    var lineBuffer = "";
    var cursorPos = 0;
    var historyKey = "_aupTermHist_" + endpoint;
    var history = [];
    try { history = JSON.parse(sessionStorage.getItem(historyKey) || "[]"); } catch(e) {}
    var historyIndex = -1;
    var savedLine = "";
    var reconnectDelay = 1000;
    var reconnectTimer = null;
    var readonly = !!props.readonly;

    // ── Line editing helpers ──

    function _writePrompt() {
      if (!readonly) term.write("\\x1b[33m> \\x1b[0m");
    }

    function _replaceLine(text) {
      var oldW = _sw(lineBuffer.slice(0, cursorPos));
      if (oldW > 0) term.write("\\x1b[" + oldW + "D");
      term.write("\\x1b[K");
      term.write(text);
      lineBuffer = text;
      cursorPos = text.length;
    }

    // ── WebSocket ──

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onopen = function() {
        reconnectDelay = 1000;
        term.writeln("\\x1b[32m● connected\\x1b[0m");
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: "resize", cols: term.cols, rows: term.rows
          }));
        }
      };

      ws.onclose = function(e) {
        term.writeln("\\r\\n\\x1b[31m● disconnected\\x1b[0m");
	if (e.code >= 4000) {
	  term.writeln("\\x1b[33m● server rejected connection\\x1b[0m");
	  return;
	}
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      };

      ws.onerror = function() {};

      ws.onmessage = function(evt) {
        var msg;
        try { msg = JSON.parse(evt.data); } catch(e) { return; }

        if (msg.type === "output" && msg.data) {
          _termWriteAnsi(term, msg.data);
          if (!msg.data.endsWith("\\n")) term.write("\\r\\n");
          _writePrompt();
        } else if (msg.type === "done") {
          _writePrompt();
        } else if (msg.type === "clear") {
          term.clear();
          _writePrompt();
        } else if (msg.type === "notify" && msg.message) {
          term.writeln("\\x1b[36m" + msg.message + "\\x1b[0m");
          _writePrompt();
        }
      };
    }

    // ── Input handling (skip if readonly) ──
    if (!readonly) {
      term.onData(function(data) {
        // ── Enter ──
        if (data === "\\r") {
          term.writeln("");
          if (lineBuffer.length > 0) {
            if (history.length === 0 || history[history.length - 1] !== lineBuffer) {
              history.push(lineBuffer);
              if (history.length > 50) history.shift();
              try { sessionStorage.setItem(historyKey, JSON.stringify(history)); } catch(e) {}
            }
            if (ws && ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "line", content: lineBuffer }));
            }
          } else {
            _writePrompt();
          }
          lineBuffer = "";
          cursorPos = 0;
          historyIndex = -1;
          savedLine = "";
          return;
        }

        // ── Backspace ──
        if (data === "\\x7f") {
          if (cursorPos > 0) {
            var dw = _cw(lineBuffer.charAt(cursorPos - 1));
            var tail = lineBuffer.slice(cursorPos);
            var tw = _sw(tail);
            lineBuffer = lineBuffer.slice(0, cursorPos - 1) + tail;
            cursorPos--;
            term.write("\\x1b[" + dw + "D" + tail + " ".repeat(dw));
            term.write("\\x1b[" + (tw + dw) + "D");
          }
          return;
        }

        // ── Ctrl-C ──
        if (data === "\\x03") {
          lineBuffer = "";
          cursorPos = 0;
          historyIndex = -1;
          savedLine = "";
          term.write("^C\\r\\n");
          _writePrompt();
          return;
        }

        // ── Ctrl-L — clear screen ──
        if (data === "\\x0c") {
          term.clear();
          term.write("\\x1b[2K\\r");
          _writePrompt();
          term.write(lineBuffer);
          if (cursorPos < lineBuffer.length) {
            var w = _sw(lineBuffer.slice(cursorPos));
            term.write("\\x1b[" + w + "D");
          }
          return;
        }

        // ── Ctrl-U — kill line before cursor ──
        if (data === "\\x15") {
          if (cursorPos > 0) {
            var bw = _sw(lineBuffer.slice(0, cursorPos));
            var after = lineBuffer.slice(cursorPos);
            var aw = _sw(after);
            term.write("\\x1b[" + bw + "D\\x1b[K" + after);
            if (aw > 0) term.write("\\x1b[" + aw + "D");
            lineBuffer = after;
            cursorPos = 0;
          }
          return;
        }

        // ── Ctrl-K — kill line after cursor ──
        if (data === "\\x0b") {
          lineBuffer = lineBuffer.slice(0, cursorPos);
          term.write("\\x1b[K");
          return;
        }

        // ── Ctrl-W — delete word before cursor ──
        if (data === "\\x17") {
          if (cursorPos > 0) {
            var before = lineBuffer.slice(0, cursorPos);
            var after = lineBuffer.slice(cursorPos);
            var stripped = before.replace(/\\s+$/, "");
            var wordStart = stripped.lastIndexOf(" ") + 1;
            var deletedStr = before.slice(wordStart);
            var dw = _sw(deletedStr);
            var aw = _sw(after);
            lineBuffer = before.slice(0, wordStart) + after;
            cursorPos = wordStart;
            term.write("\\x1b[" + dw + "D" + after + " ".repeat(dw));
            term.write("\\x1b[" + (aw + dw) + "D");
          }
          return;
        }

        // ── Ctrl-A — beginning of line ──
        if (data === "\\x01") {
          if (cursorPos > 0) {
            var w = _sw(lineBuffer.slice(0, cursorPos));
            term.write("\\x1b[" + w + "D");
            cursorPos = 0;
          }
          return;
        }

        // ── Ctrl-E — end of line ──
        if (data === "\\x05") {
          if (cursorPos < lineBuffer.length) {
            var w = _sw(lineBuffer.slice(cursorPos));
            term.write("\\x1b[" + w + "C");
            cursorPos = lineBuffer.length;
          }
          return;
        }

        // ── Escape sequences (arrows, Home, End, Delete) ──
        if (data.length > 1 && data.charAt(0) === "\\x1b") {
          // Up arrow — history back
          if (data === "\\x1b[A" || data === "\\x1bOA") {
            if (history.length === 0) return;
            if (historyIndex === -1) {
              savedLine = lineBuffer;
              historyIndex = history.length - 1;
            } else if (historyIndex > 0) {
              historyIndex--;
            } else {
              return;
            }
            _replaceLine(history[historyIndex]);
            return;
          }

          // Down arrow — history forward
          if (data === "\\x1b[B" || data === "\\x1bOB") {
            if (historyIndex === -1) return;
            if (historyIndex < history.length - 1) {
              historyIndex++;
              _replaceLine(history[historyIndex]);
            } else {
              historyIndex = -1;
              _replaceLine(savedLine);
            }
            return;
          }

          // Left arrow
          if (data === "\\x1b[D" || data === "\\x1bOD") {
            if (cursorPos > 0) {
              var w = _cw(lineBuffer.charAt(cursorPos - 1));
              cursorPos--;
              term.write("\\x1b[" + w + "D");
            }
            return;
          }

          // Right arrow
          if (data === "\\x1b[C" || data === "\\x1bOC") {
            if (cursorPos < lineBuffer.length) {
              var w = _cw(lineBuffer.charAt(cursorPos));
              cursorPos++;
              term.write("\\x1b[" + w + "C");
            }
            return;
          }

          // Home
          if (data === "\\x1b[H" || data === "\\x1bOH" || data === "\\x1b[1~") {
            if (cursorPos > 0) {
              var w = _sw(lineBuffer.slice(0, cursorPos));
              term.write("\\x1b[" + w + "D");
              cursorPos = 0;
            }
            return;
          }

          // End
          if (data === "\\x1b[F" || data === "\\x1bOF" || data === "\\x1b[4~") {
            if (cursorPos < lineBuffer.length) {
              var w = _sw(lineBuffer.slice(cursorPos));
              term.write("\\x1b[" + w + "C");
              cursorPos = lineBuffer.length;
            }
            return;
          }

          // Delete key
          if (data === "\\x1b[3~") {
            if (cursorPos < lineBuffer.length) {
              var dw = _cw(lineBuffer.charAt(cursorPos));
              var tail = lineBuffer.slice(cursorPos + 1);
              var tw = _sw(tail);
              lineBuffer = lineBuffer.slice(0, cursorPos) + tail;
              term.write(tail + " ".repeat(dw));
              term.write("\\x1b[" + (tw + dw) + "D");
            }
            return;
          }

          // Ignore other escape sequences
          return;
        }

        // ── Printable characters ──
        if (data >= " ") {
          if (cursorPos === lineBuffer.length) {
            lineBuffer += data;
            cursorPos += data.length;
            term.write(data);
          } else {
            var tail = lineBuffer.slice(cursorPos);
            var tw = _sw(tail);
            lineBuffer = lineBuffer.slice(0, cursorPos) + data + tail;
            cursorPos += data.length;
            term.write(data + tail);
            if (tw > 0) term.write("\\x1b[" + tw + "D");
          }
        }
      });
    }

    connect();

    // ── Resize observer ──
    var ro = new ResizeObserver(function() {
      fitAddon.fit();
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: "resize", cols: term.cols, rows: term.rows
        }));
      }
    });
    ro.observe(el);

    // Store cleanup function on element for AUP patch removal
    el._aupTerminalCleanup = function() {
      ro.disconnect();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
      term.dispose();
    };
  }

  function _termWriteAnsi(term, text) {
    var lines = text.split("\\n");
    for (var i = 0; i < lines.length; i++) {
      if (i > 0) term.write("\\r\\n");
      term.write(lines[i]);
    }
  }
`;
