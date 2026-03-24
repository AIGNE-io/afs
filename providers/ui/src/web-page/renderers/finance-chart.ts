export const FINANCE_CHART_JS = `
  // ── Finance Chart Primitive (TradingView Lightweight Charts v5) ──

  function renderAupFinanceChart(node) {
    var el = document.createElement("div");
    el.className = "aup-finance-chart";
    var p = node.props || {};
    var variant = p.variant || "candlestick";
    if (p.height) el.style.height = p.height;
    else el.style.height = "400px";

    var chartDiv = document.createElement("div");
    chartDiv.style.width = "100%";
    chartDiv.style.height = "100%";
    el.appendChild(chartDiv);

    function isDarkMode() {
      var bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
      if (!bg) return true;
      // Simple heuristic: dark if bg starts with # and first hex digit < 8
      if (bg.charAt(0) === "#") {
        var r = parseInt(bg.substring(1, 3), 16);
        return r < 128;
      }
      return true;
    }

    function chartColors() {
      var dark = isDarkMode();
      return {
        bg: "transparent",
        text: dark ? "#d1d5db" : "#374151",
        grid: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
        crosshair: dark ? "#6b7280" : "#9ca3af",
        upColor: p.upColor || "#26a69a",
        downColor: p.downColor || "#ef5350",
        lineColor: p.lineColor || "#2962FF",
        areaTop: p.areaTopColor || "rgba(41,98,255,0.4)",
        areaBottom: p.areaBottomColor || "rgba(41,98,255,0)",
      };
    }

    function initFinanceChart() {
      if (typeof LightweightCharts === "undefined") {
        var loading = document.createElement("div");
        loading.className = "aup-finance-chart-loading";
        loading.textContent = "Loading chart...";
        el.insertBefore(loading, chartDiv);
        loadScript("https://cdn.jsdelivr.net/npm/lightweight-charts@5/dist/lightweight-charts.standalone.production.js", function() {
          if (loading.parentNode) loading.parentNode.removeChild(loading);
          createFinanceChart();
        });
      } else {
        createFinanceChart();
      }
    }

    var chartInstance = null;
    var primarySeries = null;
    var volumeSeries = null;

    function createFinanceChart() {
      try {
        var c = chartColors();
        chartInstance = LightweightCharts.createChart(chartDiv, {
          layout: { background: { type: "solid", color: c.bg }, textColor: c.text, fontFamily: "inherit" },
          grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
          crosshair: { vertLine: { color: c.crosshair, labelBackgroundColor: c.crosshair }, horzLine: { color: c.crosshair, labelBackgroundColor: c.crosshair } },
          rightPriceScale: { borderColor: c.grid },
          timeScale: { borderColor: c.grid, timeVisible: true },
          autoSize: true,
        });

        // Add primary series based on variant
        if (variant === "candlestick") {
          primarySeries = chartInstance.addSeries(LightweightCharts.CandlestickSeries, {
            upColor: c.upColor, downColor: c.downColor, borderVisible: false,
            wickUpColor: c.upColor, wickDownColor: c.downColor,
          });
        } else if (variant === "ohlc") {
          primarySeries = chartInstance.addSeries(LightweightCharts.BarSeries, {
            upColor: c.upColor, downColor: c.downColor,
          });
        } else if (variant === "trading-line") {
          primarySeries = chartInstance.addSeries(LightweightCharts.LineSeries, {
            color: c.lineColor, lineWidth: 2,
          });
        } else if (variant === "trading-area") {
          primarySeries = chartInstance.addSeries(LightweightCharts.AreaSeries, {
            lineColor: c.lineColor, topColor: c.areaTop, bottomColor: c.areaBottom, lineWidth: 2,
          });
        } else if (variant === "baseline") {
          var bv = p.baseValue || 0;
          primarySeries = chartInstance.addSeries(LightweightCharts.BaselineSeries, {
            baseValue: { type: "price", price: bv },
            topLineColor: c.upColor, topFillColor1: "rgba(38,166,154,0.28)", topFillColor2: "rgba(38,166,154,0)",
            bottomLineColor: c.downColor, bottomFillColor1: "rgba(239,83,80,0)", bottomFillColor2: "rgba(239,83,80,0.28)",
          });
        } else if (variant === "volume") {
          primarySeries = chartInstance.addSeries(LightweightCharts.HistogramSeries, {
            priceFormat: { type: "volume" },
            priceScaleId: "",
          });
        }

        // Optional volume overlay (for candlestick/ohlc)
        if (p.volumeData || p.showVolume) {
          volumeSeries = chartInstance.addSeries(LightweightCharts.HistogramSeries, {
            priceFormat: { type: "volume" },
            priceScaleId: "volume",
          });
          chartInstance.priceScale("volume").applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
        }

        // Set data
        var data = p.data || [];
        if (data.length) {
          primarySeries.setData(data);
          if (volumeSeries && p.volumeData) volumeSeries.setData(p.volumeData);
          chartInstance.timeScale().fitContent();
        }
      } catch(e) {
        chartDiv.textContent = "Chart error: " + e.message;
      }
    }

    function updateFinanceData(raw) {
      var d = (typeof raw === "object" && raw !== null) ? raw : {};
      if (d.content && typeof d.content === "object") d = d.content;
      if (primarySeries && d.data) {
        primarySeries.setData(d.data);
        if (volumeSeries && d.volumeData) volumeSeries.setData(d.volumeData);
        if (chartInstance) chartInstance.timeScale().fitContent();
      }
    }

    // src binding
    if (node.src && window.afs) {
      var loading = document.createElement("div");
      loading.className = "aup-finance-chart-loading";
      loading.textContent = "Loading data...";
      el.insertBefore(loading, chartDiv);

      function applyFinanceData(raw) {
        if (loading.parentNode) loading.parentNode.removeChild(loading);
        if (!chartInstance) {
          // Chart not created yet — store data and init
          var d = (typeof raw === "object" && raw !== null) ? raw : {};
          if (d.content && typeof d.content === "object") d = d.content;
          if (d.data) p.data = d.data;
          if (d.volumeData) { p.volumeData = d.volumeData; p.showVolume = true; }
          initFinanceChart();
        } else {
          updateFinanceData(raw);
        }
      }

      window.afs.read(node.src).then(applyFinanceData).catch(function(e) {
        loading.textContent = "Data error: " + e.message;
      });
      window.afs.subscribe({ type: "afs:write", path: node.src }, function(event) {
        if (event && event.data) applyFinanceData(event.data);
      });
    } else {
      setTimeout(initFinanceChart, 0);
    }

    return el;
  }

`;
