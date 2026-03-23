export const INPUT_JS = `
  function renderAupInput(node) {
    var el = document.createElement("div");
    el.className = "aup-input";
    var p = node.props || {};
    var s = node.state || {};
    var inputType = p.mode || p.type || p.variant || "text";

    // Label
    if (p.label) {
      var lbl = document.createElement("label");
      lbl.textContent = _escapeHtml(String(p.label));
      el.appendChild(lbl);
    }

    if (inputType === "select") {
      var sel = document.createElement("select");
      if (p.name) sel.name = String(p.name);
      var opts = Array.isArray(p.options) ? p.options : [];
      for (var i = 0; i < opts.length; i++) {
        var opt = document.createElement("option");
        var optItem = opts[i];
        // Support both string options and {label, value} objects
        var optVal = typeof optItem === "object" && optItem !== null ? (optItem.value || optItem.label || "") : String(optItem);
        var optLabel = typeof optItem === "object" && optItem !== null ? (optItem.label || optItem.value || "") : String(optItem);
        opt.value = String(optVal);
        opt.textContent = _escapeHtml(String(optLabel));
        if (String(p.value) === String(optVal) || String(s.value) === String(optVal)) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.onchange = function() {
        if (node.events && node.events.change) {
          _fireAupEvent(node.id, "change", { value: sel.value });
        }
      };
      el.appendChild(sel);
    } else if (inputType === "toggle") {
      var toggleRow = document.createElement("div");
      toggleRow.className = "aup-toggle";
      var track = document.createElement("div");
      track.className = "aup-toggle-track" + (s.value ? " on" : "");
      var thumb = document.createElement("div");
      thumb.className = "aup-toggle-thumb";
      track.appendChild(thumb);
      toggleRow.appendChild(track);
      var toggleHidden = document.createElement("input");
      toggleHidden.type = "hidden";
      if (p.name) toggleHidden.name = String(p.name);
      toggleHidden.value = s.value ? "true" : "false";
      toggleRow.onclick = function() {
        track.classList.toggle("on");
        toggleHidden.value = track.classList.contains("on") ? "true" : "false";
        if (node.events && node.events.change) {
          _fireAupEvent(node.id, "change", {});
        }
      };
      el.appendChild(toggleRow);
      el.appendChild(toggleHidden);
    } else if (inputType === "checkbox") {
      var cbRow = document.createElement("div");
      cbRow.className = "aup-checkbox-row";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      if (p.name) cb.name = String(p.name);
      cb.checked = !!s.value;
      cb.onchange = function() {
        if (node.events && node.events.change) {
          _fireAupEvent(node.id, "change", {});
        }
      };
      cbRow.appendChild(cb);
      if (p.label) {
        var cbLbl = document.createElement("span");
        cbLbl.textContent = _escapeHtml(String(p.label));
        cbRow.appendChild(cbLbl);
      }
      el.appendChild(cbRow);
    } else if (inputType === "slider") {
      var slider = document.createElement("input");
      slider.type = "range";
      if (p.min !== undefined) slider.min = String(p.min);
      if (p.max !== undefined) slider.max = String(p.max);
      if (p.step !== undefined) slider.step = String(p.step);
      if (s.value !== undefined) slider.value = String(s.value);
      slider.oninput = function() {
        if (node.events && node.events.change) {
          _fireAupEvent(node.id, "change", {});
        }
      };
      el.appendChild(slider);
    } else if (inputType === "progress") {
      var row = document.createElement("div");
      row.className = "aup-progress-row";
      var bar = document.createElement("div");
      bar.className = "aup-progress";
      var fill = document.createElement("div");
      fill.className = "aup-progress-fill";
      var pct = Math.max(0, Math.min(100, parseFloat(s.value) || 0));
      fill.style.width = pct + "%";
      if (p.intent) fill.setAttribute("data-intent", p.intent);
      bar.appendChild(fill);
      row.appendChild(bar);
      if (p.showValue !== false) {
        var lbl = document.createElement("span");
        lbl.className = "aup-progress-label";
        lbl.textContent = Math.round(pct) + "%";
        row.appendChild(lbl);
      }
      el.appendChild(row);
    } else if (inputType === "textarea") {
      var ta = document.createElement("textarea");
      if (p.name) ta.name = String(p.name);
      ta.rows = p.rows || 3;
      if (p.placeholder) ta.placeholder = String(p.placeholder);
      if (s.value !== undefined) ta.value = String(s.value);
      ta.oninput = function() {
        if (node.events && node.events.change) {
          _fireAupEvent(node.id, "change", {});
        }
      };
      el.appendChild(ta);
    } else {
      // text, password, date, etc.
      var inp = document.createElement("input");
      if (p.name) inp.name = String(p.name);
      inp.type = inputType === "number" ? "number" : inputType === "password" ? "password" : "text";
      if (p.placeholder) inp.placeholder = String(p.placeholder);
      if (s.value !== undefined) inp.value = String(s.value);
      if (p.min !== undefined) inp.min = String(p.min);
      if (p.max !== undefined) inp.max = String(p.max);
      if (inputType === "date") inp.type = "date";
      inp.oninput = function() {
        if (node.events && node.events.change) {
          _fireAupEvent(node.id, "change", {});
        }
      };
      inp.onkeydown = function(e) {
        if (e.key === "Enter" && node.events && node.events.send) {
          _fireAupEvent(node.id, "send", { value: inp.value });
          inp.value = "";
          e.preventDefault();
        }
      };
      el.appendChild(inp);
    }
    return el;
  }

`;
