export const TEXT_JS = `
  function renderAupText(node) {
    var p = node.props || {};
    var level = p.level || node.state && node.state.level;
    var tag = level ? "h" + Math.min(6, Math.max(1, parseInt(level))) : "div";
    var el = document.createElement(tag);
    el.className = "aup-text";
    if (level) el.setAttribute("data-level", String(level));
    if (p.scale) el.setAttribute("data-scale", p.scale);
    if (p.format) el.setAttribute("data-format", p.format);
    if (p.intent) el.setAttribute("data-intent", p.intent);
    if (p.mode) el.setAttribute("data-mode", p.mode);
    if (p.size) el.setAttribute("data-size", p.size);
    // ── Animate ──
    if (p.animate && p.animate !== "none") {
      el.setAttribute("data-animate", p.animate);
      if (p.animateDelay) el.style.animationDelay = p.animateDelay + "ms";
      if (p.animateDuration) el.style.animationDuration = p.animateDuration + "ms";
    }
    // Render content — resolve $session.* variables
    var rawContent = p.content || "";
    var content = String(
      typeof rawContent === "string" && rawContent.indexOf("$session.") === 0
        ? (_sessionCtx[rawContent.slice(9)] ?? "")
        : rawContent
    );
    if (p.format === "markdown" && typeof marked !== "undefined") {
      el.innerHTML = renderMarkdown(content);
      // Intercept internal link clicks — fire AUP event instead of navigating
      el.addEventListener("click", function(e) {
        var a = e.target.closest ? e.target.closest("a[href]") : null;
        if (!a) return;
        var href = a.getAttribute("href") || "";
        // Skip external links (http://, https://, mailto:, tel:, #anchor)
        if (/^(https?:|mailto:|tel:|#)/.test(href)) return;
        e.preventDefault();
        _fireAupEvent(node.id, "link-click", { href: href });
      });
    } else if (p.format === "html") {
      // Render raw HTML in a sandboxed iframe (for email content etc.)
      var iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "allow-same-origin");
      iframe.style.cssText = "width:100%;border:none;overflow:hidden;display:block;";
      iframe.srcdoc = content;
      // Auto-resize iframe to fit content
      iframe.onload = function() {
        try {
          var doc = iframe.contentDocument || iframe.contentWindow.document;
          // Inject base target to open links in parent
          var base = doc.createElement("base");
          base.target = "_blank";
          doc.head.appendChild(base);
          // Auto-height
          function resize() {
            var h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
            iframe.style.height = h + "px";
          }
          resize();
          // Re-measure after images load
          var imgs = doc.querySelectorAll("img");
          var pending = imgs.length;
          if (pending > 0) {
            for (var ii = 0; ii < imgs.length; ii++) {
              imgs[ii].addEventListener("load", function() { if (--pending <= 0) resize(); });
              imgs[ii].addEventListener("error", function() { if (--pending <= 0) resize(); });
            }
          }
        } catch(e) {}
      };
      el.appendChild(iframe);
    } else if (p.format === "code") {
      var pre = document.createElement("pre");
      var codeEl = document.createElement("code");
      if (typeof hljs !== "undefined") {
        if (p.language && hljs.getLanguage(p.language)) {
          codeEl.innerHTML = hljs.highlight(content, { language: p.language }).value;
          codeEl.className = "hljs language-" + p.language;
        } else {
          var autoResult = hljs.highlightAuto(content);
          codeEl.innerHTML = autoResult.value;
          codeEl.className = "hljs";
        }
      } else {
        codeEl.textContent = content;
      }
      pre.appendChild(codeEl);
      el.appendChild(pre);
    } else {
      el.textContent = content;
    }
    // ── Copyable ──
    if (p.copyable && content) {
      el.setAttribute("data-copyable", "true");
      // For plain text: wrap in span for truncation; for markdown/code: keep rendered HTML intact
      if (!p.format || (p.format !== "markdown" && p.format !== "code")) {
        var textSpan = document.createElement("span");
        textSpan.className = "aup-copy-text";
        textSpan.textContent = content;
        textSpan.title = content;
        el.textContent = "";
        el.appendChild(textSpan);
      }
      var copyBtn = document.createElement("button");
      copyBtn.className = "aup-copy-btn";
      copyBtn.title = "Copy to clipboard";
      copyBtn.textContent = "\u2398";
      copyBtn.onclick = function(e) {
        e.stopPropagation();
        navigator.clipboard.writeText(content).then(function() {
          copyBtn.textContent = "\u2713";
          copyBtn.setAttribute("data-copied", "true");
          setTimeout(function() { copyBtn.textContent = "\u2398"; copyBtn.removeAttribute("data-copied"); }, 1500);
        });
      };
      el.appendChild(copyBtn);
    }
    // ── Count-up animation ──
    if (p.animate === "count-up") {
      var raw = content.replace(/,/g, "");
      var target = parseFloat(raw);
      if (!isNaN(target)) {
        var isInt = target === Math.floor(target) && raw.indexOf(".") < 0;
        var hasCommas = content.indexOf(",") >= 0;
        var prefix = content.match(/^([^0-9.-]*)/);
        var suffix = content.match(/([^0-9.,]*)$/);
        var pfx = prefix ? prefix[1] : "";
        var sfx = suffix ? suffix[1] : "";
        el.textContent = pfx + "0" + sfx;
        el._countUpTarget = target;
        el._countUpIsInt = isInt;
        el._countUpHasCommas = hasCommas;
        el._countUpPrefix = pfx;
        el._countUpSuffix = sfx;
        el._countUpDuration = p.animateDuration || 2000;
      }
    }
    return el;
  }

  function _startCountUp(el) {
    if (typeof el._countUpTarget !== "number") return;
    var target = el._countUpTarget;
    var isInt = el._countUpIsInt;
    var hasCommas = el._countUpHasCommas;
    var pfx = el._countUpPrefix;
    var sfx = el._countUpSuffix;
    var duration = el._countUpDuration;
    var start = performance.now();

    function formatNum(n) {
      var s = isInt ? String(Math.round(n)) : n.toFixed(String(target).split(".")[1] ? String(target).split(".")[1].length : 2);
      if (hasCommas) s = s.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
      return pfx + s + sfx;
    }

    function tick(now) {
      var elapsed = now - start;
      var progress = Math.min(elapsed / duration, 1);
      // easeOutQuart for smooth deceleration
      var eased = 1 - Math.pow(1 - progress, 4);
      el.textContent = formatNum(target * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

`;
