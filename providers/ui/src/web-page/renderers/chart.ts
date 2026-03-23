export const CHART_JS = `
  // ── Chart Primitive (Chart.js v4) ──
  function renderAupChart(node) {
    var el = document.createElement("div");
    el.className = "aup-chart";
    var p = node.props || {};
    var variant = p.variant || "line";
    if (p.height) el.style.height = p.height;
    var canvas = document.createElement("canvas");
    el.appendChild(canvas);

    var chartData = Array.isArray(p.data)
      ? { labels: p.labels || [], datasets: [{ label: p.label || "", data: p.data }] }
      : p.data || { labels: p.labels || [], datasets: p.datasets || [] };
    var chartInstance = null;

    function chartType() {
      return variant === "area" ? "line" : variant === "histogram" ? "bar" : variant === "gauge" ? "doughnut" : variant;
    }

    function chartOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        fill: variant === "area",
        animation: chartInstance ? { duration: 400 } : undefined,
        plugins: { legend: { labels: { color: getComputedStyle(el).color } } },
        scales: variant === "pie" || variant === "doughnut" || variant === "gauge" ? {} : {
          x: { ticks: { color: getComputedStyle(el).color } },
          y: { ticks: { color: getComputedStyle(el).color } }
        }
      };
    }

    function initChart() {
      if (typeof Chart === "undefined") {
        var loading = document.createElement("div");
        loading.className = "aup-chart-loading";
        loading.textContent = "Loading chart...";
        el.insertBefore(loading, canvas);
        loadScript("https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js", function() {
          if (loading.parentNode) loading.parentNode.removeChild(loading);
          createChart(chartData);
        });
      } else {
        createChart(chartData);
      }
    }

    function createChart(data) {
      try {
        chartInstance = new Chart(canvas, {
          type: chartType(),
          data: data,
          options: chartOptions()
        });
      } catch(e) { canvas.parentNode.textContent = "Chart error: " + e.message; }
    }

    function updateChart(data) {
      if (!chartInstance) { createChart(data); return; }
      chartInstance.data = data;
      chartInstance.update();
    }

    // src binding: read data from AFS path, subscribe for live updates
    if (node.src && window.afs) {
      var loading = document.createElement("div");
      loading.className = "aup-chart-loading";
      loading.textContent = "Loading data...";
      el.insertBefore(loading, canvas);

      function applyAfsData(raw) {
        var d = (typeof raw === "object" && raw !== null) ? raw : {};
        // Support both { labels, datasets } and { content: { labels, datasets } }
        if (d.content && typeof d.content === "object") d = d.content;
        var resolved = { labels: d.labels || [], datasets: d.datasets || [] };
        if (loading.parentNode) loading.parentNode.removeChild(loading);
        updateChart(resolved);
      }

      function ensureChartLoaded(cb) {
        if (typeof Chart !== "undefined") { cb(); return; }
        loadScript("https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js", cb);
      }

      // Initial read
      window.afs.read(node.src).then(function(raw) {
        ensureChartLoaded(function() { applyAfsData(raw); });
      }).catch(function(e) {
        loading.textContent = "Data error: " + e.message;
      });

      // Subscribe for live updates
      window.afs.subscribe({ type: "afs:write", path: node.src }, function(event) {
        if (event && event.data) applyAfsData(event.data);
      });
    } else {
      setTimeout(initChart, 0);
    }

    return el;
  }

`;
