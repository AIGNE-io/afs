export const PROGRESS_BAR_3D_JS = `
  // ── progress-bar-3d: inject CSS once ──
  (function() {
    if (document.getElementById("pb3d-aup-styles")) return;
    var s = document.createElement("style");
    s.id = "pb3d-aup-styles";
    s.textContent = '\
.pb3d-wrap { display: block; }\
.pb3d-perspective {\
  font-size: 5em; text-align: center; width: 100%; height: 1em;\
  padding: 1em 0.2em 1.6em; perspective: 12em; perspective-origin: 50% 50%;\
}\
.pb3d-bar {\
  --pb3d-val: 0; --pb3d-rgb: 87, 202, 244; --pb3d-width: 4em;\
  position: relative; display: inline-block; width: var(--pb3d-width);\
  height: 1em; transition: 0.5s ease-in-out;\
  transform-style: preserve-3d; transform: rotateX(60deg);\
}\
.pb3d-face {\
  position: absolute; bottom: 0; left: 0; display: inline-block;\
  box-sizing: border-box; width: 100%; height: 100%;\
  background-color: rgba(255,255,255,0.3);\
  backface-visibility: visible; transition: transform 0.5s ease-out;\
  transform-origin: 50% 100%;\
}\
.pb3d-roof  { transform: translateZ(1em); }\
.pb3d-front { transform: rotateX(-90deg); }\
.pb3d-back  { transform: rotateX(-90deg) rotateY(0deg) translateZ(-1em); }\
.pb3d-left {\
  width: 1em;\
  transform: rotateX(-90deg) rotateY(-90deg) translateX(-0.5em) translateZ(0.5em);\
  background-color: rgba(var(--pb3d-rgb), 0.2);\
}\
.pb3d-right {\
  left: auto; right: -0.5em; width: 1em;\
  transform: rotateX(-90deg) rotateY(90deg) translateX(0.5em);\
}\
.pb3d-fill::before {\
  content: ""; font-size: 0.25em; line-height: 4em;\
  position: absolute; bottom: 0; left: 0;\
  width: calc(var(--pb3d-val, 0) * 1%); height: 100%;\
  margin: 0; display: block; box-sizing: border-box;\
  background-color: rgba(var(--pb3d-rgb), 0.5);\
  transition: width 0.5s ease-out;\
}\
.pb3d-floor.pb3d-shadow {\
  box-shadow:\
    rgba(0,0,0,0.15) 0 -0.2em 1em,\
    rgba(0,0,0,0.3) 0 0.2em 0.1em -5px,\
    rgba(254,254,254,0.6) 0 -0.75em 1.75em;\
}\
.pb3d-front.pb3d-shine::before {\
  box-shadow: rgba(var(--pb3d-rgb), 0.25) 0 1.6em 3em;\
}\
.pb3d-tooltip {\
  font-size: 0.65em; font-weight: bold;\
  margin: 1.85em 0 0 -0.5em; display: none;\
  position: absolute; line-height: 1em; height: 1em; width: 1em;\
  left: calc(var(--pb3d-val, 0) * 1%); color: #fefefe;\
  transition: left 0.5s ease-out; z-index: 1;\
}\
.pb3d-bar[data-tooltip="white"] .pb3d-tooltip,\
.pb3d-bar[data-tooltip="pink"] .pb3d-tooltip,\
.pb3d-bar[data-tooltip="heat"] .pb3d-tooltip { display: inline-block; }\
.pb3d-tooltip::before {\
  content: attr(data-text); display: inline-block; font-size: 0.25em;\
  position: absolute; left: 0; top: 0; width: 100%; height: 100%;\
  text-align: center; line-height: 4em;\
}\
.pb3d-tooltip::after {\
  content: ""; display: inline-block; font-size: 0.25em;\
  position: absolute; left: 0; top: 0; height: 0; width: 0;\
  margin: -0.75em 0 0 1em;\
  border-width: 0 1em 1em; border-style: solid;\
  border-color: transparent transparent #ff6db3;\
  transition: border-color 0.5s ease-out;\
}\
.pb3d-bar[data-tooltip="white"] .pb3d-tooltip {\
  background-color: #fefefe; border-bottom: 1px solid #e5e5e5;\
  color: #444; box-shadow: rgba(0,0,0,0.2) 0 0.08em 0.1em 0, rgba(0,0,0,0.2) 0 0.1em 1.6em;\
}\
.pb3d-bar[data-tooltip="white"] .pb3d-tooltip::after { border-bottom-color: #fefefe; }\
.pb3d-bar[data-tooltip="pink"] .pb3d-tooltip {\
  background-color: #ff6db3; border-bottom: 1px solid #ff53a5;\
  box-shadow: rgba(0,0,0,0.4) 0 0.05em 0.1em -0.02em, rgba(0,0,0,0.3) 0 0.1em 0.6em;\
}\
.pb3d-bar[data-tooltip="pink"] .pb3d-tooltip::after { border-bottom-color: #ff6db3; }\
.pb3d-bar[data-tooltip="heat"] .pb3d-tooltip {\
  box-shadow: rgba(0,0,0,0.4) 0 0.05em 0.1em -0.02em, rgba(0,0,0,0.3) 0 0.1em 0.6em;\
}\
.pb3d-bar[data-tooltip="heat"] .pb3d-tooltip::after {\
  border-bottom-color: var(--pb3d-tip-color, #ff6db3);\
}\
.pb3d-bar[data-style="striped"] .pb3d-fill::before {\
  background-image:\
    linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),\
    linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px),\
    linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);\
  background-size: 1em 1em, 1.6em 2em, 0.8em 2em;\
}\
.pb3d-bar[data-style="striped-simple"] .pb3d-fill::before {\
  background-image: linear-gradient(90deg, rgba(255,255,255,0.1) 0.8em, transparent 1px);\
  background-size: 1.6em 2em;\
}\
.pb3d-bar[data-style="heat"] .pb3d-fill::before {\
  background: linear-gradient(to right, rgba(241,196,15,0.8) 0%, rgba(236,0,113,0.6) 100%) 0 0 / 16em 100% no-repeat;\
}\
.pb3d-bar[data-style="heat"] .pb3d-left { background-color: rgba(241,196,15,0.8); }\
.pb3d-bar[data-style="heat"] .pb3d-front.pb3d-shine::before {\
  box-shadow: rgba(241,196,15,0.3) -2em 1.6em 3em -1em, rgba(236,0,113,0.3) 2em 1.6em 3em -1em;\
}\
.pb3d-bar[data-style="dotted"] .pb3d-fill::before {\
  background-image:\
    radial-gradient(rgba(254,254,254,0.5) 10%, transparent 10%),\
    radial-gradient(rgba(254,254,254,0.5) 10%, transparent 10%);\
  background-size: 1em 1em; background-position: 0 0, 0.5em 0.5em;\
}\
.pb3d-bar[data-style="hover"] .pb3d-floor { transition: box-shadow 0.5s ease-in-out; }\
.pb3d-bar[data-style="hover"]:hover { transform: rotateX(60deg) translateZ(0.1em); }\
.pb3d-bar[data-style="hover"]:hover .pb3d-floor.pb3d-shadow {\
  box-shadow: rgba(0,0,0,0.15) 0 -0.1em 1em, rgba(0,0,0,0.15) 0 0.35em 0.2em -8px, rgba(254,254,254,0.6) 0 -0.75em 1.75em;\
}\
';
    document.head.appendChild(s);
  })();

  var _PB3D_COLORS = {
    navy:"10,64,105", orange:"255,105,0", cyan:"87,202,244",
    red:"236,0,113", yellow:"241,196,15", dark:"68,68,68",
    green:"46,204,113", purple:"142,68,173", pink:"255,109,179",
    blue:"52,152,219", teal:"0,128,128", gold:"212,175,55"
  };

  function _pb3dParseColor(c) {
    if (!c) return _PB3D_COLORS.navy;
    if (_PB3D_COLORS[c]) return _PB3D_COLORS[c];
    if (c.charAt(0) === "#") {
      var h = c.slice(1);
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      var n = parseInt(h, 16);
      return ((n>>16)&255)+","+((n>>8)&255)+","+(n&255);
    }
    return _PB3D_COLORS.navy;
  }

  function renderAupProgressBar3d(node) {
    var p = node.props || {};
    var value = p.value != null ? parseInt(p.value) : 0;
    if (value < 0) value = 0;
    if (value > 100) value = 100;
    var color = p.color || "cyan";
    var style = p.style || "striped";
    var tooltip = p.tooltip || "white";
    var size = p.size || "3em";
    var label = p.label || (value + "%");

    var rgb = _pb3dParseColor(color);

    var wrap = document.createElement("div");
    wrap.className = "pb3d-wrap aup-progress-bar-3d";

    var perspective = document.createElement("div");
    perspective.className = "pb3d-perspective";
    perspective.style.fontSize = size;

    var bar = document.createElement("div");
    bar.className = "pb3d-bar";
    bar.style.setProperty("--pb3d-val", value);
    bar.style.setProperty("--pb3d-rgb", rgb);
    bar.setAttribute("data-style", style);
    bar.setAttribute("data-tooltip", tooltip);

    var faceClasses = [
      "pb3d-face pb3d-roof pb3d-fill",
      "pb3d-face pb3d-front pb3d-fill pb3d-shine",
      "pb3d-face pb3d-back",
      "pb3d-face pb3d-left",
      "pb3d-face pb3d-right",
      "pb3d-face pb3d-floor pb3d-shadow"
    ];
    for (var i = 0; i < faceClasses.length; i++) {
      var face = document.createElement("div");
      face.className = faceClasses[i];
      bar.appendChild(face);
    }

    // Tooltip
    if (tooltip !== "none") {
      var tt = document.createElement("div");
      tt.className = "pb3d-tooltip";
      tt.setAttribute("data-text", label);
      if (tooltip === "heat") {
        var t = value / 100;
        var ha = [241,196,15], hb = [236,0,113];
        var bg = "rgb("+Math.round(ha[0]+(hb[0]-ha[0])*t)+","+Math.round(ha[1]+(hb[1]-ha[1])*t)+","+Math.round(ha[2]+(hb[2]-ha[2])*t)+")";
        tt.style.backgroundColor = bg;
        tt.style.setProperty("--pb3d-tip-color", bg);
      }
      bar.appendChild(tt);
    }

    perspective.appendChild(bar);
    wrap.appendChild(perspective);
    return wrap;
  }
`;
