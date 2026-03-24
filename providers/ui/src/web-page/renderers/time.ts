export const TIME_JS = `
  // ── Time Primitive ──
  var _timeIntervals = [];
  function renderAupTime(node) {
    var el = document.createElement("div");
    el.className = "aup-time";
    var p = node.props || {};
    var mode = p.mode || "display";

    if (mode === "display") {
      el.classList.add("aup-time-display");
      var val = p.value || new Date().toISOString();
      try {
        var d = new Date(val);
        var fmt = p.format || {};
        el.textContent = new Intl.DateTimeFormat(p.locale || undefined, Object.keys(fmt).length ? fmt : { dateStyle: "medium", timeStyle: "short" }).format(d);
      } catch(e) { el.textContent = String(val); }
    } else if (mode === "clock") {
      el.classList.add("aup-time-clock");
      function updateClock() {
        var now = new Date();
        el.textContent = now.toLocaleTimeString(p.locale || undefined);
      }
      updateClock();
      var intv = setInterval(updateClock, 1000);
      _timeIntervals.push(intv);
    } else if (mode === "timer") {
      el.classList.add("aup-time-timer");
      var startTime = Date.now();
      function updateTimer() {
        var elapsed = Math.floor((Date.now() - startTime) / 1000);
        var h = Math.floor(elapsed / 3600);
        var m = Math.floor((elapsed % 3600) / 60);
        var s = elapsed % 60;
        el.textContent = (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
      }
      updateTimer();
      var tIntv = setInterval(updateTimer, 1000);
      _timeIntervals.push(tIntv);
    } else if (mode === "countdown") {
      el.classList.add("aup-time-countdown");
      var target = p.target ? new Date(p.target).getTime() : Date.now();
      function updateCountdown() {
        var remaining = Math.max(0, Math.floor((target - Date.now()) / 1000));
        var h = Math.floor(remaining / 3600);
        var m = Math.floor((remaining % 3600) / 60);
        var s = remaining % 60;
        el.textContent = (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
        if (remaining <= 0) el.textContent = p.expiredLabel || "00:00";
      }
      updateCountdown();
      var cdIntv = setInterval(updateCountdown, 1000);
      _timeIntervals.push(cdIntv);
    } else if (mode === "picker") {
      el.classList.add("aup-time-picker");
      var inp = document.createElement("input");
      inp.type = "datetime-local";
      if (p.value) inp.value = p.value;
      el.appendChild(inp);
    } else if (mode === "analog-clock") {
      el.classList.add("aup-time-analog-clock");
      var ns = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 200 200");
      // Face
      var face = document.createElementNS(ns, "circle");
      face.setAttribute("cx", "100"); face.setAttribute("cy", "100"); face.setAttribute("r", "95");
      face.setAttribute("class", "aup-clock-face");
      svg.appendChild(face);
      // Tick marks
      for (var i = 0; i < 60; i++) {
        var tick = document.createElementNS(ns, "line");
        var isHour = i % 5 === 0;
        var ang = (i * 6) * Math.PI / 180;
        var r1 = isHour ? 78 : 85;
        var r2 = 90;
        tick.setAttribute("x1", String(100 + r1 * Math.sin(ang)));
        tick.setAttribute("y1", String(100 - r1 * Math.cos(ang)));
        tick.setAttribute("x2", String(100 + r2 * Math.sin(ang)));
        tick.setAttribute("y2", String(100 - r2 * Math.cos(ang)));
        tick.setAttribute("class", "aup-clock-tick");
        tick.setAttribute("stroke-width", isHour ? "2.5" : "0.8");
        svg.appendChild(tick);
      }
      // Hour numbers
      var nums = [12,1,2,3,4,5,6,7,8,9,10,11];
      for (var ni = 0; ni < nums.length; ni++) {
        var na = (ni * 30) * Math.PI / 180;
        var txt = document.createElementNS(ns, "text");
        txt.setAttribute("x", String(100 + 65 * Math.sin(na)));
        txt.setAttribute("y", String(100 - 65 * Math.cos(na)));
        txt.setAttribute("class", "aup-clock-number");
        txt.textContent = String(nums[ni]);
        svg.appendChild(txt);
      }
      // Hands
      var handH = document.createElementNS(ns, "line");
      handH.setAttribute("x1", "100"); handH.setAttribute("y1", "100");
      handH.setAttribute("class", "aup-clock-hand-hour");
      svg.appendChild(handH);
      var handM = document.createElementNS(ns, "line");
      handM.setAttribute("x1", "100"); handM.setAttribute("y1", "100");
      handM.setAttribute("class", "aup-clock-hand-minute");
      svg.appendChild(handM);
      var handS = document.createElementNS(ns, "line");
      handS.setAttribute("x1", "100"); handS.setAttribute("y1", "100");
      handS.setAttribute("class", "aup-clock-hand-second");
      svg.appendChild(handS);
      // Center dot
      var dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", "100"); dot.setAttribute("cy", "100"); dot.setAttribute("r", "4");
      dot.setAttribute("class", "aup-clock-center");
      svg.appendChild(dot);
      el.appendChild(svg);
      function setHands(date) {
        var h = date.getHours() % 12, m = date.getMinutes(), s = date.getSeconds();
        var hAng = (h * 30 + m * 0.5) * Math.PI / 180;
        var mAng = (m * 6 + s * 0.1) * Math.PI / 180;
        var sAng = (s * 6) * Math.PI / 180;
        handH.setAttribute("x2", String(100 + 45 * Math.sin(hAng)));
        handH.setAttribute("y2", String(100 - 45 * Math.cos(hAng)));
        handM.setAttribute("x2", String(100 + 62 * Math.sin(mAng)));
        handM.setAttribute("y2", String(100 - 62 * Math.cos(mAng)));
        handS.setAttribute("x2", String(100 + 70 * Math.sin(sAng)));
        handS.setAttribute("y2", String(100 - 70 * Math.cos(sAng)));
      }
      if (p.value) {
        setHands(new Date(p.value));
      } else {
        setHands(new Date());
        var acIntv = setInterval(function() { setHands(new Date()); }, 1000);
        _timeIntervals.push(acIntv);
      }
    } else if (mode === "calendar") {
      el.classList.add("aup-time-calendar");
      var cd = p.value ? new Date(p.value) : new Date();
      var loc = p.locale || undefined;
      var monthDiv = document.createElement("div");
      monthDiv.className = "aup-calendar-month";
      monthDiv.textContent = new Intl.DateTimeFormat(loc, { month: "short" }).format(cd).toUpperCase();
      var dayDiv = document.createElement("div");
      dayDiv.className = "aup-calendar-day";
      dayDiv.textContent = String(cd.getDate());
      var wdDiv = document.createElement("div");
      wdDiv.className = "aup-calendar-weekday";
      wdDiv.textContent = new Intl.DateTimeFormat(loc, { weekday: "long" }).format(cd);
      el.appendChild(monthDiv);
      el.appendChild(dayDiv);
      el.appendChild(wdDiv);
    }
    return el;
  }

`;
