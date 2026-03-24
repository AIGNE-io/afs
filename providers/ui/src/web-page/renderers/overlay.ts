export const OVERLAY_JS = `
  function renderAupOverlay(node) {
    var el = document.createElement("div");
    el.className = "aup-overlay";
    var p = node.props || {};
    var s = node.state || {};
    var mode = p.mode || "dialog";

    if (s.open) el.classList.add("open");
    if (p.scope) el.setAttribute("data-scope", p.scope);

    var _intentIcons = { info: "\u2139\uFE0F", success: "\u2705", error: "\u274C", warning: "\u26A0\uFE0F" };

    if (mode === "toast") {
      var toast = document.createElement("div");
      toast.className = "aup-overlay-toast";
      var intent = p.intent || "";
      if (intent) toast.setAttribute("data-intent", intent);
      // Position: top-right, top-center, top-left, bottom-right (default), bottom-center, bottom-left
      var position = p.position || "bottom-right";
      toast.setAttribute("data-position", position);

      // Body row: icon + content + close
      var body = document.createElement("div");
      body.className = "aup-toast-body";

      // Icon: intent-based default, custom emoji/name, or image URL
      var _toastIcons = { info: "\u2139\uFE0F", success: "\u2705", error: "\u274C", warning: "\u26A0\uFE0F" };
      var iconVal = p.icon !== undefined ? (_toastIcons[p.icon] || p.icon) : (intent ? _toastIcons[intent] || _toastIcons.info : null);
      if (iconVal && iconVal !== "false" && iconVal !== false) {
        var iconEl = document.createElement("div");
        iconEl.className = "aup-toast-icon";
        if (typeof iconVal === "string" && (iconVal.startsWith("http") || iconVal.startsWith("/"))) {
          var img = document.createElement("img");
          img.src = iconVal;
          img.alt = "";
          iconEl.appendChild(img);
        } else {
          iconEl.textContent = String(iconVal);
        }
        body.appendChild(iconEl);
      }

      // Content: title + message, or children
      var contentEl = document.createElement("div");
      contentEl.className = "aup-toast-content";
      if (p.title) {
        var titleEl = document.createElement("div");
        titleEl.className = "aup-toast-title";
        titleEl.textContent = _escapeHtml(String(p.title));
        contentEl.appendChild(titleEl);
      }
      if (p.message) {
        var msgEl = document.createElement("div");
        msgEl.className = "aup-toast-message";
        msgEl.textContent = _escapeHtml(String(p.message));
        contentEl.appendChild(msgEl);
      }
      if (node.children) {
        node.children.forEach(function(child) {
          var childEl = renderAupNode(child);
          if (childEl) contentEl.appendChild(childEl);
        });
      }
      body.appendChild(contentEl);

      // Close button (always present unless dismissible: false AND duration > 0)
      var dismissible = p.dismissible !== false && p.dismissible !== "false";
      var duration = p.duration !== undefined ? parseInt(String(p.duration)) : 5000;
      if (dismissible) {
        var closeBtn = document.createElement("button");
        closeBtn.className = "aup-toast-close";
        closeBtn.textContent = "\u2715";
        closeBtn.title = "Dismiss";
        closeBtn.onclick = function() {
          toast.classList.add("exiting");
          setTimeout(function() { el.classList.remove("open"); }, 250);
          _fireAupEvent(node.id, "dismiss", {});
        };
        body.appendChild(closeBtn);
      }
      toast.appendChild(body);

      // Timer bar (auto-dismiss)
      if (duration > 0 && s.open) {
        var timerTrack = document.createElement("div");
        timerTrack.className = "aup-toast-timer";
        var timerBar = document.createElement("div");
        timerBar.className = "aup-toast-timer-bar";
        timerBar.style.width = "100%";
        timerTrack.appendChild(timerBar);
        toast.appendChild(timerTrack);
        // Animate bar from 100% to 0%
        requestAnimationFrame(function() {
          timerBar.style.transitionDuration = duration + "ms";
          timerBar.style.width = "0%";
        });
        setTimeout(function() {
          toast.classList.add("exiting");
          setTimeout(function() { el.classList.remove("open"); }, 250);
        }, duration);
      }
      el.appendChild(toast);

    } else if (mode === "drawer") {
      var backdrop = document.createElement("div");
      backdrop.className = "aup-overlay-backdrop";
      el.appendChild(backdrop);
      var drawer = document.createElement("div");
      drawer.className = "aup-overlay-drawer " + (p.side === "left" ? "left" : "right");
      if (node.children) {
        node.children.forEach(function(child) {
          var childEl = renderAupNode(child);
          if (childEl) drawer.appendChild(childEl);
        });
      }
      el.appendChild(drawer);

    } else if (mode === "alert" || mode === "confirm") {
      var backdrop = document.createElement("div");
      backdrop.className = "aup-overlay-backdrop";
      el.appendChild(backdrop);
      var box = document.createElement("div");
      box.className = "aup-overlay-alert";
      var intent = p.intent || "info";
      // Icon
      if (p.icon !== false) {
        var icon = document.createElement("div");
        icon.className = "aup-alert-icon";
        icon.setAttribute("data-intent", intent);
        icon.textContent = p.icon || _intentIcons[intent] || _intentIcons.info;
        box.appendChild(icon);
      }
      if (p.title) {
        var t = document.createElement("div");
        t.className = "aup-alert-title";
        t.textContent = _escapeHtml(String(p.title));
        box.appendChild(t);
      }
      if (p.message) {
        var m = document.createElement("div");
        m.className = "aup-alert-message";
        m.textContent = _escapeHtml(String(p.message));
        box.appendChild(m);
      }
      // Children (optional extra content)
      if (node.children) {
        node.children.forEach(function(child) {
          var childEl = renderAupNode(child);
          if (childEl) box.appendChild(childEl);
        });
      }
      var acts = document.createElement("div");
      acts.className = "aup-alert-actions";
      if (mode === "confirm") {
        var cancelBtn = document.createElement("button");
        cancelBtn.className = "aup-alert-btn secondary";
        cancelBtn.textContent = p.cancelLabel || "Cancel";
        cancelBtn.onclick = function() {
          el.classList.remove("open");
          _fireAupEvent(node.id, "cancel", {});
        };
        acts.appendChild(cancelBtn);
      }
      var okBtn = document.createElement("button");
      okBtn.className = "aup-alert-btn " + (intent === "error" && mode === "confirm" ? "danger" : "primary");
      okBtn.textContent = p.confirmLabel || (mode === "confirm" ? "Confirm" : "OK");
      okBtn.onclick = function() {
        el.classList.remove("open");
        _fireAupEvent(node.id, "confirm", {});
      };
      acts.appendChild(okBtn);
      box.appendChild(acts);
      el.appendChild(box);

    } else if (mode === "hud") {
      var backdrop = document.createElement("div");
      backdrop.className = "aup-overlay-backdrop";
      backdrop.style.background = "rgba(0,0,0,0.3)";
      el.appendChild(backdrop);
      var hud = document.createElement("div");
      hud.className = "aup-overlay-hud";
      // Icon or spinner
      if (p.icon === "spinner" || !p.icon) {
        var spinner = document.createElement("div");
        spinner.className = "aup-hud-spinner";
        hud.appendChild(spinner);
      } else {
        var ic = document.createElement("div");
        ic.className = "aup-hud-icon";
        ic.textContent = p.icon;
        hud.appendChild(ic);
      }
      if (p.message) {
        var msg = document.createElement("div");
        msg.className = "aup-hud-message";
        msg.textContent = _escapeHtml(String(p.message));
        hud.appendChild(msg);
      }
      if (p.subtitle) {
        var sub = document.createElement("div");
        sub.className = "aup-hud-sub";
        sub.textContent = _escapeHtml(String(p.subtitle));
        hud.appendChild(sub);
      }
      if (typeof p.progress === "number") {
        var bar = document.createElement("div");
        bar.className = "aup-hud-progress";
        var fill = document.createElement("div");
        fill.className = "aup-hud-progress-bar";
        fill.style.width = Math.max(0, Math.min(100, p.progress)) + "%";
        bar.appendChild(fill);
        hud.appendChild(bar);
      }
      el.appendChild(hud);

    } else if (mode === "choice") {
      var backdrop = document.createElement("div");
      backdrop.className = "aup-overlay-backdrop";
      el.appendChild(backdrop);
      var box = document.createElement("div");
      box.className = "aup-overlay-choice";

      // Normalize steps: single-question → steps[0], multi-step → steps array
      var steps = Array.isArray(p.steps) ? p.steps : [p];
      var totalSteps = steps.length;
      var currentStep = 0;
      // Per-step answers: [ { selected: {idx: true}, other: "" }, ... ]
      var answers = steps.map(function() { return { selected: {}, other: "" }; });

      // Stepper dots (only for multi-step)
      var stepperEl = null;
      if (totalSteps > 1) {
        stepperEl = document.createElement("div");
        stepperEl.className = "aup-choice-stepper";
        box.appendChild(stepperEl);
      }

      // Content container (swapped per step)
      var bodyEl = document.createElement("div");
      bodyEl.className = "aup-choice-step-body";
      box.appendChild(bodyEl);

      // Footer
      var footer = document.createElement("div");
      footer.className = "aup-choice-footer";
      box.appendChild(footer);

      function renderStep(stepIdx) {
        var step = steps[stepIdx];
        var multi = !!step.multiSelect;
        var options = Array.isArray(step.options) ? step.options : [];
        var ans = answers[stepIdx];

        // Update stepper dots
        if (stepperEl) {
          stepperEl.innerHTML = "";
          for (var di = 0; di < totalSteps; di++) {
            var dot = document.createElement("div");
            dot.className = "aup-choice-dot" + (di === stepIdx ? " active" : di < stepIdx ? " done" : "");
            stepperEl.appendChild(dot);
          }
          var stepLabel = document.createElement("span");
          stepLabel.className = "aup-choice-step-label";
          stepLabel.textContent = (stepIdx + 1) + " / " + totalSteps;
          stepperEl.appendChild(stepLabel);
        }

        // Rebuild body
        bodyEl.innerHTML = "";
        bodyEl.className = "aup-choice-step-body";
        // Force re-trigger animation
        void bodyEl.offsetWidth;
        bodyEl.className = "aup-choice-step-body";

        // Header
        var hdr = document.createElement("div");
        hdr.className = "aup-choice-header";
        if (step.header) {
          var tag = document.createElement("span");
          tag.className = "aup-choice-tag";
          tag.textContent = _escapeHtml(String(step.header));
          hdr.appendChild(tag);
        }
        if (step.question || step.title) {
          var q = document.createElement("div");
          q.className = "aup-choice-question";
          q.textContent = _escapeHtml(String(step.question || step.title));
          hdr.appendChild(q);
        }
        if (step.hint) {
          var h = document.createElement("div");
          h.className = "aup-choice-hint";
          h.textContent = _escapeHtml(String(step.hint));
          hdr.appendChild(h);
        }
        bodyEl.appendChild(hdr);

        // Options
        var optionsDiv = document.createElement("div");
        optionsDiv.className = "aup-choice-options";
        options.forEach(function(opt, idx) {
          var btn = document.createElement("button");
          btn.className = "aup-choice-option" + (ans.selected[idx] ? " selected" : "");
          var indicator = document.createElement("div");
          indicator.className = multi ? "aup-choice-check" : "aup-choice-radio";
          btn.appendChild(indicator);
          var content = document.createElement("div");
          var lbl = document.createElement("div");
          lbl.className = "aup-choice-label";
          lbl.textContent = _escapeHtml(String(opt.label || opt));
          content.appendChild(lbl);
          if (opt.description) {
            var desc = document.createElement("div");
            desc.className = "aup-choice-desc";
            desc.textContent = _escapeHtml(String(opt.description));
            content.appendChild(desc);
          }
          btn.appendChild(content);
          btn.onclick = function() {
            if (multi) {
              ans.selected[idx] = !ans.selected[idx];
              btn.classList.toggle("selected", !!ans.selected[idx]);
            } else {
              ans.selected = {};
              ans.selected[idx] = true;
              optionsDiv.querySelectorAll(".aup-choice-option").forEach(function(b) { b.classList.remove("selected"); });
              btn.classList.add("selected");
            }
          };
          optionsDiv.appendChild(btn);
        });
        bodyEl.appendChild(optionsDiv);

        // "Other" free text
        if (step.allowOther !== false) {
          var otherDiv = document.createElement("div");
          otherDiv.className = "aup-choice-other";
          var otherInput = document.createElement("input");
          otherInput.placeholder = step.otherPlaceholder || "Other...";
          otherInput.value = ans.other || "";
          otherInput.oninput = function() { ans.other = otherInput.value; };
          otherDiv.appendChild(otherInput);
          bodyEl.appendChild(otherDiv);
        }

        // Footer
        footer.innerHTML = "";
        if (p.cancelLabel !== false) {
          var cancelBtn = document.createElement("button");
          cancelBtn.className = "aup-alert-btn secondary";
          cancelBtn.textContent = p.cancelLabel || "Skip";
          cancelBtn.onclick = function() {
            el.classList.remove("open");
            _fireAupEvent(node.id, "cancel", {});
          };
          footer.appendChild(cancelBtn);
        }
        // Spacer pushes nav buttons to right
        var spacer = document.createElement("div");
        spacer.className = "spacer";
        footer.appendChild(spacer);
        // Back button (step > 0)
        if (stepIdx > 0) {
          var backBtn = document.createElement("button");
          backBtn.className = "aup-alert-btn secondary";
          backBtn.textContent = "Back";
          backBtn.onclick = function() { currentStep--; renderStep(currentStep); };
          footer.appendChild(backBtn);
        }
        // Next or Submit
        var isLast = stepIdx === totalSteps - 1;
        var nextBtn = document.createElement("button");
        nextBtn.className = "aup-alert-btn primary";
        nextBtn.textContent = isLast ? (p.submitLabel || "Submit") : "Next";
        nextBtn.onclick = function() {
          if (!isLast) {
            currentStep++;
            renderStep(currentStep);
          } else {
            // Collect all answers
            var result = answers.map(function(a, si) {
              var stepOpts = Array.isArray(steps[si].options) ? steps[si].options : [];
              var picks = [];
              stepOpts.forEach(function(opt, idx) {
                if (a.selected[idx]) picks.push(opt.value || opt.label || opt);
              });
              return { selected: picks, other: a.other || null };
            });
            el.classList.remove("open");
            // Single-step: send flat result, multi-step: send answers array
            var data = totalSteps === 1 ? result[0] : { answers: result };
            _fireAupEvent(node.id, "select", data);
          }
        };
        footer.appendChild(nextBtn);
      }

      // Multi-step: measure all steps offscreen, lock body to tallest
      if (totalSteps > 1) {
        // Render into a hidden clone to measure without flicker
        var measurer = document.createElement("div");
        measurer.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0;";
        measurer.className = "aup-overlay-choice";
        document.body.appendChild(measurer);
        var measureBody = document.createElement("div");
        measureBody.className = "aup-choice-step-body";
        measurer.appendChild(measureBody);
        var maxH = 0;
        for (var si = 0; si < totalSteps; si++) {
          var mStep = steps[si];
          measureBody.innerHTML = "";
          // Header
          var mHdr = document.createElement("div");
          mHdr.className = "aup-choice-header";
          if (mStep.header) { var mt = document.createElement("span"); mt.className = "aup-choice-tag"; mt.textContent = String(mStep.header); mHdr.appendChild(mt); }
          if (mStep.question || mStep.title) { var mq = document.createElement("div"); mq.className = "aup-choice-question"; mq.textContent = String(mStep.question || mStep.title); mHdr.appendChild(mq); }
          if (mStep.hint) { var mh = document.createElement("div"); mh.className = "aup-choice-hint"; mh.textContent = String(mStep.hint); mHdr.appendChild(mh); }
          measureBody.appendChild(mHdr);
          // Options
          var mOpts = document.createElement("div"); mOpts.className = "aup-choice-options";
          (Array.isArray(mStep.options) ? mStep.options : []).forEach(function(opt) {
            var mb = document.createElement("button"); mb.className = "aup-choice-option";
            var mi = document.createElement("div"); mi.className = "aup-choice-radio"; mb.appendChild(mi);
            var mc = document.createElement("div");
            var ml = document.createElement("div"); ml.className = "aup-choice-label"; ml.textContent = String(opt.label || opt); mc.appendChild(ml);
            if (opt.description) { var md = document.createElement("div"); md.className = "aup-choice-desc"; md.textContent = String(opt.description); mc.appendChild(md); }
            mb.appendChild(mc); mOpts.appendChild(mb);
          });
          measureBody.appendChild(mOpts);
          // Other
          if (mStep.allowOther !== false) { var mo = document.createElement("div"); mo.className = "aup-choice-other"; var moI = document.createElement("input"); mo.appendChild(moI); measureBody.appendChild(mo); }
          var h = measureBody.offsetHeight;
          if (h > maxH) maxH = h;
        }
        document.body.removeChild(measurer);
        bodyEl.style.minHeight = maxH + "px";
      }
      renderStep(0);
      el.appendChild(box);

    } else if (mode === "popover") {
      var popover = document.createElement("div");
      popover.className = "aup-overlay-popover";
      if (node.children) {
        node.children.forEach(function(child) {
          var childEl = renderAupNode(child);
          if (childEl) popover.appendChild(childEl);
        });
      }
      el.appendChild(popover);
      // Position relative to anchor after DOM insertion
      if (s.open && p.anchor) {
        requestAnimationFrame(function() {
          var anchor = document.querySelector('[data-aup-id="' + p.anchor + '"]');
          if (!anchor) return;
          var r = anchor.getBoundingClientRect();
          var pos = p.position || "bottom";
          popover.style.position = "fixed";
          popover.style.zIndex = "9999";
          if (pos === "bottom" || pos === "bottom-start") {
            popover.style.left = r.left + "px";
            popover.style.top = (r.bottom + 4) + "px";
          } else if (pos === "top" || pos === "top-start") {
            popover.style.left = r.left + "px";
            popover.style.bottom = (window.innerHeight - r.top + 4) + "px";
          } else if (pos === "right") {
            popover.style.left = (r.right + 4) + "px";
            popover.style.top = r.top + "px";
          } else if (pos === "left") {
            popover.style.right = (window.innerWidth - r.left + 4) + "px";
            popover.style.top = r.top + "px";
          } else {
            popover.style.left = r.left + "px";
            popover.style.top = (r.bottom + 4) + "px";
          }
        });
      }
      // Light dismiss: click outside or Escape
      if (s.open) {
        var _popDismiss = function(e) {
          if (!popover.contains(e.target)) {
            el.classList.remove("open");
            document.removeEventListener("mousedown", _popDismiss);
            document.removeEventListener("keydown", _popEsc);
            _fireAupEvent(node.id, "dismiss", {});
          }
        };
        var _popEsc = function(e) {
          if (e.key === "Escape") {
            el.classList.remove("open");
            document.removeEventListener("mousedown", _popDismiss);
            document.removeEventListener("keydown", _popEsc);
            _fireAupEvent(node.id, "dismiss", {});
          }
        };
        setTimeout(function() {
          document.addEventListener("mousedown", _popDismiss);
          document.addEventListener("keydown", _popEsc);
        }, 0);
      }

    } else {
      // dialog (default)
      var backdrop = document.createElement("div");
      backdrop.className = "aup-overlay-backdrop";
      backdrop.onclick = function() {
        el.classList.remove("open");
        _fireAupEvent(node.id, "dismiss", {});
      };
      el.appendChild(backdrop);
      var dialog = document.createElement("div");
      dialog.className = "aup-overlay-dialog";
      // Title bar with close button
      if (p.title) {
        var titleBar = document.createElement("div");
        titleBar.className = "aup-overlay-dialog-title";
        var titleText = document.createElement("span");
        titleText.textContent = _escapeHtml(String(p.title));
        titleBar.appendChild(titleText);
        var closeBtn = document.createElement("button");
        closeBtn.className = "aup-overlay-close";
        closeBtn.textContent = "\u2715";
        closeBtn.title = "Close";
        closeBtn.onclick = function() {
          el.classList.remove("open");
          _fireAupEvent(node.id, "dismiss", {});
        };
        titleBar.appendChild(closeBtn);
        dialog.appendChild(titleBar);
      }
      if (node.children) {
        node.children.forEach(function(child) {
          var childEl = renderAupNode(child);
          if (childEl) dialog.appendChild(childEl);
        });
      }
      el.appendChild(dialog);
    }
    return el;
  }

`;
