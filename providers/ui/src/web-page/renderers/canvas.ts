export const CANVAS_JS = `
  // ── Canvas Subsystem (HTML5 Canvas drawing) ──
  function renderAupCanvas(node) {
    var el = document.createElement("div");
    el.className = "aup-canvas";
    var p = node.props || {};
    var width = parseInt(p.width) || 800;
    var height = parseInt(p.height) || 400;
    var bgColor = p.background || "#ffffff";

    // Toolbar
    var toolbar = document.createElement("div");
    toolbar.className = "aup-canvas-toolbar";

    var tools = [
      { id: "pen", label: "Pen" },
      { id: "line", label: "Line" },
      { id: "rect", label: "Rect" },
      { id: "circle", label: "Circle" },
      { id: "eraser", label: "Eraser" },
    ];
    var activeTool = "pen";
    var toolBtns = {};

    for (var t = 0; t < tools.length; t++) {
      (function(tool) {
        var btn = document.createElement("button");
        btn.textContent = tool.label;
        if (tool.id === activeTool) btn.classList.add("active");
        btn.onclick = function() {
          activeTool = tool.id;
          for (var k in toolBtns) toolBtns[k].classList.remove("active");
          btn.classList.add("active");
        };
        toolbar.appendChild(btn);
        toolBtns[tool.id] = btn;
      })(tools[t]);
    }

    // Separator
    var sep = document.createElement("div");
    sep.className = "separator";
    toolbar.appendChild(sep);

    // Color picker
    var colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = p.strokeColor || "#000000";
    toolbar.appendChild(colorInput);

    // Line width
    var sizeInput = document.createElement("input");
    sizeInput.type = "range";
    sizeInput.min = "1";
    sizeInput.max = "20";
    sizeInput.value = String(p.strokeWidth || 2);
    toolbar.appendChild(sizeInput);

    // Clear button
    var sep2 = document.createElement("div");
    sep2.className = "separator";
    toolbar.appendChild(sep2);
    var clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.onclick = function() {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
      strokes = [];
    };
    toolbar.appendChild(clearBtn);

    el.appendChild(toolbar);

    // Canvas area
    var area = document.createElement("div");
    area.className = "aup-canvas-area";
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    area.appendChild(canvas);
    el.appendChild(area);

    var ctx = canvas.getContext("2d");
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    var drawing = false;
    var startX = 0, startY = 0;
    var strokes = [];
    var snapshot = null;

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var scaleY = canvas.height / rect.height;
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    }

    canvas.addEventListener("mousedown", function(e) {
      drawing = true;
      var pos = getPos(e);
      startX = pos.x;
      startY = pos.y;
      if (activeTool === "pen" || activeTool === "eraser") {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      } else {
        snapshot = ctx.getImageData(0, 0, width, height);
      }
    });

    canvas.addEventListener("mousemove", function(e) {
      if (!drawing) return;
      var pos = getPos(e);
      var lw = parseInt(sizeInput.value) || 2;
      if (activeTool === "pen") {
        ctx.strokeStyle = colorInput.value;
        ctx.lineWidth = lw;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else if (activeTool === "eraser") {
        ctx.strokeStyle = bgColor;
        ctx.lineWidth = lw * 4;
        ctx.lineCap = "round";
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else if (snapshot) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.strokeStyle = colorInput.value;
        ctx.lineWidth = lw;
        ctx.lineCap = "round";
        if (activeTool === "line") {
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        } else if (activeTool === "rect") {
          ctx.strokeRect(startX, startY, pos.x - startX, pos.y - startY);
        } else if (activeTool === "circle") {
          var rx = Math.abs(pos.x - startX) / 2;
          var ry = Math.abs(pos.y - startY) / 2;
          var cx = startX + (pos.x - startX) / 2;
          var cy = startY + (pos.y - startY) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    });

    canvas.addEventListener("mouseup", function() {
      drawing = false;
      snapshot = null;
    });

    canvas.addEventListener("mouseleave", function() {
      drawing = false;
      snapshot = null;
    });

    return el;
  }

`;
