export const ACTION_JS = `
  function _sanitizeActionHref(rawHref) {
    if (typeof rawHref !== "string") return null;
    var href = rawHref.trim();
    if (!href) return null;
    if (href.charAt(0) === "/" || href.charAt(0) === "#") return href;
    try {
      var parsed = new URL(href, location.href);
      var protocol = parsed.protocol.toLowerCase();
      if (
        protocol === "http:" ||
        protocol === "https:" ||
        protocol === "mailto:" ||
        protocol === "tel:"
      ) {
        return href;
      }
    } catch (_ex) {}
    return null;
  }

  function renderAupAction(node) {
    var p = node.props || {};
    var safeHref = _sanitizeActionHref(p.href);
    var el;
    if (safeHref) {
      el = document.createElement("a");
      el.href = safeHref;
      if (p.target) {
        el.target = p.target;
        if (String(p.target).toLowerCase() === "_blank") {
          el.rel = "noopener noreferrer";
        }
      }
    } else {
      el = document.createElement("button");
    }
    el.className = "aup-action";
    if (p.variant) el.setAttribute("data-variant", p.variant);
    if (p.size) el.setAttribute("data-size", p.size);
    // Icon before label
    if (p.icon && _ICON_PATHS[p.icon]) {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.classList.add("aup-icon-svg");
      svg.innerHTML = _ICON_PATHS[p.icon];
      el.appendChild(svg);
    }
    var span = document.createElement("span");
    span.textContent = String(p.label || "Action");
    el.appendChild(span);
    // Wire click event — intercept client-side actions, route rest to server
    if (node.events && node.events.click) {
      var clickAction = node.events.click.action;
      el.onclick = function(e) {
        if (safeHref) e.preventDefault();
        // Client-side actions — theme/mode/locale switching
        if (clickAction === "open-style-inspector" || clickAction === "open-theme-picker") {
          if (window.__styleInspector) window.__styleInspector.toggle();
          return;
        }
        if (clickAction === "open-palette-picker") {
          if (window.__styleInspector) window.__styleInspector.toggle();
          return;
        }
        if (clickAction === "toggle-mode") {
          setMode(currentModeChoice === "dark" ? "light" : "dark", true);
          el.querySelector("span").textContent = currentModeChoice === "dark" ? "Dark" : "Light";
          return;
        }
        if (clickAction === "set-locale") {
          var loc = node.events.click.locale;
          if (loc) {
            setLocale(loc);
            if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "aup", action: "locale", locale: loc }));
          }
          return;
        }
        // Client-side navigate — full page navigation (login pages, external URLs)
        var navigateUrl = node.events.click.navigate;
        if (navigateUrl) {
          window.location.href = navigateUrl;
          return;
        }
        // Collect sibling form input values when inside a form-like container
        var data = {};
        var formParent = el.parentElement;
        if (formParent) {
          var fields = formParent.querySelectorAll("input, select, textarea");
          for (var fi = 0; fi < fields.length; fi++) {
            var field = fields[fi];
            var fname = field.name;
            if (fname) {
              if (field.type === "checkbox") {
                data[fname] = field.checked;
              } else {
                data[fname] = field.value;
              }
            }
          }
        }
        _fireAupEvent(node.id, "click", data);
      };
    }
    return el;
  }

`;
