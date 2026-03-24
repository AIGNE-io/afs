/**
 * Inline HTML template for the AFS UI terminal client.
 *
 * Self-contained — CDN dependencies for xterm.js terminal emulator.
 * Ported from AOS terminal surface, adapted for AFS UIBackend WS protocol.
 *
 * WS Protocol (server→client):
 *   { type: "output", data: "text" }   — write text to terminal
 *   { type: "prompt", message, promptType, options }  — prompt request
 *   { type: "clear" }                  — clear terminal
 *   { type: "notify", message }        — notification
 *
 * WS Protocol (client→server):
 *   { type: "line", content: "user input" }      — complete line
 *   { type: "prompt_response", value: ... }       — prompt answer
 *   { type: "resize", cols, rows }                — terminal resize
 */
export const TERM_CLIENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AFS Terminal</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5/css/xterm.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0e14; }
    #terminal { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="terminal"></div>

  <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5/lib/xterm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0/lib/addon-fit.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-webgl@0/lib/addon-webgl.min.js"></script>
  <script>
    var term = new window.Terminal({
      cursorBlink: true,
      fontSize: 14,
      lineHeight: 1.2,
      fontFamily: 'Menlo, "Fira Code", "Cascadia Code", monospace',
      theme: {
        background: '#0a0e14',
        foreground: '#b3b1ad',
        cursor: '#e6b450',
        selectionBackground: '#1d3b53',
        green: '#91b362',
        brightGreen: '#a6cc70',
        red: '#f07178',
        brightRed: '#ff8f80',
        yellow: '#e6b450',
        brightYellow: '#ffee99',
        blue: '#59c2ff',
        brightBlue: '#73d0ff',
        magenta: '#d2a6ff',
        brightMagenta: '#dfbfff',
        cyan: '#95e6cb',
        brightCyan: '#a8e6cf',
        white: '#b3b1ad',
        brightWhite: '#ffffff',
      },
    });
    var fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal'));

    // WebGL renderer for pixel-perfect rendering
    try {
      var webglAddon = new window.WebglAddon.WebglAddon();
      webglAddon.onContextLoss(function() { webglAddon.dispose(); });
      term.loadAddon(webglAddon);
    } catch(e) {
      // WebGL not available — fall back to canvas
    }

    fitAddon.fit();

    // ── State ──
    var lineBuffer = '';
    var ws = null;
    var currentPrompt = null;

    function writeAnsi(text) {
      // Convert \\n to \\r\\n for xterm
      var lines = text.split('\\n');
      for (var i = 0; i < lines.length; i++) {
        if (i > 0) term.write('\\r\\n');
        term.write(lines[i]);
      }
    }

    function writePromptText() {
      if (currentPrompt) return;
      term.write('\\x1b[33m> \\x1b[0m');
    }

    /** Replace the current line buffer, updating the terminal display. */
    function replaceLine(text) {
      if (lineBuffer.length > 0) {
        term.write('\\x1b[' + lineBuffer.length + 'D');
        term.write('\\x1b[K');
      }
      lineBuffer = text;
      term.write(text);
    }

    // ── WebSocket ──
    function connect() {
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(proto + '//' + location.host);

      ws.onopen = function() {
        term.writeln('\\x1b[32m● connected\\x1b[0m');
        writePromptText();
        // Send initial size
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      };

      ws.onclose = function() {
        term.writeln('\\r\\n\\x1b[31m● disconnected — reconnecting...\\x1b[0m');
        setTimeout(connect, 2000);
      };

      ws.onerror = function() {
        term.writeln('\\r\\n\\x1b[31m● connection error\\x1b[0m');
      };

      ws.onmessage = function(evt) {
        var msg;
        try { msg = JSON.parse(evt.data); } catch(e) { return; }

        if (msg.type === 'output') {
          writeAnsi(msg.data);
          if (!msg.data.endsWith('\\n')) term.write('\\r\\n');
          writePromptText();
        } else if (msg.type === 'prompt') {
          handlePrompt(msg);
        } else if (msg.type === 'clear') {
          term.clear();
          writePromptText();
        } else if (msg.type === 'notify') {
          term.write('\\x1b[36m[notice] ' + msg.message + '\\x1b[0m\\r\\n');
          writePromptText();
        }
      };
    }

    function handlePrompt(msg) {
      currentPrompt = msg;
      var promptType = msg.promptType || 'text';

      if (promptType === 'confirm') {
        writeAnsi(msg.message + ' (y/n) ');
      } else if (promptType === 'select' && msg.options) {
        writeAnsi(msg.message + '\\n');
        for (var i = 0; i < msg.options.length; i++) {
          writeAnsi('  ' + (i + 1) + '. ' + msg.options[i] + '\\n');
        }
        term.write('Choice: ');
      } else if (promptType === 'multiselect' && msg.options) {
        writeAnsi(msg.message + '\\n');
        for (var i = 0; i < msg.options.length; i++) {
          writeAnsi('  ' + (i + 1) + '. ' + msg.options[i] + '\\n');
        }
        term.write('Choices (comma-separated): ');
      } else {
        // text or password
        writeAnsi(msg.message + ' ');
      }
    }

    function sendPromptResponse(value) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'prompt_response', value: value }));
      }
      currentPrompt = null;
    }

    function submitLine() {
      var text = lineBuffer;
      lineBuffer = '';
      term.writeln('');

      if (currentPrompt) {
        var promptType = currentPrompt.promptType || 'text';
        if (promptType === 'confirm') {
          sendPromptResponse(text.trim().toLowerCase().indexOf('y') === 0);
        } else if (promptType === 'select') {
          var idx = parseInt(text.trim(), 10) - 1;
          if (idx >= 0 && currentPrompt.options && idx < currentPrompt.options.length) {
            sendPromptResponse(currentPrompt.options[idx]);
          } else if (currentPrompt.options && currentPrompt.options.length > 0) {
            sendPromptResponse(currentPrompt.options[0]);
          }
        } else if (promptType === 'multiselect') {
          var indices = text.split(',').map(function(s) { return parseInt(s.trim(), 10) - 1; });
          var selected = [];
          for (var i = 0; i < indices.length; i++) {
            if (indices[i] >= 0 && currentPrompt.options && indices[i] < currentPrompt.options.length) {
              selected.push(currentPrompt.options[indices[i]]);
            }
          }
          sendPromptResponse(selected);
        } else {
          sendPromptResponse(text);
        }
      } else {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'line', content: text }));
        }
        writePromptText();
      }
    }

    // ── Input handling ──
    term.onData(function(data) {
      if (data === '\\r') {
        // Enter
        submitLine();
      } else if (data === '\\x7f') {
        // Backspace
        if (lineBuffer.length > 0) {
          lineBuffer = lineBuffer.slice(0, -1);
          term.write('\\b \\b');
        }
      } else if (data === '\\x03') {
        // Ctrl-C — clear line
        lineBuffer = '';
        term.write('^C\\r\\n');
        writePromptText();
      } else if (data >= ' ') {
        // Printable characters
        if (currentPrompt && currentPrompt.promptType === 'password') {
          lineBuffer += data;
          term.write('*');
        } else {
          lineBuffer += data;
          term.write(data);
        }
      }
    });

    // ── Resize ──
    window.addEventListener('resize', function() {
      fitAddon.fit();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });

    term.writeln('\\x1b[1;33mAFS Terminal\\x1b[0m');
    term.writeln('');
    connect();
  </script>
</body>
</html>`;
