export const GLOBE_JS = `
  // ── Globe Map (MapLibre GL — 3D globe with flyTo) ──
  function renderAupGlobe(node) {
    var el = document.createElement("div");
    el.className = "aup-map";
    var p = node.props || {};
    var center = p.center || [0, 20];
    var zoom = p.zoom || 1.5;
    var tileStyle = p.tileStyle || "carto-voyager";
    if (p.height) el.style.height = p.height;
    var mapDiv = document.createElement("div");
    mapDiv.style.width = "100%";
    mapDiv.style.height = "100%";
    el.appendChild(mapDiv);

    function tileUrl(style) {
      var t = _mapTileStyles[style] || _mapTileStyles["carto-voyager"];
      // MapLibre needs explicit subdomain — replace {s} with "a", {r} with @2x for retina
      return t.url.replace("{s}", "a").replace("{r}", "@2x");
    }

    function initGlobe() {
      if (typeof maplibregl === "undefined") {
        loadCSS("https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.css");
        var loading = document.createElement("div");
        loading.className = "aup-map-loading";
        loading.textContent = "Loading globe...";
        el.insertBefore(loading, mapDiv);
        loadScript("https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.js", function() {
          if (loading.parentNode) loading.parentNode.removeChild(loading);
          createGlobe();
        });
      } else {
        createGlobe();
      }
    }

    function createGlobe() {
      try {
        var tile = _mapTileStyles[tileStyle] || _mapTileStyles["carto-voyager"];
        var map = new maplibregl.Map({
          container: mapDiv,
          style: {
            version: 8,
            sources: { basemap: { type: "raster", tiles: [tileUrl(tileStyle)], tileSize: 256, attribution: tile.attr } },
            layers: [{ id: "basemap", type: "raster", source: "basemap" }],
            glyphs: "https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf"
          },
          center: [center[1], center[0]], // MapLibre uses [lng, lat]
          zoom: zoom,
          projection: "globe",
          attributionControl: false
        });
        map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

        // Add markers
        var markers = p.markers || [];
        for (var i = 0; i < markers.length; i++) {
          addGlobeMarker(map, markers[i]);
        }

        // flyTo sequence
        var flyMarkers = p.flyTo || markers;
        if (flyMarkers.length > 0 && p.autoFly !== false) {
          var flyIdx = 0;
          var flyDelay = p.flyInterval || 4000;
          var flyZoom = p.flyZoom || 5;
          map.once("load", function() {
            setTimeout(function flyNext() {
              if (!el.isConnected) return; // stop if removed from DOM
              var target = flyMarkers[flyIdx % flyMarkers.length];
              map.flyTo({
                center: [target.lng, target.lat],
                zoom: target.zoom || flyZoom,
                duration: p.flyDuration || 3000,
                essential: true
              });
              flyIdx++;
              setTimeout(flyNext, flyDelay);
            }, 1500);
          });
        }

        // Support tileStyle switching via custom event
        el._globeMap = map;
        el._setTileStyle = function(newStyle) {
          var t = _mapTileStyles[newStyle] || _mapTileStyles["carto-voyager"];
          var src = map.getSource("basemap");
          if (src && src.setTiles) {
            src.setTiles([tileUrl(newStyle)]);
          }
        };
      } catch(e) { mapDiv.textContent = "Globe error: " + e.message; }
    }

    function addGlobeMarker(map, m) {
      var color = m.color || _markerIntentColors[m.intent || "primary"] || "#6366f1";
      var size = (m.radius || m.size || 7) * 2;
      var dot = document.createElement("div");
      dot.style.cssText = "width:" + size + "px;height:" + size + "px;border-radius:50%;background:" + color + ";border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;";
      var marker = new maplibregl.Marker({ element: dot }).setLngLat([m.lng, m.lat]).addTo(map);
      if (m.label) {
        var popup = new maplibregl.Popup({ offset: size / 2 + 4, closeButton: false })
          .setHTML('<div style="font-family:var(--font-body);font-size:0.85em;padding:2px 4px;">' + _escapeHtml(String(m.label)) + "</div>");
        marker.setPopup(popup);
      }
    }

    setTimeout(initGlobe, 0);
    return el;
  }

`;
