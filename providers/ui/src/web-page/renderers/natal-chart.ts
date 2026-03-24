export const NATAL_CHART_JS = `
  // ── Natal Chart Primitive (@astrodraw/astrochart v3) ──
  var _astroChartLoaded = false;

  function _setNatalStatus(el, message) {
    el.innerHTML = "";
    var status = document.createElement("div");
    status.className = "aup-natal-chart-loading";
    status.textContent = message;
    el.appendChild(status);
  }

  function _appendCell(row, value, strong) {
    var td = document.createElement("td");
    if (strong) {
      var bold = document.createElement("strong");
      bold.textContent = value;
      td.appendChild(bold);
    } else {
      td.textContent = value;
    }
    row.appendChild(td);
  }

  function _appendHead(table, headers) {
    var thead = document.createElement("thead");
    var tr = document.createElement("tr");
    for (var i = 0; i < headers.length; i++) {
      var th = document.createElement("th");
      th.textContent = headers[i];
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);
  }

  function renderAupNatalChart(node) {
    var el = document.createElement("div");
    el.className = "aup-natal-chart";
    var p = node.props || {};
    var variant = p.variant || "radix"; // "radix" | "transit" | "aspects-table" | "planets-table"
    var height = p.height || "500px";
    var width = parseInt(p.width) || 500;
    var chartSize = parseInt(p.size) || Math.min(width, 500);

    // Data format: { planets: {"Sun":[degrees], "Moon":[degrees], ...}, cusps: [12 house cusps] }
    var data = p.data || null;

    // ── Aspects / Planets table mode (no chart rendering, calculation only) ──
    if (variant === "aspects-table" || variant === "planets-table") {
      if (!data || !data.planets) {
        _setNatalStatus(el, "No chart data provided");
        return el;
      }

      if (variant === "planets-table") {
        var planetsDiv = document.createElement("div");
        planetsDiv.className = "aup-natal-planets";
        var tbl = document.createElement("table");
        _appendHead(tbl, ["Planet", "Longitude", "Sign", "Degree in Sign"]);
        var tbody = document.createElement("tbody");
        var SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
        for (var planet in data.planets) {
          if (data.planets.hasOwnProperty(planet)) {
            var deg = Number(data.planets[planet] && data.planets[planet][0]);
            if (!isFinite(deg)) continue;
            var signIdx = Math.floor(deg / 30) % 12;
            if (signIdx < 0) signIdx += 12;
            var degInSign = ((deg % 30) + 30) % 30;
            var row = document.createElement("tr");
            _appendCell(row, String(planet), true);
            _appendCell(row, deg.toFixed(2) + "\\u00B0");
            _appendCell(row, SIGNS[signIdx]);
            _appendCell(row, degInSign.toFixed(2) + "\\u00B0");
            tbody.appendChild(row);
          }
        }
        tbl.appendChild(tbody);
        planetsDiv.appendChild(tbl);
        el.appendChild(planetsDiv);
      }

      if (variant === "aspects-table") {
        // Inline aspect calculation (no library needed — port of AspectCalculator core logic)
        var ASPECTS_DEF = { conjunction: { degree: 0, orbit: 10 }, square: { degree: 90, orbit: 8 }, trine: { degree: 120, orbit: 8 }, opposition: { degree: 180, orbit: 10 }, sextile: { degree: 60, orbit: 6 } };
        var aspectsList = [];
        var planetNames = Object.keys(data.planets);
        for (var i = 0; i < planetNames.length; i++) {
          for (var j = i + 1; j < planetNames.length; j++) {
            var pA = planetNames[i], pB = planetNames[j];
            var degA = Number(data.planets[pA] && data.planets[pA][0]);
            var degB = Number(data.planets[pB] && data.planets[pB][0]);
            if (!isFinite(degA) || !isFinite(degB)) continue;
            var gap = Math.abs(degA - degB);
            if (gap > 180) gap = 360 - gap;
            for (var aspName in ASPECTS_DEF) {
              var asp = ASPECTS_DEF[aspName];
              var orbitMin = asp.degree - asp.orbit / 2, orbitMax = asp.degree + asp.orbit / 2;
              if (gap >= orbitMin && gap <= orbitMax) {
                var precisionNum = Math.abs(gap - asp.degree);
                aspectsList.push({
                  from: pA,
                  to: pB,
                  aspect: aspName,
                  precision: precisionNum.toFixed(2),
                  precisionNum: precisionNum,
                });
              }
            }
          }
        }
        aspectsList.sort(function(a, b) { return a.precisionNum - b.precisionNum; });

        var aspDiv = document.createElement("div");
        aspDiv.className = "aup-natal-aspects";
        var aspTbl = document.createElement("table");
        _appendHead(aspTbl, ["Planet", "Aspect", "Planet", "Orb"]);
        var aspBody = document.createElement("tbody");
        for (var k = 0; k < aspectsList.length; k++) {
          var a = aspectsList[k];
          var aspRow = document.createElement("tr");
          _appendCell(aspRow, String(a.from));
          _appendCell(aspRow, String(a.aspect), true);
          _appendCell(aspRow, String(a.to));
          _appendCell(aspRow, String(a.precision) + "\\u00B0");
          aspBody.appendChild(aspRow);
        }
        aspTbl.appendChild(aspBody);
        aspDiv.appendChild(aspTbl);
        el.appendChild(aspDiv);
      }

      return el;
    }

    // ── SVG Chart mode — lazy-load @astrodraw/astrochart from CDN ──
    el.style.minHeight = height;
    _setNatalStatus(el, "Loading natal chart...");

    if (!data || !data.planets || !data.cusps) {
      _setNatalStatus(
        el,
        "No chart data provided. Expected: { planets: {Sun: [deg], ...}, cusps: [12 values] }",
      );
      return el;
    }

    var CDN_URL = "https://cdn.jsdelivr.net/npm/@astrodraw/astrochart@3.0.2/dist/astrochart.js";

    function _initChart() {
      el.innerHTML = "";
      var chartContainerId = "aup-natal-" + (node.id || Math.random().toString(36).slice(2));
      var container = document.createElement("div");
      container.id = chartContainerId;
      container.style.cssText = "display: flex; justify-content: center;";
      el.appendChild(container);

      // Detect dark mode
      var bgHex = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
      var isDark = false;
      if (bgHex && bgHex.charAt(0) === "#") {
        var r = parseInt(bgHex.slice(1, 3), 16) || 0;
        var g = parseInt(bgHex.slice(3, 5), 16) || 0;
        var b = parseInt(bgHex.slice(5, 7), 16) || 0;
        isDark = (r + g + b) / 3 < 128;
      }

      var chartSettings = {
        COLOR_BACKGROUND: "transparent",
        POINTS_COLOR: isDark ? "#e2e8f0" : "#1e293b",
        SIGNS_COLOR: isDark ? "#cbd5e1" : "#334155",
        CIRCLE_COLOR: isDark ? "#475569" : "#94a3b8",
        LINE_COLOR: isDark ? "#475569" : "#94a3b8",
        CUSPS_FONT_COLOR: isDark ? "#94a3b8" : "#64748b",
        SYMBOL_AXIS_FONT_COLOR: isDark ? "#e2e8f0" : "#1e293b",
      };
      if (p.settings) {
        for (var sk in p.settings) {
          if (p.settings.hasOwnProperty(sk)) chartSettings[sk] = p.settings[sk];
        }
      }

      try {
        var astroLib = window.astrochart;
        if (!astroLib || !astroLib.Chart) {
          _setNatalStatus(el, "AstroChart library not loaded");
          return;
        }
        var chart = new astroLib.Chart(chartContainerId, chartSize, chartSize, chartSettings);
        var radix = chart.radix(data);
        radix.aspects();

        // Transit overlay
        if (variant === "transit" && p.transitData) {
          var transit = radix.transit(p.transitData);
          transit.aspects();
        }
      } catch (err) {
        var errMsg = err && err.message ? err.message : String(err);
        _setNatalStatus(el, "Chart error: " + errMsg);
      }
    }

    if (_astroChartLoaded || window.astrochart) {
      _astroChartLoaded = true;
      setTimeout(_initChart, 0);
    } else {
      loadScript(CDN_URL, function() {
        _astroChartLoaded = true;
        _initChart();
      });
    }

    return el;
  }

`;
