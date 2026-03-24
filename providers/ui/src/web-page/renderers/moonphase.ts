export const MOONPHASE_JS = `
  // ── Moon Phase Primitive (Pure JS, zero deps) ──
  function renderAupMoonPhase(node) {
    var el = document.createElement("div");
    el.className = "aup-moonphase";
    var p = node.props || {};
    var mode = p.mode || "today"; // "today" | "month"
    var targetDate = p.date ? new Date(p.date) : new Date();

    // ── Moon phase calculation (inline, no library needed) ──
    var SYNODIC = 29.53058770576;
    var START_JDN = 2451550.1;
    var BOUNDS = { WXC: 1, FQ: 6.382647, WXG: 8.382647, FM: 13.765294, WNG: 15.765294, LQ: 21.147941, WNC: 23.147941, NMU: 28.530588, NMUE: 29.530588 };
    var PHASE_NAMES = ["New Moon","Waxing Crescent","First Quarter","Waxing Gibbous","Full Moon","Waning Gibbous","Last Quarter","Waning Crescent"];
    var PHASE_EMOJI = ["\\u{1F311}","\\u{1F312}","\\u{1F313}","\\u{1F314}","\\u{1F315}","\\u{1F316}","\\u{1F317}","\\u{1F318}"];

    function _toJDN(d) {
      var day = d.getUTCDate(), mo = d.getUTCMonth() + 1, yr = d.getFullYear();
      var a = Math.trunc((14 - mo) / 12), y = yr + 4800 - a, m = mo + 12 * a - 3;
      return day + Math.trunc((153 * m + 2) / 5) + 365 * y + Math.trunc(y / 4) - Math.trunc(y / 100) + Math.trunc(y / 400) - 32045;
    }
    function _lunarDay(d) {
      var raw = (_toJDN(d) - START_JDN) / SYNODIC;
      var frac = raw - Math.floor(raw);
      return (frac < 0 ? frac + 1 : frac) * SYNODIC;
    }
    function _phaseIndex(ld) {
      if (ld < BOUNDS.WXC) return 0;
      if (ld < BOUNDS.FQ) return 1;
      if (ld < BOUNDS.WXG) return 2;
      if (ld < BOUNDS.FM) return 3;
      if (ld < BOUNDS.WNG) return 4;
      if (ld < BOUNDS.LQ) return 5;
      if (ld < BOUNDS.WNC) return 6;
      if (ld < BOUNDS.NMU) return 7;
      return 0;
    }
    function _illumination(ld) { return (1 - Math.cos((ld / SYNODIC) * 2 * Math.PI)) / 2; }

    var ld = _lunarDay(targetDate);
    var pi = _phaseIndex(ld);
    var illum = _illumination(ld);

    // Visual moon emoji
    var visual = document.createElement("div");
    visual.className = "aup-moonphase-visual";
    visual.textContent = PHASE_EMOJI[pi];
    el.appendChild(visual);

    // Phase name
    var name = document.createElement("div");
    name.className = "aup-moonphase-name";
    name.textContent = PHASE_NAMES[pi];
    el.appendChild(name);

    // Details
    var details = document.createElement("div");
    details.className = "aup-moonphase-details";
    details.innerHTML = "<span>Day " + ld.toFixed(1) + " / " + SYNODIC.toFixed(1) + "</span>"
      + "<span>Illumination: " + (illum * 100).toFixed(1) + "%</span>"
      + "<span>" + targetDate.toLocaleDateString(p.locale || undefined, { year: "numeric", month: "long", day: "numeric" }) + "</span>";
    el.appendChild(details);

    // Month view
    if (mode === "month") {
      var grid = document.createElement("div");
      grid.className = "aup-moonphase-month";
      var yr = targetDate.getFullYear(), mo = targetDate.getMonth();
      var daysInMonth = new Date(yr, mo + 1, 0).getDate();
      var todayStr = new Date().toISOString().slice(0, 10);
      for (var day = 1; day <= daysInMonth; day++) {
        var d = new Date(yr, mo, day);
        var dld = _lunarDay(d);
        var dpi = _phaseIndex(dld);
        var cell = document.createElement("div");
        cell.className = "aup-moonphase-month-day";
        if (d.toISOString().slice(0, 10) === todayStr) cell.classList.add("today");
        cell.innerHTML = "<span class='moon-emoji'>" + PHASE_EMOJI[dpi] + "</span><span>" + day + "</span>";
        grid.appendChild(cell);
      }
      el.appendChild(grid);
    }

    // src binding
    if (p.src && window.afs) {
      window.afs.read(p.src).then(function(result) {
        if (result && result.content) {
          var newDate = new Date(result.content.date || result.content);
          var nld = _lunarDay(newDate);
          var npi = _phaseIndex(nld);
          visual.textContent = PHASE_EMOJI[npi];
          name.textContent = PHASE_NAMES[npi];
        }
      }).catch(function() {});
    }

    return el;
  }

`;
