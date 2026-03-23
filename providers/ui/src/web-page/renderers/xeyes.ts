export const XEYES_JS = `
  // ── XEyes — Classic X11 eye-tracking widget ──
  function renderAupXeyes(node) {
    var el = document.createElement("div");
    el.className = "aup-xeyes";
    var p = node.props || {};
    var count = Math.max(2, Math.min(p.eyes || 2, 12));
    var size = p.size || "md"; // sm, md, lg
    if (size === "sm") el.setAttribute("data-xeyes-size", "sm");
    else if (size === "lg") el.setAttribute("data-xeyes-size", "lg");
    if (p.color) el.style.setProperty("--xeyes-iris", p.color);
    if (p.bg) el.style.setProperty("--xeyes-bg", p.bg);

    var eyes = [];
    for (var i = 0; i < count; i++) {
      var eye = document.createElement("div");
      eye.className = "aup-xeyes-eye";
      var pupil = document.createElement("div");
      pupil.className = "aup-xeyes-pupil";
      var iris = document.createElement("div");
      iris.className = "aup-xeyes-iris";
      pupil.appendChild(iris);
      eye.appendChild(pupil);
      el.appendChild(eye);
      eyes.push({ eye: eye, pupil: pupil });
    }

    // Label
    if (p.title !== false) {
      var label = document.createElement("div");
      label.className = "aup-xeyes-label";
      label.textContent = p.title || "xeyes";
      el.appendChild(label);
    }

    // Track mouse
    var raf = null;
    var mx = 0, my = 0;

    function onMove(e) {
      mx = e.clientX;
      my = e.clientY;
      if (!raf) raf = requestAnimationFrame(update);
    }

    function update() {
      raf = null;
      for (var i = 0; i < eyes.length; i++) {
        var eyeEl = eyes[i].eye;
        var pupilEl = eyes[i].pupil;
        var rect = eyeEl.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = mx - cx;
        var dy = my - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);

        // Max pupil travel = 30% of eye radius
        var maxTravel = rect.width * 0.3;
        var travel = Math.min(dist, maxTravel);
        var angle = Math.atan2(dy, dx);
        var px = travel * Math.cos(angle);
        var py = travel * Math.sin(angle);

        pupilEl.style.transform = "translate(" + px.toFixed(1) + "px, " + py.toFixed(1) + "px)";
      }
    }

    // Attach/detach on visibility
    var observer = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting) {
        document.addEventListener("mousemove", onMove);
      } else {
        document.removeEventListener("mousemove", onMove);
      }
    });
    setTimeout(function() { observer.observe(el); }, 0);

    // Blink animation — random interval
    function blink() {
      el.classList.add("aup-xeyes-blink");
      setTimeout(function() { el.classList.remove("aup-xeyes-blink"); }, 150);
      setTimeout(blink, 2000 + Math.random() * 6000);
    }
    setTimeout(blink, 1000 + Math.random() * 3000);

    return el;
  }
`;
