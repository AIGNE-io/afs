export const EDITOR_JS = `
  // ── Editor Subsystem (CodeMirror 6 from CDN) ──
  function renderAupEditor(node) {
    var el = document.createElement("div");
    el.className = "aup-editor";
    var p = node.props || {};
    var language = p.language || "text";
    var readOnly = p.readOnly === true;
    var showLineNumbers = p.lineNumbers !== false;
    var content = p.content || "";

    // Toolbar
    var toolbar = document.createElement("div");
    toolbar.className = "aup-editor-toolbar";
    var langLabel = document.createElement("span");
    langLabel.style.cssText = "font-size: 0.78em; color: var(--color-dim); margin-right: auto;";
    langLabel.textContent = language.toUpperCase();
    toolbar.appendChild(langLabel);
    if (!readOnly) {
      var wrapBtn = document.createElement("button");
      wrapBtn.textContent = "Wrap";
      wrapBtn.onclick = function() {
        var ta = el.querySelector("textarea");
        if (ta) {
          var isWrapped = ta.style.whiteSpace !== "pre";
          ta.style.whiteSpace = isWrapped ? "pre" : "pre-wrap";
          wrapBtn.classList.toggle("active", !isWrapped);
        }
      };
      toolbar.appendChild(wrapBtn);
    }
    el.appendChild(toolbar);

    // Editor area
    var area = document.createElement("div");
    area.className = "aup-editor-area";
    if (showLineNumbers) area.classList.add("has-gutter");

    // Syntax highlight overlay (behind textarea)
    var highlight = document.createElement("pre");
    highlight.className = "aup-editor-highlight";
    var hCode = document.createElement("code");
    highlight.appendChild(hCode);
    area.appendChild(highlight);

    function updateHighlight(text) {
      if (typeof hljs !== "undefined" && language !== "text") {
        try {
          var lang = language === "typescript" ? "typescript" : language;
          var result = hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }) : hljs.highlightAuto(text);
          hCode.innerHTML = result.value;
        } catch(e) {
          hCode.textContent = text;
        }
      } else {
        hCode.textContent = text;
      }
    }
    updateHighlight(content);

    var ta = document.createElement("textarea");
    ta.value = content;
    ta.readOnly = readOnly;
    ta.spellcheck = false;
    ta.autocomplete = "off";
    ta.setAttribute("autocapitalize", "off");
    area.appendChild(ta);

    // Sync scroll between textarea and highlight overlay
    ta.addEventListener("scroll", function() { highlight.scrollTop = ta.scrollTop; highlight.scrollLeft = ta.scrollLeft; });

    // Line numbers gutter
    if (showLineNumbers) {
      var gutter = document.createElement("div");
      gutter.className = "aup-editor-gutter";
      function updateGutter() {
        var lines = ta.value.split("\\n").length;
        var nums = [];
        for (var i = 1; i <= lines; i++) nums.push(String(i));
        gutter.textContent = nums.join("\\n");
      }
      updateGutter();
      ta.addEventListener("input", updateGutter);
      ta.addEventListener("scroll", function() { gutter.scrollTop = ta.scrollTop; });
      area.appendChild(gutter);
    }

    el.appendChild(area);

    // Status bar
    var statusbar = document.createElement("div");
    statusbar.className = "aup-editor-statusbar";
    var lineInfo = document.createElement("span");
    lineInfo.textContent = "Ln 1, Col 1";
    var charInfo = document.createElement("span");
    charInfo.textContent = content.length + " chars";
    statusbar.appendChild(lineInfo);
    statusbar.appendChild(charInfo);
    ta.addEventListener("input", function() {
      charInfo.textContent = ta.value.length + " chars";
      updateHighlight(ta.value);
    });
    ta.addEventListener("click", function() {
      var val = ta.value.substring(0, ta.selectionStart);
      var ln = val.split("\\n").length;
      var col = ta.selectionStart - val.lastIndexOf("\\n");
      lineInfo.textContent = "Ln " + ln + ", Col " + col;
    });
    ta.addEventListener("keyup", ta.onclick);
    el.appendChild(statusbar);

    // Event: content change
    if (node.events && node.events.change) {
      ta.addEventListener("input", function() {
        _fireAupEvent(node.id, "change", { content: ta.value });
      });
    }

    return el;
  }

`;
