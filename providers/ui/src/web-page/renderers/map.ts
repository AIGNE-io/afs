export const MAP_JS = `
  // ── Map Primitive (Leaflet v1) ──
  // ── Map tile style presets ──
  var _mapTileStyles = {
    "carto-light": { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attr: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>' },
    "carto-dark": { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attr: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>' },
    "carto-voyager": { url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", attr: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>' },
    "osm": { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>' },
    "stamen-toner": { url: "https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png", attr: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://stadiamaps.com">Stadia</a>' },
    "stamen-watercolor": { url: "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg", attr: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://stadiamaps.com">Stadia</a>' },
    "alidade-smooth": { url: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png", attr: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://stadiamaps.com">Stadia</a>' },
    "alidade-dark": { url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png", attr: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://stadiamaps.com">Stadia</a>' }
  };

  var _markerIntentColors = {
    primary: "#6366f1",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#06b6d4",
    accent: "#8b5cf6",
    neutral: "#64748b"
  };

  function renderAupMap(node) {
    var el = document.createElement("div");
    el.className = "aup-map";
    var p = node.props || {};
    var center = p.center || [0, 0];
    var zoom = p.zoom || 2;
    var tileStyle = p.tileStyle || "carto-voyager";
    var mapDiv = document.createElement("div");
    mapDiv.style.width = "100%";
    if (p.height) el.style.height = p.height;
    mapDiv.style.height = "100%";
    el.appendChild(mapDiv);

    function initMap() {
      if (typeof L === "undefined") {
        loadCSS("https://cdn.jsdelivr.net/npm/leaflet@1/dist/leaflet.min.css");
        var loading = document.createElement("div");
        loading.className = "aup-map-loading";
        loading.textContent = "Loading map...";
        el.insertBefore(loading, mapDiv);
        loadScript("https://cdn.jsdelivr.net/npm/leaflet@1/dist/leaflet.min.js", function() {
          if (loading.parentNode) loading.parentNode.removeChild(loading);
          createMap();
        });
      } else {
        createMap();
      }
    }

    function createMap() {
      try {
        var map = L.map(mapDiv, { zoomControl: false }).setView(center, zoom);

        // Add zoom control to bottom-right for cleaner look
        L.control.zoom({ position: "bottomright" }).addTo(map);

        // Apply tile style
        var tile = _mapTileStyles[tileStyle] || _mapTileStyles["carto-voyager"];
        L.tileLayer(tile.url, { attribution: tile.attr, maxZoom: 19 }).addTo(map);

        // Add markers
        var markers = p.markers || [];
        var markerLayer = L.featureGroup();
        for (var i = 0; i < markers.length; i++) {
          var m = markers[i];
          var color = m.color || _markerIntentColors[m.intent || "primary"] || m.intent || "#6366f1";
          var radius = m.radius || m.size || 7;
          var cm = L.circleMarker([m.lat, m.lng], {
            radius: radius,
            fillColor: color,
            color: "rgba(255,255,255,0.9)",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.85
          }).addTo(markerLayer);
          if (m.label) cm.bindPopup(_escapeHtml(String(m.label)));
        }
        markerLayer.addTo(map);

        // Auto-fit if requested
        if (p.fitMarkers && markers.length > 1) {
          map.fitBounds(markerLayer.getBounds().pad(0.1));
        }

        // src binding for live marker updates
        if (node.src && window.afs) {
          window.afs.read(node.src).then(function(res) {
            if (res && res.content) updateMarkers(map, markerLayer, res.content);
          }).catch(function() {});
          window.afs.subscribe({ type: "afs:write", path: node.src }, function(event) {
            if (event && event.data) updateMarkers(map, markerLayer, event.data.content || event.data);
          });
        }
      } catch(e) { mapDiv.textContent = "Map error: " + e.message; }
    }

    function updateMarkers(map, layer, data) {
      layer.clearLayers();
      var markers = data.markers || data || [];
      if (!Array.isArray(markers)) return;
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        var color = m.color || _markerIntentColors[m.intent || "primary"] || "#6366f1";
        var radius = m.radius || m.size || 7;
        var cm = L.circleMarker([m.lat, m.lng], {
          radius: radius, fillColor: color, color: "rgba(255,255,255,0.9)",
          weight: 2, opacity: 1, fillOpacity: 0.85
        }).addTo(layer);
        if (m.label) cm.bindPopup(_escapeHtml(String(m.label)));
      }
    }

    setTimeout(initMap, 0);
    return el;
  }

`;
