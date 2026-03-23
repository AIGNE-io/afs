export const CALENDAR_JS = `
  // ── Calendar Primitive (Pure CSS/JS) ──
  function renderAupCalendar(node) {
    var el = document.createElement("div");
    el.className = "aup-calendar";
    var p = node.props || {};
    var mode = p.mode || "month";
    var events = p.events || [];
    var currentDate = new Date();

    if (mode === "month" || mode === "week" || mode === "day") {
      renderMonthView();
    } else if (mode === "agenda") {
      renderAgendaView();
    }

    function renderMonthView() {
      el.innerHTML = "";
      var header = document.createElement("div");
      header.className = "aup-calendar-header";
      var prevBtn = document.createElement("button");
      prevBtn.textContent = "\\u25C0";
      prevBtn.onclick = function() { currentDate.setMonth(currentDate.getMonth() - 1); renderMonthView(); };
      var nextBtn = document.createElement("button");
      nextBtn.textContent = "\\u25B6";
      nextBtn.onclick = function() { currentDate.setMonth(currentDate.getMonth() + 1); renderMonthView(); };
      var title = document.createElement("span");
      title.className = "aup-calendar-title";
      title.textContent = currentDate.toLocaleDateString(p.locale || undefined, { year: "numeric", month: "long" });
      header.appendChild(prevBtn);
      header.appendChild(title);
      header.appendChild(nextBtn);
      el.appendChild(header);

      var grid = document.createElement("div");
      grid.className = "aup-calendar-grid";

      var dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      for (var d = 0; d < 7; d++) {
        var dh = document.createElement("div");
        dh.className = "aup-calendar-day-header";
        dh.textContent = dayNames[d];
        grid.appendChild(dh);
      }

      var year = currentDate.getFullYear();
      var month = currentDate.getMonth();
      var firstDay = new Date(year, month, 1).getDay();
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var today = new Date();

      // Previous month padding
      var prevMonthDays = new Date(year, month, 0).getDate();
      for (var i = firstDay - 1; i >= 0; i--) {
        var dayEl = document.createElement("div");
        dayEl.className = "aup-calendar-day other-month";
        dayEl.textContent = String(prevMonthDays - i);
        grid.appendChild(dayEl);
      }

      // Current month days
      for (var day = 1; day <= daysInMonth; day++) {
        var dayEl = document.createElement("div");
        dayEl.className = "aup-calendar-day";
        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
          dayEl.classList.add("today");
        }
        dayEl.textContent = String(day);

        // Events on this day
        var dateStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
        for (var e = 0; e < events.length; e++) {
          if (events[e].date === dateStr) {
            var evtEl = document.createElement("span");
            evtEl.className = "aup-calendar-event";
            evtEl.setAttribute("data-intent", events[e].intent || "info");
            evtEl.textContent = _escapeHtml(String(events[e].label || ""));
            dayEl.appendChild(evtEl);
          }
        }
        grid.appendChild(dayEl);
      }

      // Next month padding
      var totalCells = firstDay + daysInMonth;
      var remaining = (7 - (totalCells % 7)) % 7;
      for (var i = 1; i <= remaining; i++) {
        var dayEl = document.createElement("div");
        dayEl.className = "aup-calendar-day other-month";
        dayEl.textContent = String(i);
        grid.appendChild(dayEl);
      }

      el.appendChild(grid);
    }

    function renderAgendaView() {
      el.innerHTML = "";
      var header = document.createElement("div");
      header.className = "aup-calendar-header";
      var title = document.createElement("span");
      title.className = "aup-calendar-title";
      title.textContent = "Agenda";
      header.appendChild(title);
      el.appendChild(header);

      var sorted = events.slice().sort(function(a, b) { return (a.date || "").localeCompare(b.date || ""); });
      if (sorted.length === 0) {
        var empty = document.createElement("div");
        empty.style.cssText = "color: var(--color-dim); text-align: center; padding: 20px;";
        empty.textContent = "No events";
        el.appendChild(empty);
      } else {
        for (var i = 0; i < sorted.length; i++) {
          var item = document.createElement("div");
          item.style.cssText = "display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--color-border);";
          var date = document.createElement("span");
          date.style.cssText = "font-size: 0.8em; color: var(--color-dim); min-width: 80px;";
          date.textContent = sorted[i].date || "";
          var label = document.createElement("span");
          label.textContent = _escapeHtml(String(sorted[i].label || ""));
          item.appendChild(date);
          item.appendChild(label);
          el.appendChild(item);
        }
      }
    }

    return el;
  }

`;
