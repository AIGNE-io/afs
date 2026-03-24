;(() => {
'use strict';

// ==================== Perlin Noise (public domain) ====================
// Based on Stefan Gustavson's simplex noise implementation
const perlin = (() => {
  const F3 = 1 / 3, G3 = 1 / 6;
  const grad3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
    [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
  ];
  const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
    190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,
    136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,
    41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,
    116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,
    207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,
    167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,
    238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,
    176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];

  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  function dot3(g, x, y, z) { return g[0]*x + g[1]*y + g[2]*z; }

  function simplex3(xin, yin, zin) {
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t, Y0 = j - t, Z0 = k - t;
    const x0 = xin - X0, y0 = yin - Y0, z0 = zin - Z0;

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
      else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
      else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
    } else {
      if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
      else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
      else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
    }

    const x1 = x0-i1+G3, y1 = y0-j1+G3, z1 = z0-k1+G3;
    const x2 = x0-i2+2*G3, y2 = y0-j2+2*G3, z2 = z0-k2+2*G3;
    const x3 = x0-1+3*G3, y3 = y0-1+3*G3, z3 = z0-1+3*G3;

    const ii = i & 255, jj = j & 255, kk = k & 255;
    const gi0 = permMod12[ii + perm[jj + perm[kk]]];
    const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
    const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
    const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];

    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * dot3(grad3[gi0], x0, y0, z0));
    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * dot3(grad3[gi1], x1, y1, z1));
    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * dot3(grad3[gi2], x2, y2, z2));
    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    n3 = t3 < 0 ? 0 : (t3 *= t3, t3 * t3 * dot3(grad3[gi3], x3, y3, z3));

    return 32 * (n0 + n1 + n2 + n3);
  }

  return { simplex3 };
})();

// ==================== CSS ====================
const CSS = `
.wh{position:relative;overflow:hidden;width:100%;height:100%}
.wh canvas{display:block;width:100%;height:100%;position:absolute;top:0;left:0}
`;

function injectCSS() {
  if (document.getElementById('wh-css')) return;
  const s = document.createElement('style');
  s.id = 'wh-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ==================== DSL Parser ====================
function parseConfig(text) {
  const cfg = {
    mode: 'wave',
    colors: [],
    speed: 1.0,
    opacity: 1.0,
    bg: '#000000',
    mouse: true,
    camera: 0,
    palette: '',
    style: 'v1',
    theme: '',
    sun: 0,
    star: 'sun',
  };
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (!t || t[0] !== '@') continue;
    const sp = t.indexOf(' ');
    if (sp < 0) continue;
    const key = t.slice(1, sp).toLowerCase();
    const val = t.slice(sp + 1).trim();
    switch (key) {
      case 'mode': cfg.mode = val; break;
      case 'colors': cfg.colors = val.split(',').map(s => s.trim()); break;
      case 'speed': cfg.speed = parseFloat(val) || 1.0; break;
      case 'opacity': cfg.opacity = parseFloat(val); break;
      case 'bg': cfg.bg = val; break;
      case 'mouse': cfg.mouse = val !== 'false'; break;
      case 'camera': cfg.camera = parseFloat(val) || 0; break;
      case 'palette': cfg.palette = val; break;
      case 'style': cfg.style = val; break;
      case 'theme': cfg.theme = val; break;
      case 'sun': cfg.sun = parseFloat(val) || 0; break;
      case 'star': cfg.star = val === 'moon' ? 'moon' : 'sun'; break;
      case 'cycle': cfg.cycle = parseFloat(val) || 0; break;
    }
  }
  return cfg;
}

// ==================== Three.js Lazy Loader ====================
function ensureThree(cb) {
  if (window.THREE) return cb();
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
  s.onload = cb;
  s.onerror = () => console.error('WebGLHero: Failed to load Three.js');
  document.head.appendChild(s);
}

// ==================== Dot Texture Generator ====================
function createDotTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ==================== Shared Infrastructure ====================
function createScene(canvas, cfg) {
  const THREE = window.THREE;
  const w = canvas.offsetWidth || canvas.clientWidth || 800;
  const h = canvas.offsetHeight || canvas.clientHeight || 600;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  const bgColor = new THREE.Color(cfg.bg);
  renderer.setClearColor(bgColor, cfg.opacity);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 2000);

  return { THREE, renderer, scene, camera, width: w, height: h };
}

function setupResize(canvas, camera, renderer) {
  let tm;
  function onResize() {
    canvas.style.width = '';
    canvas.style.height = '';
    const w = canvas.offsetWidth || canvas.clientWidth;
    const h = canvas.offsetHeight || canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  const handler = () => { clearTimeout(tm); tm = setTimeout(onResize, 200); };
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}

// ==================== Easing Utilities ====================
function easeBackOut(t) {
  const s = 1.70158;
  return 1 + (--t) * t * (s * (t + 1) + t);
}

// ==================== WaveEngine ====================
function WaveEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  camera.position.set(0, 0, cfg.camera || 280);

  const sphere = new THREE.Group();
  scene.add(sphere);

  const userColors = cfg.colors.length ? cfg.colors : ['#4a4a4a', '#3F51B5'];
  const mat1 = new THREE.LineBasicMaterial({ color: new THREE.Color(userColors[0]) });
  const mat2 = new THREE.LineBasicMaterial({ color: new THREE.Color(userColors[1] || userColors[0]) });

  const radius = 100;
  const lineCount = 50;
  const dotCount = 50;
  const lines = [];

  for (let i = 0; i < lineCount; i++) {
    const positions = new Float32Array(dotCount * 3);
    const geom = new THREE.BufferGeometry();
    const lineRadius = Math.floor(radius + (Math.random() - 0.5) * (radius * 0.2));
    const speed = Math.random() * 300 + 250;

    for (let j = 0; j < dotCount; j++) {
      const x = ((j / dotCount) * lineRadius * 2) - lineRadius;
      positions[j * 3] = x;
      positions[j * 3 + 1] = 0;
      positions[j * 3 + 2] = 0;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const line = new THREE.Line(geom, Math.random() > 0.2 ? mat1 : mat2);
    line.rotation.x = Math.random() * Math.PI;
    line.rotation.y = Math.random() * Math.PI;
    line.rotation.z = Math.random() * Math.PI;
    sphere.add(line);
    lines.push({ line, positions, radius: lineRadius, speed });
  }

  let raf = 0;
  let running = false;

  function render(a) {
    if (!running) return;
    const spd = cfg.speed;
    for (let i = 0; i < lines.length; i++) {
      const { positions, radius: lr, speed } = lines[i];
      for (let j = 0; j < dotCount; j++) {
        const x = positions[j * 3];
        const ratio = 1 - ((lr - Math.abs(x)) / lr);
        positions[j * 3 + 1] = Math.sin(a * spd / speed + j * 0.15) * 12 * ratio;
      }
      lines[i].line.geometry.attributes.position.needsUpdate = true;
    }
    sphere.rotation.y = a * 0.0001 * spd;
    sphere.rotation.x = -a * 0.0001 * spd;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() { this.stop(); scene.remove(sphere); renderer.dispose(); },
  };
}

// ==================== BlobEngine ====================
function BlobEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  camera.position.set(120, 0, cfg.camera || 300);
  camera.fov = 100;
  camera.updateProjectionMatrix();

  // Lighting
  const hemi = new THREE.HemisphereLight(0xffffff, 0x0C056D, 0.6);
  scene.add(hemi);
  const dir1 = new THREE.DirectionalLight(0x590D82, 0.5);
  dir1.position.set(200, 300, 400);
  scene.add(dir1);
  const dir2 = dir1.clone();
  dir2.position.set(-200, 300, 400);
  scene.add(dir2);

  const userColors = cfg.colors;
  const emissiveColor = userColors.length ? new THREE.Color(userColors[0]) : new THREE.Color(0x23f660);

  const geom = new THREE.IcosahedronGeometry(120, 4);
  const posAttr = geom.getAttribute('position');
  const origPositions = new Float32Array(posAttr.array);

  const mat = new THREE.MeshPhongMaterial({
    emissive: emissiveColor,
    emissiveIntensity: 0.4,
    shininess: 0,
  });
  const shape = new THREE.Mesh(geom, mat);
  scene.add(shape);

  let mouseX = 0.5, mouseY = 0.5;
  let curX = 0.5, curY = 0.5;
  function onMouseMove(e) {
    mouseX = e.clientX / window.innerWidth;
    mouseY = e.clientY / window.innerHeight;
  }
  if (cfg.mouse) window.addEventListener('mousemove', onMouseMove);

  let raf = 0;
  let running = false;

  function render(a) {
    if (!running) return;
    curX += (mouseX - curX) * 0.05;
    curY += (mouseY - curY) * 0.05;
    const spd = cfg.speed;
    const arr = posAttr.array;
    for (let i = 0; i < arr.length; i += 3) {
      const ox = origPositions[i], oy = origPositions[i+1], oz = origPositions[i+2];
      const p = perlin.simplex3(
        ox * 0.006 + a * 0.0002 * spd,
        oy * 0.006 + a * 0.0003 * spd,
        oz * 0.006
      );
      const ratio = (p * 0.4 * (curY + 0.1)) + 0.8;
      arr[i] = ox * ratio;
      arr[i+1] = oy * ratio;
      arr[i+2] = oz * ratio;
    }
    posAttr.needsUpdate = true;
    geom.computeVertexNormals();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      if (cfg.mouse) window.removeEventListener('mousemove', onMouseMove);
      scene.remove(shape, hemi, dir1, dir2);
      renderer.dispose();
    },
  };
}

// ==================== CubeEngine ====================
function CubeEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  camera.position.set(0, 0, cfg.camera || 100);
  camera.fov = 45;
  camera.updateProjectionMatrix();

  const userColors = cfg.colors;
  const wireColor = userColors.length ? new THREE.Color(userColors[0]) : new THREE.Color(0x13756a);

  // Use EdgesGeometry for wireframe look on a subdivided box
  const boxGeom = new THREE.BoxGeometry(49, 49, 49, 7, 7, 7);
  const posAttr = boxGeom.getAttribute('position');
  const origPositions = new Float32Array(posAttr.array);

  const mat = new THREE.MeshBasicMaterial({
    color: wireColor,
    wireframe: true,
  });
  const cube = new THREE.Mesh(boxGeom, mat);
  scene.add(cube);

  let raf = 0;
  let running = false;
  let rotY = 0, rotX = 0;

  function render(a) {
    if (!running) return;
    const spd = cfg.speed;
    const arr = posAttr.array;
    for (let i = 0; i < arr.length; i += 3) {
      const ox = origPositions[i], oy = origPositions[i+1], oz = origPositions[i+2];
      const ratio = perlin.simplex3(
        ox * 0.01,
        oy * 0.01 + a * 0.0005 * spd,
        oz * 0.01
      );
      const scale = 1 + ratio * 0.1;
      arr[i] = ox * scale;
      arr[i+1] = oy * scale;
      arr[i+2] = oz * scale;
    }
    posAttr.needsUpdate = true;

    // Slow continuous rotation (replaces GSAP 80s tween)
    const dt = 0.0008 * spd;
    rotY += dt;
    rotX += dt;
    cube.rotation.y = rotY;
    cube.rotation.x = rotX;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() { this.stop(); scene.remove(cube); renderer.dispose(); },
  };
}

// ==================== RingsEngine ====================
function RingsEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  camera.position.set(0, 0, cfg.camera || 350);

  const sphere = new THREE.Group();
  scene.add(sphere);

  const userColors = cfg.colors;
  const lineColor = userColors.length ? new THREE.Color(userColors[0]) : new THREE.Color(0xfe0e55);
  const mat = new THREE.LineBasicMaterial({ color: lineColor });

  const linesAmount = 18;
  const radius = 100;
  const verticesAmount = 50;
  const rings = [];

  for (let j = 0; j < linesAmount; j++) {
    const positions = new Float32Array((verticesAmount + 1) * 3);
    const origDirs = new Float32Array((verticesAmount + 1) * 3);
    const geom = new THREE.BufferGeometry();

    let currentY = (j / linesAmount) * radius * 2;

    for (let i = 0; i <= verticesAmount; i++) {
      const angle = (i / verticesAmount) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      origDirs[i * 3] = dx;
      origDirs[i * 3 + 1] = 0;
      origDirs[i * 3 + 2] = dz;
      positions[i * 3] = dx;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = dz;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const line = new THREE.Line(geom, mat);
    sphere.add(line);
    rings.push({ line, positions, origDirs, y: currentY });
  }

  // Mouse interaction: lerped rotation
  let mouseY = 0.5, curMY = 0.5;
  function onMouseMove(e) { mouseY = e.clientY / window.innerHeight; }
  if (cfg.mouse) window.addEventListener('mousemove', onMouseMove);

  let raf = 0;
  let running = false;

  function render(a) {
    if (!running) return;
    const spd = cfg.speed;
    curMY += (mouseY - curMY) * 0.05;

    for (let j = 0; j < rings.length; j++) {
      const ring = rings[j];
      ring.y += 0.3 * spd;
      if (ring.y > radius * 2) ring.y = 0;

      const radiusHeight = Math.sqrt(ring.y * (2 * radius - ring.y));
      const arr = ring.positions;
      const orig = ring.origDirs;

      for (let i = 0; i <= verticesAmount; i++) {
        const dx = orig[i * 3], dz = orig[i * 3 + 2];
        const ratio = perlin.simplex3(
          dx * 0.009,
          dz * 0.009 + a * 0.0006 * spd,
          ring.y * 0.009
        ) * 15;
        const r = radiusHeight + ratio;
        arr[i * 3] = dx * r;
        arr[i * 3 + 1] = ring.y - radius;
        arr[i * 3 + 2] = dz * r;
      }
      ring.line.geometry.attributes.position.needsUpdate = true;
    }

    // Smooth rotation from mouse
    sphere.rotation.x += (curMY * 1 - sphere.rotation.x) * 0.05;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      if (cfg.mouse) window.removeEventListener('mousemove', onMouseMove);
      scene.remove(sphere);
      scene.remove(ambientLight);
      scene.remove(dirLight);
      renderer.dispose();
    },
  };
}

// ==================== GalaxyEngine ====================
function GalaxyEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  camera.position.set(0, 0, cfg.camera || 350);
  camera.fov = 50;
  camera.updateProjectionMatrix();

  const galaxy = new THREE.Group();
  scene.add(galaxy);

  const userColors = cfg.colors.length >= 1 ? cfg.colors : ['#ac1122', '#96789f', '#535353'];
  const threeColors = userColors.map(c => new THREE.Color(c));

  const dotTexture = createDotTexture(THREE);

  const dotsAmount = 3000;
  const positions = new Float32Array(dotsAmount * 3);
  const sizes = new Float32Array(dotsAmount);
  const colorsAttr = new Float32Array(dotsAmount * 3);

  // Per-particle animation state
  const particles = [];

  for (let i = 0; i < dotsAmount; i++) {
    const col = threeColors[Math.floor(Math.random() * threeColors.length)];
    const theta = Math.random() * Math.PI * 2;
    const phi = (1 - Math.sqrt(Math.random())) * Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);

    const x = Math.cos(theta) * Math.cos(phi) * (120 + (Math.random() - 0.5) * 5);
    const y = Math.sin(phi) * (120 + (Math.random() - 0.5) * 5);
    const z = Math.sin(theta) * Math.cos(phi) * (120 + (Math.random() - 0.5) * 5);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    sizes[i] = 5;
    col.toArray(colorsAttr, i * 3);

    // For oscillation: random offset target
    const drift = (Math.random() - 0.5) * 0.2 + 1;
    particles.push({
      baseX: x, baseY: y, baseZ: z,
      targetX: x * drift, targetY: y * drift, targetZ: z * drift,
      phase: Math.random() * Math.PI * 2,
      period: (Math.random() * 3 + 3) * 1000, // 3-6 seconds in ms
      scaleX: 5,
      colorIdx: threeColors.indexOf(col),
    });
  }

  // Shader material
  const vertexShader = `
    attribute float size;
    attribute vec3 color;
    varying vec3 vColor;
    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (350.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  const fragmentShader = `
    varying vec3 vColor;
    uniform sampler2D uTexture;
    void main() {
      vec4 texColor = texture2D(uTexture, gl_PointCoord);
      if (texColor.a < 0.3) discard;
      gl_FragColor = vec4(vColor, 1.0) * texColor;
    }
  `;

  const geom = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  geom.setAttribute('position', posAttr);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1);
  geom.setAttribute('size', sizeAttr);
  geom.setAttribute('color', new THREE.BufferAttribute(colorsAttr, 3));

  const shaderMat = new THREE.ShaderMaterial({
    uniforms: { uTexture: { value: dotTexture } },
    vertexShader,
    fragmentShader,
    transparent: true,
  });
  const wrap = new THREE.Points(geom, shaderMat);
  scene.add(wrap);

  // Line segments between nearby particles
  const segPositions = [];
  const segColors = [];
  const basePositions = particles.map(p => [p.baseX, p.baseY, p.baseZ]);
  for (let i = 0; i < dotsAmount; i++) {
    const ax = basePositions[i][0], ay = basePositions[i][1], az = basePositions[i][2];
    for (let j = i + 1; j < dotsAmount; j++) {
      const bx = basePositions[j][0], by = basePositions[j][1], bz = basePositions[j][2];
      const dx = ax-bx, dy = ay-by, dz = az-bz;
      if (dx*dx + dy*dy + dz*dz < 144) { // distance < 12
        segPositions.push(ax, ay, az, bx, by, bz);
        const c = threeColors[particles[i].colorIdx];
        segColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
  }

  let segments = null;
  if (segPositions.length > 0) {
    const segGeom = new THREE.BufferGeometry();
    const segPosArr = new Float32Array(segPositions);
    const segColArr = new Float32Array(segColors);
    segGeom.setAttribute('position', new THREE.BufferAttribute(segPosArr, 3));
    segGeom.setAttribute('color', new THREE.BufferAttribute(segColArr, 3));
    const segMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
    });
    segments = new THREE.LineSegments(segGeom, segMat);
    galaxy.add(segments);
  }

  // Raycaster for hover
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 6;
  const mouse = new THREE.Vector2(-100, -100);
  let prevHovered = [];

  const canvas = renderer.domElement;
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }
  if (cfg.mouse) canvas.addEventListener('mousemove', onMouseMove);

  let raf = 0;
  let running = false;

  function render(a) {
    if (!running) return;
    const spd = cfg.speed;

    // Oscillate particles (replaces TweenMax yoyo)
    for (let i = 0; i < dotsAmount; i++) {
      const p = particles[i];
      const t = Math.sin((a * spd / p.period) + p.phase) * 0.5 + 0.5; // 0..1
      positions[i * 3] = p.baseX + (p.targetX - p.baseX) * t;
      positions[i * 3 + 1] = p.baseY + (p.targetY - p.baseY) * t;
      positions[i * 3 + 2] = p.baseZ + (p.targetZ - p.baseZ) * t;
    }
    posAttr.needsUpdate = true;

    // Raycaster hover
    if (cfg.mouse) {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects([wrap]);
      const hovered = [];
      for (const hit of hits) {
        const idx = hit.index;
        hovered.push(idx);
        if (prevHovered.indexOf(idx) === -1) {
          // hover in — scale up (spring replaced with simple target)
          particles[idx].scaleX = 10;
        }
      }
      for (const idx of prevHovered) {
        if (hovered.indexOf(idx) === -1) {
          particles[idx].scaleX = 5;
        }
      }
      prevHovered = hovered;
    }

    // Update sizes with lerp
    for (let i = 0; i < dotsAmount; i++) {
      sizes[i] += (particles[i].scaleX - sizes[i]) * 0.15;
    }
    sizeAttr.needsUpdate = true;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      if (cfg.mouse) canvas.removeEventListener('mousemove', onMouseMove);
      scene.remove(wrap, galaxy);
      renderer.dispose();
    },
  };
}

// ==================== CollapseEngine ====================
// Faithful recreation of Codrops DecorativeBackgrounds demo2
// Original: GSAP TweenMax yoyo with Back.easeOut on icosahedron particles
function CollapseEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  camera.position.set(0, 0, cfg.camera || 80);
  camera.fov = 50;
  camera.updateProjectionMatrix();

  // Hard circle texture matching original's dotTexture.png:
  // Fully opaque to ~94% radius, then sharp 2-pixel anti-aliased edge
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = dotCanvas.height = 64;
  const dotCtx = dotCanvas.getContext('2d');
  const dg = dotCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  dg.addColorStop(0, 'rgba(255,255,255,1)');
  dg.addColorStop(0.91, 'rgba(255,255,255,1)');
  dg.addColorStop(0.96, 'rgba(255,255,255,0.5)');
  dg.addColorStop(1, 'rgba(255,255,255,0)');
  dotCtx.fillStyle = dg;
  dotCtx.fillRect(0, 0, 64, 64);
  const dotTexture = new THREE.CanvasTexture(dotCanvas);

  const radius = 50;

  // IcosahedronGeometry detail 6 — 40,962 unique vertices (original uses detail 5
  // with 10,242 but with a native PNG texture; 4× density compensates for any
  // remaining texture differences and creates a richer mesh pattern)
  const icoGeom = new THREE.IcosahedronGeometry(radius, 6);
  const icoPos = icoGeom.getAttribute('position');
  const count = icoPos.count;

  const positions = new Float32Array(count * 3);
  const origX = new Float32Array(count);
  const origY = new Float32Array(count);
  const origZ = new Float32Array(count);
  const delays = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const x = icoPos.getX(i);
    const y = icoPos.getY(i);
    const z = icoPos.getZ(i);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    origX[i] = x;
    origY[i] = y;
    origZ[i] = z;
    delays[i] = Math.abs(y / radius) * 2;
  }

  const vertexShader = `
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = 3.0;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  // Exact original shader: vec4(0.06, 0.18, 0.36, 0.4) * textureColor
  const userColors = cfg.colors;
  const dotR = userColors.length ? new THREE.Color(userColors[0]).r.toFixed(3) : '0.06';
  const dotG = userColors.length ? new THREE.Color(userColors[0]).g.toFixed(3) : '0.18';
  const dotB = userColors.length ? new THREE.Color(userColors[0]).b.toFixed(3) : '0.36';
  const fragmentShader = `
    uniform sampler2D uTexture;
    void main() {
      vec4 texColor = texture2D(uTexture, gl_PointCoord);
      if (texColor.a < 0.3) discard;
      vec4 dotColor = vec4(${dotR}, ${dotG}, ${dotB}, 0.4);
      gl_FragColor = dotColor * texColor;
    }
  `;

  const geom = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  geom.setAttribute('position', posAttr);

  const shaderMat = new THREE.ShaderMaterial({
    uniforms: { uTexture: { value: dotTexture } },
    vertexShader,
    fragmentShader,
    transparent: true,
  });
  const dots = new THREE.Points(geom, shaderMat);
  scene.add(dots);

  // Mouse → smooth rotation (matching GSAP TweenMax.to with 4s ease)
  let targetRotX = 0, targetRotZ = 0;
  const canvas = renderer.domElement;
  function onMouseMove(e) {
    const mx = (e.clientX / window.innerWidth) - 0.5;
    const my = (e.clientY / window.innerHeight) - 0.5;
    targetRotX = my * Math.PI * 0.5;
    targetRotZ = mx * Math.PI * 0.2;
  }
  if (cfg.mouse) canvas.addEventListener('mousemove', onMouseMove);

  let raf = 0;
  let running = false;
  const DURATION = 4; // seconds per direction (collapse or expand)
  const CYCLE = DURATION * 2; // 8 seconds total: 4s collapse + 4s expand

  function render(a) {
    if (!running) return;
    const timeSec = a / 1000 * cfg.speed;

    for (let i = 0; i < count; i++) {
      const d = delays[i];
      if (timeSec < d) {
        // Before initial delay: particle at original position
        positions[i * 3] = origX[i];
        positions[i * 3 + 2] = origZ[i];
        continue;
      }
      // After initial delay, enter repeating 8-second cycle
      // (GSAP repeat:-1 delay only applies to first iteration)
      const elapsed = (timeSec - d) % CYCLE;
      let factor;
      if (elapsed < DURATION) {
        // Collapsing: x,z → 0 with Back.easeOut
        factor = easeBackOut(elapsed / DURATION);
        positions[i * 3] = origX[i] * (1 - factor);
        positions[i * 3 + 2] = origZ[i] * (1 - factor);
      } else {
        // Expanding (yoyo): 0 → x,z with Back.easeOut (yoyoEase)
        factor = easeBackOut((elapsed - DURATION) / DURATION);
        positions[i * 3] = origX[i] * factor;
        positions[i * 3 + 2] = origZ[i] * factor;
      }
    }
    posAttr.needsUpdate = true;

    // Smooth rotation — exponential approach matching GSAP's ~4s Power1.easeOut
    // At 60fps, factor ~0.008 gives ~4 second convergence (reaches 95% in ~4s)
    dots.rotation.x += (targetRotX - dots.rotation.x) * 0.008;
    dots.rotation.z += (targetRotZ - dots.rotation.z) * 0.008;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      if (cfg.mouse) canvas.removeEventListener('mousemove', onMouseMove);
      scene.remove(dots);
      renderer.dispose();
    },
  };
}

// ==================== Palette Texture ====================
// Actual AIGNE landscape palette (10x1024 PNG, base64-encoded, ~1KB)
const PALETTE_V1_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAQACAYAAADY5sjIAAAACXBIWXMAAAsTAAALEwEAmpwYAAABZWlDQ1BEaXNwbGF5IFAzAAB4nHWQvUvDUBTFT6tS0DqIDh0cMolD1NIKdnFoKxRFMFQFq1OafgltfCQpUnETVyn4H1jBWXCwiFRwcXAQRAcR3Zw6KbhoeN6XVNoi3sfl/Ticc7lcwBtQGSv2AijplpFMxKS11Lrke4OHnlOqZrKooiwK/v276/PR9d5PiFlNu3YQ2U9cl84ul3aeAlN//V3Vn8maGv3f1EGNGRbgkYmVbYsJ3iUeMWgp4qrgvMvHgtMunzuelWSc+JZY0gpqhrhJLKc79HwHl4plrbWD2N6f1VeXxRzqUcxhEyYYilBRgQQF4X/8044/ji1yV2BQLo8CLMpESRETssTz0KFhEjJxCEHqkLhz634PrfvJbW3vFZhtcM4v2tpCAzidoZPV29p4BBgaAG7qTDVUR+qh9uZywPsJMJgChu8os2HmwiF3e38M6Hvh/GMM8B0CdpXzryPO7RqFn4Er/QfBIQM2AAACaklEQVR4Ae3dr0tDURTA8d1xFIM/GCg4RE1aTYo20WQwaBAEk8FoNdoE/wL9AwSZGPQPGMIMW3BgWVsYGJQFHWhwInuuW87Q+ziHfR/YPuk+zrn3nHPfDCG/lGQUTzajfID/A2Xg+62igSGXy/EKLULp/vEKgcAYwdXpdAgu15D86B7K4tqWCrKOKUNZXJ3XBVepWSS4LMIwtbRRVkGqOCCwJxiOC7PETH9AKV+tqyDrmDJk57IK6T+6h9TXQGAkSP/RPSQ/uofSGppTQdYxZShJogsuCSGzrIEseMpQRtoN8iMQyPkR+Pvh/AgERoLymR3TBRctZKOQEZt7yOTMKpSVnaIKso7uIVucVcjJ3iqkvnYPqa+BwEiQ/OgehsLDhep+uORn8ozYLEIp3u2rIOtoFdIisQpDo7KnzI/jXEEAAntJe2fXLeYzriHzGSAQCPwjDO36HonUIpTNo0EVZB1ThvLyVKf/6BoynwECI0HmM+4h+dE95GRvFdJ/dA/DZbWgm89MTY8znwECe8iPk181XX5kizMKJZMkuk/ou5sc+dEilJPqvQqyjlYhxZlVSH0NBEaC9B/dQ/Kje8j/V7AK+f66fyAtZKuQncsq5PzoHnJ+BAIjQfKje0h+BAIjQfKje0h+BAIjQdnfmeF+j2soj8Pbuvs97ewY93ssQjrDViE/btA/kCi0ConC/oH8EFrKMNzWbnTfz+QmRjg/WoTsXFahbO+u6OrrUrPIK7QIZeHjWldfD3XeyY8WIZ1hq5D5jHvIfAYIjATJj+6hHJ6PqiDrCARGgsyvrUI5OBVdff38mqW+tgh/ACjG5pycAQerAAAAAElFTkSuQmCC';

function createPaletteTexture(THREE) {
  // Both v1 and v2 use the same AIGNE palette texture
  const tex = new THREE.Texture();
  const img = new Image();
  img.onload = function() {
    tex.image = img;
    tex.needsUpdate = true;
  };
  img.src = PALETTE_V1_B64;
  return tex;
}

// ==================== Theme Palette Generator ====================
function createThemePalette(THREE, stops) {
  const c = document.createElement('canvas');
  c.width = 10; c.height = 1024;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  for (let i = 0; i < stops.length; i++) {
    g.addColorStop(i / (stops.length - 1), stops[i]);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 10, 1024);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// ==================== Sky Shader ====================
function createSkyMesh(THREE) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const uniforms = {
    luminance: { value: 1 },
    turbidity: { value: 2 },
    rayleigh: { value: 1 },
    mieCoefficient: { value: 0.005 },
    mieDirectionalG: { value: 0.8 },
    sunPosition: { value: new THREE.Vector3() },
  };

  const vertex = [
    'uniform vec3 sunPosition;',
    'uniform float rayleigh;',
    'uniform float turbidity;',
    'uniform float mieCoefficient;',
    'varying vec3 vWorldPosition;',
    'varying vec3 vSunDirection;',
    'varying float vSunfade;',
    'varying vec3 vBetaR;',
    'varying vec3 vBetaM;',
    'varying float vSunE;',
    'const vec3 up = vec3(0.0, 1.0, 0.0);',
    'const float e = 2.71828182845904523536028747135266249775724709369995957;',
    'const float pi = 3.141592653589793238462643383279502884197169;',
    'const vec3 lambda = vec3(680E-9, 550E-9, 450E-9);',
    'const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);',
    'const float v = 4.0;',
    'const vec3 K = vec3(0.686, 0.678, 0.666);',
    'const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);',
    'const float cutoffAngle = 1.6110731556870734;',
    'const float steepness = 1.5;',
    'const float EE = 1000.0;',
    'float sunIntensity(float zenithAngleCos) {',
    '  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);',
    '  return EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zenithAngleCos)) / steepness)));',
    '}',
    'vec3 totalMie(float T) {',
    '  float c = (0.2 * T) * 10E-18;',
    '  return 0.434 * c * MieConst;',
    '}',
    'void main() {',
    '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
    '  vWorldPosition = worldPosition.xyz;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position.z = gl_Position.w;',
    '  vSunDirection = normalize(sunPosition);',
    '  vSunE = sunIntensity(dot(vSunDirection, up));',
    '  vSunfade = 1.0 - clamp(1.0 - exp((sunPosition.y / 450000.0)), 0.0, 1.0);',
    '  float rayleighCoefficient = rayleigh - (1.0 * (1.0 - vSunfade));',
    '  vBetaR = totalRayleigh * rayleighCoefficient;',
    '  vBetaM = totalMie(turbidity) * mieCoefficient;',
    '}',
  ].join('\n');

  const fragment = [
    'varying vec3 vWorldPosition;',
    'varying vec3 vSunDirection;',
    'varying float vSunfade;',
    'varying vec3 vBetaR;',
    'varying vec3 vBetaM;',
    'varying float vSunE;',
    'uniform float luminance;',
    'uniform float mieDirectionalG;',
    'const vec3 cameraPos = vec3(0.0, 0.0, 0.0);',
    'const float pi = 3.141592653589793238462643383279502884197169;',
    'const float n = 1.0003;',
    'const float N = 2.545E25;',
    'const float rayleighZenithLength = 8.4E3;',
    'const float mieZenithLength = 1.25E3;',
    'const vec3 up = vec3(0.0, 1.0, 0.0);',
    'const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;',
    'const float THREE_OVER_SIXTEENPI = 0.05968310365946075;',
    'const float ONE_OVER_FOURPI = 0.07957747154594767;',
    'float rayleighPhase(float cosTheta) {',
    '  return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0));',
    '}',
    'float hgPhase(float cosTheta, float g) {',
    '  float g2 = pow(g, 2.0);',
    '  float inverse = 1.0 / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);',
    '  return ONE_OVER_FOURPI * ((1.0 - g2) * inverse);',
    '}',
    'const float A = 0.15;',
    'const float B = 0.50;',
    'const float C = 0.10;',
    'const float D = 0.20;',
    'const float E = 0.02;',
    'const float F = 0.30;',
    'const float whiteScale = 1.0748724675633854;',
    'vec3 Uncharted2Tonemap(vec3 x) {',
    '  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;',
    '}',
    'void main() {',
    '  float zenithAngle = acos(max(0.0, dot(up, normalize(vWorldPosition - cameraPos))));',
    '  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));',
    '  float sR = rayleighZenithLength * inverse;',
    '  float sM = mieZenithLength * inverse;',
    '  vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));',
    '  float cosTheta = dot(normalize(vWorldPosition - cameraPos), vSunDirection);',
    '  float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);',
    '  vec3 betaRTheta = vBetaR * rPhase;',
    '  float mPhase = hgPhase(cosTheta, mieDirectionalG);',
    '  vec3 betaMTheta = vBetaM * mPhase;',
    '  vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));',
    '  Lin *= mix(vec3(1.0), pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(1.0 / 2.0)), clamp(pow(1.0 - dot(up, vSunDirection), 5.0), 0.0, 1.0));',
    '  vec3 direction = normalize(vWorldPosition - cameraPos);',
    '  float theta = acos(direction.y);',
    '  float phi = atan(direction.z, direction.x);',
    '  vec2 uv = vec2(phi, theta) / vec2(2.0 * pi, pi) + vec2(0.5, 0.0);',
    '  vec3 L0 = vec3(0.1) * Fex;',
    '  float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);',
    '  L0 += (vSunE * 19000.0 * Fex) * sundisk;',
    '  vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);',
    '  vec3 curr = Uncharted2Tonemap((log2(2.0 / pow(luminance, 4.0))) * texColor);',
    '  vec3 color = curr * whiteScale;',
    '  vec3 retColor = pow(color, vec3(1.0 / (1.2 + (1.2 * vSunfade))));',
    '  gl_FragColor = vec4(retColor, 1.0);',
    '}',
  ].join('\n');

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(uniforms),
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
  });

  return new THREE.Mesh(geometry, material);
}

// ==================== GLSL Perlin Noise (shared) ====================
const GLSL_CNOISE = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  vec3 fade(vec3 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

  float cnoise(vec3 P) {
    vec3 Pi0 = floor(P);
    vec3 Pi1 = Pi0 + vec3(1.0);
    Pi0 = mod289(Pi0);
    Pi1 = mod289(Pi1);
    vec3 Pf0 = fract(P);
    vec3 Pf1 = Pf0 - vec3(1.0);
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;
    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);
    vec4 gx0 = ixy0 * (1.0 / 7.0);
    vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);
    vec4 gx1 = ixy1 * (1.0 / 7.0);
    vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);
    vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
    vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
    vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
    vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
    vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
    vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
    vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
    vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000), dot(g010,g010), dot(g100,g100), dot(g110,g110)));
    g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001), dot(g011,g011), dot(g101,g101), dot(g111,g111)));
    g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);
    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 2.2 * n_xyz;
  }
`;

// ==================== Terrain Shaders ====================
const TERRAIN_VERTEX = GLSL_CNOISE + `
  #define PI 3.1415926535897932384626433832795
  uniform float time;
  uniform float maxHeight;
  uniform float speed;
  uniform float distortCenter;
  uniform float roadWidth;
  varying float vDisplace;
  varying float fogDepth;

  void main() {
    float t = time * speed;
    float wRoad = distortCenter;
    float angleCenter = uv.y * PI * 4.0;
    angleCenter += t * 0.9;
    float centerOff = (sin(angleCenter) + sin(angleCenter * 0.5)) * wRoad;
    vec3 noiseIn = vec3(uv, 1.0) * 10.0;
    float noise = cnoise(vec3(noiseIn.x, noiseIn.y + t, noiseIn.z));
    noise += 1.0;
    float h = noise;
    float angle = (uv.x - centerOff) * PI;
    float f = abs(cos(angle));
    h *= pow(f, 1.5 + roadWidth);
    vDisplace = h;
    h *= maxHeight;
    vec3 transformed = vec3(position.x, position.y, position.z + h);
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    fogDepth = -mvPosition.z;
  }
`;

const TERRAIN_FRAGMENT = `
  uniform float time;
  uniform vec3 color;
  uniform sampler2D pallete;
  varying float vDisplace;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying float fogDepth;

  void main() {
    vec2 stripPos = vec2(0.0, vDisplace);
    vec4 stripColor = texture2D(pallete, stripPos);
    stripColor *= pow(1.0 - vDisplace, 1.0);
    gl_FragColor = stripColor;
    #ifdef USE_FOG
      float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
    #endif
  }
`;

// ==================== LandscapeEngine ====================
const LANDSCAPE_THEMES = {
  v1:   { fog: 0xffffff, fogNear: 10, turbidity: 20, rayleigh: 0, luminance: 1.16, mieCoeff: 0.08, mieG: 0.58, skyScale: 4500000, sunTheta: -0.02, palette: null, wireframe: false },
  v2:   { fog: 0x333333, fogNear: 0, turbidity: 13, rayleigh: 1.2, luminance: 1.12, mieCoeff: 0.15, mieG: 0.5, skyScale: 450000, sunTheta: -0.01, palette: null, wireframe: false },
  moon: { fog: 0x0a0a14, fogNear: 0, turbidity: 2, rayleigh: 0.3, luminance: 1.17, mieCoeff: 0.005, mieG: 0.95, skyScale: 450000, sunTheta: 0.015, palette: null, wireframe: false },
  snow: { fog: 0xc8d8e8, fogNear: 10, turbidity: 2, rayleigh: 2.0, luminance: 1.1, mieCoeff: 0.01, mieG: 0.7, skyScale: 450000, sunTheta: -0.03, paletteStops: ['#1a2a3a','#8ba5b5','#c8d8e4','#ffffff'], wireframe: false },
  neon: { fog: 0x000000, fogNear: 0, turbidity: 2, rayleigh: 0, luminance: 0.01, mieCoeff: 0.001, mieG: 0.1, skyScale: 450000, sunTheta: 0.05, paletteStops: ['#000000','#0a0015','#ff00ff','#00ffff'], wireframe: true },
  mars: { fog: 0x1a0800, fogNear: 5, turbidity: 15, rayleigh: 0.5, luminance: 1.0, mieCoeff: 0.1, mieG: 0.6, skyScale: 450000, sunTheta: -0.015, paletteStops: ['#1a0800','#8b3a0e','#c4622d','#e8a878'], wireframe: false },
};

function LandscapeEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  const canvas = renderer.domElement;
  let width = canvas.offsetWidth || canvas.clientWidth || 800;
  let height = canvas.offsetHeight || canvas.clientHeight || 600;

  // Resolve theme: @theme > @star/@style legacy mapping
  let themeKey = cfg.theme;
  if (!themeKey) {
    if (cfg.star === 'moon') themeKey = 'moon';
    else themeKey = cfg.style === 'v2' ? 'v2' : 'v1';
  }
  const theme = LANDSCAPE_THEMES[themeKey] || LANDSCAPE_THEMES.v1;
  const isV2 = themeKey === 'v2';

  // Match Three.js r85 behavior: linear color space
  if (renderer.outputColorSpace !== undefined) {
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  }
  const fogColor = new THREE.Color(theme.fog);
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, theme.fogNear, 400);
  renderer.setClearColor(fogColor, 1);

  camera.fov = 60;
  camera.near = 0.1;
  camera.far = 10000;
  camera.position.set(0, 8, 4);
  camera.updateProjectionMatrix();

  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);

  // Sky
  const sky = createSkyMesh(THREE);
  sky.scale.setScalar(theme.skyScale);
  sky.material.uniforms.turbidity.value = theme.turbidity;
  sky.material.uniforms.rayleigh.value = theme.rayleigh;
  sky.material.uniforms.luminance.value = theme.luminance;
  sky.material.uniforms.mieCoefficient.value = theme.mieCoeff;
  sky.material.uniforms.mieDirectionalG.value = theme.mieG;
  scene.add(sky);

  // Sun position
  const defaultTheta = cfg.sun ? -cfg.sun : theme.sunTheta;
  const theta = Math.PI * defaultTheta;
  const phi = 2 * Math.PI * -0.25;
  const sunPos = new THREE.Vector3(
    400000 * Math.cos(phi),
    400000 * Math.sin(phi) * Math.sin(theta),
    400000 * Math.sin(phi) * Math.cos(theta)
  );
  sky.material.uniforms.sunPosition.value.copy(sunPos);

  // Terrain
  const terrainGeom = new THREE.PlaneGeometry(100, 400, 400, 400);
  const terrainUniforms = {
    time: { type: 'f', value: 0.0 },
    distortCenter: { type: 'f', value: 0.1 },
    roadWidth: { type: 'f', value: 0.5 },
    pallete: { type: 't', value: null },
    speed: { type: 'f', value: cfg.speed * 0.5 },
    maxHeight: { type: 'f', value: 10.0 },
    color: new THREE.Color(1, 1, 1),
  };

  const terrainMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.ShaderLib.basic.uniforms,
      terrainUniforms,
    ]),
    vertexShader: TERRAIN_VERTEX,
    fragmentShader: TERRAIN_FRAGMENT,
    wireframe: theme.wireframe,
    fog: true,
  });

  const terrain = new THREE.Mesh(terrainGeom, terrainMat);
  terrain.position.z = -180;
  terrain.rotation.x = -Math.PI / 2;
  scene.add(terrain);

  // Load palette texture
  if (cfg.palette) {
    new THREE.TextureLoader().load(cfg.palette, function(texture) {
      terrain.material.uniforms.pallete.value = texture;
      terrain.material.needsUpdate = true;
    });
  } else if (theme.paletteStops) {
    const stops = cfg.colors.length >= 2 ? cfg.colors : theme.paletteStops;
    terrain.material.uniforms.pallete.value = createThemePalette(THREE, stops);
    terrain.material.needsUpdate = true;
  } else {
    terrain.material.uniforms.pallete.value = createPaletteTexture(THREE);
    terrain.material.needsUpdate = true;
  }

  // Mouse interaction
  const mouse = { x: 0, y: 0, xDamped: 0, yDamped: 0 };
  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }
  if (cfg.mouse) window.addEventListener('mousemove', onMouseMove);

  function map(value, start1, stop1, start2, stop2) {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
  }
  function lerp(start, end, amt) { return (1 - amt) * start + amt * end; }

  let raf = 0;
  let running = false;

  function render() {
    if (!running) return;

    mouse.xDamped = lerp(mouse.xDamped, mouse.x, 0.1);
    mouse.yDamped = lerp(mouse.yDamped, mouse.y, 0.1);

    const time = performance.now() * 0.001;
    terrain.material.uniforms.time.value = time;

    if (isV2) {
      terrain.material.uniforms.distortCenter.value = Math.sin(time) * 0.1;
      terrain.material.uniforms.roadWidth.value = map(mouse.xDamped, 0, width, 1, 4.5);
      camera.position.y = map(mouse.yDamped, 0, height, 4, 11);
    } else {
      terrain.material.uniforms.distortCenter.value = map(mouse.xDamped, 0, width, -0.1, 0.1);
      terrain.material.uniforms.roadWidth.value = map(mouse.yDamped, 0, height, -0.5, 2.5);
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      if (cfg.mouse) window.removeEventListener('mousemove', onMouseMove);
      scene.remove(terrain, sky, ambientLight);
      renderer.dispose();
    },
  };
}

// ==================== OceanEngine ====================
function OceanEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  const canvas = renderer.domElement;
  let height = canvas.offsetHeight || canvas.clientHeight || 600;

  if (renderer.outputColorSpace !== undefined) {
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  }

  const userColors = cfg.colors.length >= 2 ? cfg.colors : ['#0a1628', '#1a6b7a'];
  const deepColor = new THREE.Color(userColors[0]);
  const shallowColor = new THREE.Color(userColors[1]);

  const fogColor = new THREE.Color(0x0a1628);
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, 50, 300);
  renderer.setClearColor(fogColor, 1);

  camera.fov = 60;
  camera.near = 0.1;
  camera.far = 2000;
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 0, -100);
  camera.updateProjectionMatrix();

  const ambientLight = new THREE.AmbientLight(0x446688, 0.6);
  scene.add(ambientLight);

  // Sky — sunset palette
  const sky = createSkyMesh(THREE);
  sky.scale.setScalar(450000);
  sky.material.uniforms.turbidity.value = 10;
  sky.material.uniforms.rayleigh.value = 2;
  sky.material.uniforms.luminance.value = 1.1;
  sky.material.uniforms.mieCoefficient.value = 0.05;
  sky.material.uniforms.mieDirectionalG.value = 0.8;
  const theta = Math.PI * -0.01;
  const phi = 2 * Math.PI * -0.25;
  sky.material.uniforms.sunPosition.value.set(
    400000 * Math.cos(phi),
    400000 * Math.sin(phi) * Math.sin(theta),
    400000 * Math.sin(phi) * Math.cos(theta)
  );
  scene.add(sky);

  // Ocean plane with sin-wave technique (afl_ext inspired, faster + more realistic)
  const oceanGeom = new THREE.PlaneGeometry(200, 400, 200, 200);
  const oceanVert = `
    uniform float time;
    uniform float speed;
    varying float vHeight;
    varying float fogDepth;
    // Multi-octave sin wave with derivatives
    vec2 wavedx(vec2 pos, vec2 dir, float freq, float timeshift) {
      float x = dot(dir, pos) * freq + timeshift;
      float wave = exp(sin(x) - 1.0);
      float dx = wave * cos(x);
      return vec2(wave, -dx);
    }
    float getwaves(vec2 pos, float t) {
      float w = 0.0;
      float ws = 0.0;
      float iter = 0.0;
      float freq = 1.0;
      float amp = 1.0;
      float choppy = 2.0;
      float speed2 = t * 0.8;
      for (int i = 0; i < 12; i++) {
        vec2 dir = vec2(sin(iter), cos(iter));
        vec2 res = wavedx(pos, dir, freq, speed2);
        pos += dir * res.y * amp * choppy;
        w += res.x * amp;
        ws += amp;
        iter += 1.232;
        amp *= 0.5;
        freq *= 1.18;
        choppy = mix(choppy, 1.0, 0.2);
      }
      return w / ws;
    }
    void main() {
      vec3 p = position;
      float t = time * speed;
      float h = getwaves(p.xy * 0.04, t) * 5.0 - 2.5;
      vHeight = h * 0.15 + 0.5;
      p.z += h;
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      fogDepth = -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  const oceanFrag = `
    uniform vec3 deepColor;
    uniform vec3 shallowColor;
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;
    varying float vHeight;
    varying float fogDepth;
    void main() {
      vec3 col = mix(deepColor, shallowColor, clamp(vHeight, 0.0, 1.0));
      // Wave crest highlight
      float crest = smoothstep(0.65, 0.85, vHeight);
      col += vec3(0.15, 0.2, 0.25) * crest;
      gl_FragColor = vec4(col, 1.0);
      float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
    }
  `;

  const oceanMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      speed: { value: cfg.speed },
      deepColor: { value: deepColor },
      shallowColor: { value: shallowColor },
      fogColor: { value: fogColor },
      fogNear: { value: 50.0 },
      fogFar: { value: 300.0 },
    },
    vertexShader: oceanVert,
    fragmentShader: oceanFrag,
  });

  const ocean = new THREE.Mesh(oceanGeom, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.z = -120;
  scene.add(ocean);

  // Mouse — camera height
  let mouseY = 0.5, curMY = 0.5;
  function onMouseMove(e) { mouseY = e.clientY / window.innerHeight; }
  if (cfg.mouse) window.addEventListener('mousemove', onMouseMove);

  let raf = 0;
  let running = false;

  function render() {
    if (!running) return;
    curMY += (mouseY - curMY) * 0.03;
    camera.position.y = 2 + curMY * 6;

    oceanMat.uniforms.time.value = performance.now() * 0.001;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      if (cfg.mouse) window.removeEventListener('mousemove', onMouseMove);
      scene.remove(ocean, sky, ambientLight);
      renderer.dispose();
    },
  };
}

// ==================== AuroraEngine ====================
function AuroraEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;

  const fogColor = new THREE.Color(0x020510);
  scene.background = fogColor;
  renderer.setClearColor(fogColor, 1);

  camera.fov = 60;
  camera.near = 0.1;
  camera.far = 2000;
  camera.position.set(0, 2, 10);
  camera.lookAt(0, 8, -50);
  camera.updateProjectionMatrix();

  // Stars
  const starCount = 500;
  const starPositions = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 400;
    starPositions[i * 3 + 1] = Math.random() * 150 + 10;
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 400;
    starSizes[i] = Math.random() * 2 + 0.5;
  }
  const starGeom = new THREE.BufferGeometry();
  starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeom.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      attribute float size;
      uniform float time;
      varying float vAlpha;
      void main() {
        vAlpha = 0.5 + 0.5 * sin(time * 2.0 + position.x * 0.1 + position.z * 0.1);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float alpha = (1.0 - d) * vAlpha;
        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
      }
    `,
    transparent: true,
  });
  const stars = new THREE.Points(starGeom, starMat);
  scene.add(stars);

  // Aurora curtain
  const userColors = cfg.colors.length >= 3 ? cfg.colors : ['#00ff88', '#8844ff', '#4488ff'];
  const c0 = new THREE.Color(userColors[0]);
  const c1 = new THREE.Color(userColors[1]);
  const c2 = new THREE.Color(userColors[2]);

  const auroraGeom = new THREE.PlaneGeometry(300, 80, 1, 1);
  const auroraVert = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const auroraFrag = GLSL_CNOISE + `
    uniform float time;
    uniform vec3 color0;
    uniform vec3 color1;
    uniform vec3 color2;
    varying vec2 vUv;
    void main() {
      float t = time * 0.3;
      // Vertical curtain wave
      float wave = sin(vUv.x * 12.0 + t * 2.0) * 0.5 + 0.5;
      float noise = cnoise(vec3(vUv.x * 4.0 + t, vUv.y * 2.0, t * 0.5));
      noise = noise * 0.5 + 0.5;

      // Color bands based on vertical position
      vec3 col;
      float band = vUv.y + noise * 0.3;
      if (band < 0.33) col = mix(color0, color1, band * 3.0);
      else if (band < 0.66) col = mix(color1, color2, (band - 0.33) * 3.0);
      else col = mix(color2, color0, (band - 0.66) * 3.0);

      // Edge fade
      float edgeX = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
      float edgeY = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
      float alpha = wave * noise * edgeX * edgeY * 0.7;

      gl_FragColor = vec4(col, alpha);
    }
  `;

  const auroraMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color0: { value: c0 },
      color1: { value: c1 },
      color2: { value: c2 },
    },
    vertexShader: auroraVert,
    fragmentShader: auroraFrag,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const aurora = new THREE.Mesh(auroraGeom, auroraMat);
  aurora.position.set(0, 40, -80);
  scene.add(aurora);

  // Camera sway
  let mouseX = 0.5;
  function onMouseMove(e) { mouseX = e.clientX / window.innerWidth; }
  if (cfg.mouse) window.addEventListener('mousemove', onMouseMove);

  let raf = 0;
  let running = false;

  function render() {
    if (!running) return;
    const t = performance.now() * 0.001;
    auroraMat.uniforms.time.value = t;
    starMat.uniforms.time.value = t;

    // Subtle camera sway
    camera.position.x += ((mouseX - 0.5) * 4 - camera.position.x) * 0.02;
    camera.rotation.y = Math.sin(t * 0.1) * 0.02;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      if (cfg.mouse) window.removeEventListener('mousemove', onMouseMove);
      scene.remove(aurora, stars);
      renderer.dispose();
    },
  };
}

// ==================== TopoEngine ====================
function TopoEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;

  const userColors = cfg.colors.length >= 2 ? cfg.colors : ['#3a7bd5', '#0a0a14'];
  const lineColor = new THREE.Color(userColors[0]);
  const bgColor = new THREE.Color(userColors[1]);

  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  camera.fov = 45;
  camera.near = 0.1;
  camera.far = 100;
  camera.position.set(0, 0, 15);
  camera.updateProjectionMatrix();

  const topoGeom = new THREE.PlaneGeometry(30, 20, 1, 1);
  const topoVert = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const topoFrag = GLSL_CNOISE + `
    uniform float time;
    uniform vec2 mouse;
    uniform vec3 lineColor;
    uniform vec3 bgColor;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 6.0 + mouse * 0.5;
      float t = time * 0.15;

      // Multi-octave noise heightfield
      float h = 0.0;
      h += cnoise(vec3(p * 1.0, t)) * 1.0;
      h += cnoise(vec3(p * 2.0, t + 10.0)) * 0.5;
      h += cnoise(vec3(p * 4.0, t + 20.0)) * 0.25;

      // Contour lines via fract + fwidth
      float levels = 20.0;
      float scaled = h * levels;
      float line = abs(fract(scaled) - 0.5);
      float fw = fwidth(scaled);
      float contour = 1.0 - smoothstep(fw * 0.5, fw * 1.5, line);

      // Every 5th line thicker (major contour)
      float major = abs(fract(scaled / 5.0) - 0.5);
      float fwMajor = fwidth(scaled / 5.0);
      float majorContour = 1.0 - smoothstep(fwMajor * 0.3, fwMajor * 1.2, major);

      float alpha = max(contour * 0.4, majorContour * 0.9);

      vec3 col = mix(bgColor, lineColor, alpha);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const topoMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      mouse: { value: new THREE.Vector2(0, 0) },
      lineColor: { value: lineColor },
      bgColor: { value: bgColor },
    },
    vertexShader: topoVert,
    fragmentShader: topoFrag,
  });

  const topo = new THREE.Mesh(topoGeom, topoMat);
  scene.add(topo);

  let mouseX = 0, mouseY = 0;
  function onMouseMove(e) {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }
  if (cfg.mouse) window.addEventListener('mousemove', onMouseMove);

  let raf = 0;
  let running = false;

  function render() {
    if (!running) return;
    topoMat.uniforms.time.value = performance.now() * 0.001 * cfg.speed;
    topoMat.uniforms.mouse.value.set(mouseX, mouseY);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      if (cfg.mouse) window.removeEventListener('mousemove', onMouseMove);
      scene.remove(topo);
      renderer.dispose();
    },
  };
}

// ==================== RetrowaveEngine ====================
function RetrowaveEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  const isFuji = cfg.theme === 'fuji';

  const defaultColors = isFuji ? ['#ff66aa', '#ff8866', '#ff4488'] : ['#ff00ff', '#ff6600', '#ff0066'];
  const userColors = cfg.colors.length >= 3 ? cfg.colors : defaultColors;
  const gridColor = new THREE.Color(userColors[0]);
  const sunTopColor = new THREE.Color(userColors[1]);
  const sunBottomColor = new THREE.Color(userColors[2]);

  const bgColor = new THREE.Color(isFuji ? 0x1a0520 : 0x000011);
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  camera.fov = 60;
  camera.near = 0.1;
  camera.far = 200;
  camera.position.set(0, 5, 20);
  camera.lookAt(0, 3, -50);
  camera.updateProjectionMatrix();

  // Grid floor
  const gridGeom = new THREE.PlaneGeometry(200, 200, 1, 1);
  const gridVert = `
    varying vec2 vUv;
    varying float fogDepth;
    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      fogDepth = -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  const gridFrag = `
    uniform float time;
    uniform vec3 gridColor;
    varying vec2 vUv;
    varying float fogDepth;
    void main() {
      vec2 p = vUv * 40.0;
      p.y += time * 4.0;
      // Grid lines
      vec2 grid = abs(fract(p) - 0.5);
      vec2 fw = fwidth(p);
      float lineX = 1.0 - smoothstep(fw.x * 0.5, fw.x * 1.5, grid.x);
      float lineY = 1.0 - smoothstep(fw.y * 0.5, fw.y * 1.5, grid.y);
      float line = max(lineX, lineY);
      // Distance fade
      float fade = smoothstep(180.0, 20.0, fogDepth);
      vec3 col = gridColor * line * fade;
      gl_FragColor = vec4(col, 1.0);
    }
  `;
  const gridMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      gridColor: { value: gridColor },
    },
    vertexShader: gridVert,
    fragmentShader: gridFrag,
    transparent: true,
  });
  const grid = new THREE.Mesh(gridGeom, gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0;
  grid.position.z = -80;
  scene.add(grid);

  // Sun disc
  const sunGeom = new THREE.PlaneGeometry(30, 30, 1, 1);
  const sunVert = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const sunFrag = `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float dist = length(c) * 2.0;
      if (dist > 1.0) discard;
      // Gradient
      float t = vUv.y;
      vec3 col = mix(bottomColor, topColor, t);
      // Horizontal stripe cutouts (retrowave style)
      float stripeY = vUv.y * 20.0;
      float stripe = step(0.5, fract(stripeY));
      // Only cut below the center
      float cut = (vUv.y < 0.5) ? stripe : 1.0;
      float alpha = cut * smoothstep(1.0, 0.95, dist);
      gl_FragColor = vec4(col, alpha);
    }
  `;
  const sunMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: sunTopColor },
      bottomColor: { value: sunBottomColor },
    },
    vertexShader: sunVert,
    fragmentShader: sunFrag,
    transparent: true,
    depthWrite: false,
  });
  const sun = new THREE.Mesh(sunGeom, sunMat);
  sun.position.set(0, 10, -80);
  scene.add(sun);

  const sceneObjects = [grid, sun];

  if (isFuji) {
    // Fuji silhouette — trapezoid shape
    const fujiShape = new THREE.Shape();
    fujiShape.moveTo(-100, 0);
    fujiShape.lineTo(-8, 0);
    fujiShape.lineTo(-3, 14);
    fujiShape.lineTo(3, 14);
    fujiShape.lineTo(8, 0);
    fujiShape.lineTo(100, 0);
    fujiShape.lineTo(100, -1);
    fujiShape.lineTo(-100, -1);
    const fujiGeom = new THREE.ShapeGeometry(fujiShape);
    const fujiMat = new THREE.MeshBasicMaterial({ color: 0x200830, side: THREE.DoubleSide });
    const fuji = new THREE.Mesh(fujiGeom, fujiMat);
    fuji.position.z = -60;
    scene.add(fuji);
    sceneObjects.push(fuji);

    // Cloud layers
    for (let i = 0; i < 3; i++) {
      const cShape = new THREE.Shape();
      const y = 6 + i * 3;
      const w = 30 + i * 15;
      cShape.moveTo(-w, y);
      for (let j = 0; j <= 20; j++) {
        const x = -w + (2 * w * j / 20);
        const ch = y + 1.5 * Math.sin(j * 0.8 + i * 2) + 0.8;
        cShape.lineTo(x, ch);
      }
      cShape.lineTo(w, y);
      const cGeom = new THREE.ShapeGeometry(cShape);
      const cMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.9, 0.3, 0.15 + i * 0.05),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      });
      const cloud = new THREE.Mesh(cGeom, cMat);
      cloud.position.z = -55 + i * 5;
      scene.add(cloud);
      sceneObjects.push(cloud);
    }
  } else {
    // Mountain silhouettes (JS perlin → shape geometry)
    function createMountain(yBase, amplitude, detail, color, zPos) {
      const shape = new THREE.Shape();
      const width = 200;
      shape.moveTo(-width / 2, yBase);
      for (let i = 0; i <= detail; i++) {
        const x = -width / 2 + (width * i / detail);
        const h = yBase + Math.abs(perlin.simplex3(i * 0.08, zPos * 0.1, 0)) * amplitude;
        shape.lineTo(x, h);
      }
      shape.lineTo(width / 2, yBase);
      shape.lineTo(-width / 2, yBase);

      const geom = new THREE.ShapeGeometry(shape);
      const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.z = zPos;
      return mesh;
    }

    const m1 = createMountain(0, 12, 80, 0x110022, -60);
    const m2 = createMountain(0, 8, 60, 0x0a0015, -40);
    scene.add(m1);
    scene.add(m2);
    sceneObjects.push(m1, m2);
  }

  let raf = 0;
  let running = false;

  function render() {
    if (!running) return;
    gridMat.uniforms.time.value = performance.now() * 0.001 * cfg.speed;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      sceneObjects.forEach(o => scene.remove(o));
      renderer.dispose();
    },
  };
}

// ==================== Clouds Engine (iq volumetric clouds) ====================
function CloudsEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;

  const userColors = cfg.colors.length >= 2 ? cfg.colors : ['#6a9dd7', '#ffffff'];
  const skyColor = new THREE.Color(userColors[0]);
  const cloudColor = new THREE.Color(userColors[1]);

  scene.background = new THREE.Color('#4a7ab5');
  renderer.setClearColor(scene.background, 1);

  camera.fov = 45;
  camera.near = 0.1;
  camera.far = 100;
  camera.position.set(0, 0, 1);
  camera.updateProjectionMatrix();

  // --- Adaptive quality: detect GPU tier and adjust march steps + resolution ---
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuRenderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const isLowEnd = isMobile || /SwiftShader|Mali-4|Adreno\s[0-3]/i.test(gpuRenderer);
  const isMidTier = !isLowEnd && (isMobile || /Intel|Mali-G[56]/i.test(gpuRenderer));

  // Steps: 80 (high) → 48 (mid) → 28 (low). Will further adapt at runtime.
  let marchSteps = isLowEnd ? 28 : (isMidTier ? 48 : 80);
  // Resolution scale: 1.0 (high) → 1.0 (mid) → 0.6 (low)
  let resScale = isLowEnd ? 0.6 : 1.0;
  const baseDPR = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(baseDPR * resScale);

  // Build shader with current step count (will recompile if adapted)
  function buildFragShader(steps) {
    return `
    uniform float time;
    uniform vec2 resolution;
    uniform vec2 mouse;
    uniform vec3 skyColor;
    uniform vec3 cloudColor;

    // hash based 3d value noise — iq
    float hash(float n) { return fract(sin(n) * 43758.5453); }

    float noise(in vec3 x) {
      vec3 p = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      float n = p.x + p.y * 57.0 + 113.0 * p.z;
      return mix(mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                     mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
                 mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                     mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
    }

    vec4 mapClouds(in vec3 p, float t) {
      float d = 0.2 - p.y;
      vec3 q = p - vec3(1.0, 0.1, 0.0) * t;
      float f;
      f  = 0.5000 * noise(q); q *= 2.02;
      f += 0.2500 * noise(q); q *= 2.03;
      f += 0.1250 * noise(q); q *= 2.01;
      f += 0.0625 * noise(q);
      d += 3.0 * f;
      d = clamp(d, 0.0, 1.0);
      vec4 res = vec4(d);
      res.xyz = mix(1.15 * cloudColor, vec3(0.7, 0.7, 0.7), res.x);
      return res;
    }

    vec4 raymarch(in vec3 ro, in vec3 rd, float t) {
      vec4 sum = vec4(0.0);
      float tt = 0.0;
      vec3 sundir = normalize(vec3(-1.0, 0.0, 0.0));
      for (int i = 0; i < ${steps}; i++) {
        if (sum.a > 0.99) break;
        vec3 pos = ro + tt * rd;
        vec4 col = mapClouds(pos, t);
        // Sun-lit side lighting
        float dif = clamp((col.w - mapClouds(pos + 0.3 * sundir, t).w) / 0.6, 0.0, 1.0);
        vec3 lin = vec3(0.65, 0.68, 0.7) * 1.35 + 0.45 * vec3(0.7, 0.5, 0.3) * dif;
        col.xyz *= lin;
        col.a *= 0.35;
        col.rgb *= col.a;
        sum = sum + col * (1.0 - sum.a);
        tt += max(0.06, 0.02 * tt);
      }
      sum.xyz /= (0.001 + sum.w);
      return clamp(sum, 0.0, 1.0);
    }

    void main() {
      vec2 q = gl_FragCoord.xy / resolution.xy;
      vec2 p = -1.0 + 2.0 * q;
      p.x *= resolution.x / resolution.y;

      // Camera orbit — mouse.x pans horizontally, mouse.y adjusts elevation
      float camAngle = 2.75 - 1.5 * mouse.x;
      vec3 ro = 4.0 * normalize(vec3(cos(camAngle), 0.7 + (mouse.y * 0.5 + 0.5), sin(camAngle)));
      vec3 ta = vec3(0.0, 1.0, 0.0);
      vec3 ww = normalize(ta - ro);
      vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
      vec3 vv = normalize(cross(ww, uu));
      vec3 rd = normalize(p.x * uu + p.y * vv + 1.5 * ww);

      float t = time;
      vec4 res = raymarch(ro, rd, t);

      // Sky gradient
      vec3 sundir = normalize(vec3(-1.0, 0.0, 0.0));
      float sun = clamp(dot(sundir, rd), 0.0, 1.0);
      vec3 col = skyColor - rd.y * 0.2 * vec3(1.0, 0.5, 1.0) + 0.15 * 0.5;
      col += 0.2 * vec3(1.0, 0.6, 0.1) * pow(sun, 8.0);
      col *= 0.95;
      // Blend clouds over sky
      col = mix(col, res.xyz, res.w);
      // Sun glow
      col += 0.1 * vec3(1.0, 0.4, 0.2) * pow(sun, 3.0);
      gl_FragColor = vec4(col, 1.0);
    }`;
  }

  const cloudGeom = new THREE.PlaneGeometry(2, 2, 1, 1);
  const cloudVert = `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  let cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      resolution: { value: new THREE.Vector2(ctx.width, ctx.height) },
      mouse: { value: new THREE.Vector2(0, 0) },
      skyColor: { value: skyColor },
      cloudColor: { value: cloudColor },
    },
    vertexShader: cloudVert,
    fragmentShader: buildFragShader(marchSteps),
    depthTest: false,
    depthWrite: false,
  });

  const cloudMesh = new THREE.Mesh(cloudGeom, cloudMat);
  scene.add(cloudMesh);

  let mouseX = 0, mouseY = 0;
  function onMouseMove(e) {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }
  if (cfg.mouse) window.addEventListener('mousemove', onMouseMove);

  // --- Runtime performance adaptation ---
  let raf = 0;
  let running = false;
  let frameCount = 0;
  let frameTimes = [];
  let adapted = false;
  let lastFrameTime = 0;

  function adaptQuality() {
    if (adapted || frameTimes.length < 12) return;
    // Drop first 2 frames (warmup), average the rest
    const sample = frameTimes.slice(2);
    const avgMs = sample.reduce((a, b) => a + b, 0) / sample.length;
    const avgFps = 1000 / avgMs;

    if (avgFps < 20 && marchSteps > 28) {
      // Severe: reduce steps and slightly drop resolution
      marchSteps = Math.max(28, Math.floor(marchSteps * 0.6));
      resScale = Math.max(0.6, resScale * 0.8);
      recompile();
    } else if (avgFps < 30 && marchSteps > 40) {
      // Moderate: reduce steps by 20%
      marchSteps = Math.max(40, Math.floor(marchSteps * 0.8));
      recompile();
    }
    adapted = true;
  }

  function recompile() {
    renderer.setPixelRatio(baseDPR * resScale);
    const w = renderer.domElement.offsetWidth || renderer.domElement.clientWidth;
    const h = renderer.domElement.offsetHeight || renderer.domElement.clientHeight;
    if (w && h) renderer.setSize(w, h);
    cloudMat.fragmentShader = buildFragShader(marchSteps);
    cloudMat.needsUpdate = true;
    cloudMat.uniforms.resolution.value.set(w * baseDPR * resScale, h * baseDPR * resScale);
  }

  function render() {
    if (!running) return;
    const now = performance.now();

    // Track frame times for adaptation
    if (!adapted && lastFrameTime > 0) {
      frameTimes.push(now - lastFrameTime);
      if (frameTimes.length === 14) adaptQuality();
    }
    lastFrameTime = now;

    cloudMat.uniforms.time.value = now * 0.001 * cfg.speed * 0.5;
    cloudMat.uniforms.mouse.value.lerp(new THREE.Vector2(mouseX, mouseY), 0.05);
    const el = renderer.domElement;
    const w = el.offsetWidth || el.clientWidth;
    const h = el.offsetHeight || el.clientHeight;
    if (w && h) cloudMat.uniforms.resolution.value.set(w * baseDPR * resScale, h * baseDPR * resScale);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; lastFrameTime = 0; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      if (cfg.mouse) window.removeEventListener('mousemove', onMouseMove);
      scene.remove(cloudMesh);
      renderer.dispose();
    },
  };
}

// ==================== Shared Fullscreen Quad Helpers ====================
function createFullscreenQuad(THREE, scene, camera, renderer, cfg, buildFrag, extraUniforms) {
  camera.fov = 45;
  camera.near = 0.1;
  camera.far = 100;
  camera.position.set(0, 0, 1);
  camera.updateProjectionMatrix();

  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuRenderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const isLowEnd = isMobile || /SwiftShader|Mali-4|Adreno\s[0-3]/i.test(gpuRenderer);

  const el = renderer.domElement;
  const w = el.offsetWidth || el.clientWidth || 800;
  const h = el.offsetHeight || el.clientHeight || 600;

  const uniforms = Object.assign({
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(w, h) },
    mouse: { value: new THREE.Vector2(0, 0) },
  }, extraUniforms || {});

  const geom = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: buildFrag(isLowEnd),
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  scene.add(mesh);

  let mouseX = 0, mouseY = 0;
  function onMouseMove(e) {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }
  if (cfg.mouse) window.addEventListener('mousemove', onMouseMove);

  let raf = 0, running = false;
  function render() {
    if (!running) return;
    uniforms.time.value = performance.now() * 0.001 * cfg.speed;
    uniforms.mouse.value.lerp(new THREE.Vector2(mouseX, mouseY), 0.05);
    const ew = el.offsetWidth || el.clientWidth;
    const eh = el.offsetHeight || el.clientHeight;
    if (ew && eh) uniforms.resolution.value.set(ew * Math.min(window.devicePixelRatio, 2), eh * Math.min(window.devicePixelRatio, 2));
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    uniforms, mesh, mat, isLowEnd, isMobile,
    start() { if (running) return; running = true; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      if (cfg.mouse) window.removeEventListener('mousemove', onMouseMove);
      scene.remove(mesh);
      renderer.dispose();
    },
  };
}

// ==================== MetaballEngine ====================
function MetaballEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  const userColors = cfg.colors.length >= 2 ? cfg.colors : ['#f04e00', '#1966cc'];
  const c0 = new THREE.Color(userColors[0]);
  const c1 = new THREE.Color(userColors[1]);

  function buildFrag(isLowEnd) {
    const N = isLowEnd ? 18 : 35;
    return `
    uniform float time;
    uniform vec2 resolution;
    uniform vec3 color0;
    uniform vec3 color1;
    void main(){
      vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
      float v=0.0;
      float w=0.0;
      for(int i=0;i<${N};i++){
        float fi=float(i);
        float seed=fi*1.618+fi*fi*0.3;
        vec2 center=vec2(
          sin(time*0.23+seed*2.4)*0.7,
          cos(time*0.31+seed*1.7)*0.4
        );
        float d=length(uv-center);
        float r=0.07+0.03*sin(seed*3.0);
        float blob=r*r/(d*d+0.0001);
        v+=blob;
        w+=blob*step(0.5,fract(fi*0.5));
      }
      // Isosurface with smooth edge
      float edge=smoothstep(1.8,2.2,v);
      float blend=w/max(v,0.001);
      vec3 col=mix(color0,color1,blend);
      // Bright core, darker edges
      float core=smoothstep(2.0,5.0,v);
      col=col*(0.6+0.6*core);
      col*=edge;
      // Subtle glow halo
      float halo=smoothstep(1.0,1.8,v)*0.15;
      col+=mix(color0,color1,0.5)*halo*(1.0-edge);
      gl_FragColor=vec4(col,1.0);
    }`;
  }

  const bgColor = new THREE.Color(cfg.bg || '#000000');
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  const q = createFullscreenQuad(THREE, scene, camera, renderer, cfg, buildFrag, {
    color0: { value: c0 },
    color1: { value: c1 },
  });
  return { start: () => q.start(), stop: () => q.stop(), destroy: () => q.destroy() };
}

// ==================== CubegridEngine ====================
function CubegridEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  const userColors = cfg.colors.length ? cfg.colors : ['#ffffff'];
  const lc = new THREE.Color(userColors[0]);

  function buildFrag() {
    return `
    uniform float time;
    uniform vec2 resolution;
    uniform vec3 lineColor;
    float segment(vec2 a,vec2 b,vec2 p){
      vec2 ab=b-a,ap=p-a;
      float t=clamp(dot(ap,ab)/dot(ab,ab),0.0,1.0);
      return length(ap-ab*t);
    }
    mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
    vec2 T(vec3 p){return p.xy/(p.z*0.3+2.0);}
    void main(){
      vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
      float t=time*0.5;
      float v=0.0;
      for(int gy=-2;gy<=2;gy++){
        for(int gx=-3;gx<=3;gx++){
          vec2 cell=vec2(float(gx),float(gy))*0.45;
          float phase=t+float(gx)*0.3+float(gy)*0.5;
          float anim=fract(phase*0.2)*6.2832;
          float s=0.12;
          // 8 corners of a cube
          vec3 c0=vec3(-s,-s,-s),c1=vec3(s,-s,-s),c2=vec3(s,s,-s),c3=vec3(-s,s,-s);
          vec3 c4=vec3(-s,-s,s),c5=vec3(s,-s,s),c6=vec3(s,s,s),c7=vec3(-s,s,s);
          mat2 r=rot(anim);
          // rotate XZ
          c0.xz*=r;c1.xz*=r;c2.xz*=r;c3.xz*=r;
          c4.xz*=r;c5.xz*=r;c6.xz*=r;c7.xz*=r;
          mat2 r2=rot(anim*0.7);
          c0.yz*=r2;c1.yz*=r2;c2.yz*=r2;c3.yz*=r2;
          c4.yz*=r2;c5.yz*=r2;c6.yz*=r2;c7.yz*=r2;
          vec2 p=uv-cell;
          // 12 edges
          float d=1e9;
          d=min(d,segment(T(c0),T(c1),p));d=min(d,segment(T(c1),T(c2),p));
          d=min(d,segment(T(c2),T(c3),p));d=min(d,segment(T(c3),T(c0),p));
          d=min(d,segment(T(c4),T(c5),p));d=min(d,segment(T(c5),T(c6),p));
          d=min(d,segment(T(c6),T(c7),p));d=min(d,segment(T(c7),T(c4),p));
          d=min(d,segment(T(c0),T(c4),p));d=min(d,segment(T(c1),T(c5),p));
          d=min(d,segment(T(c2),T(c6),p));d=min(d,segment(T(c3),T(c7),p));
          v+=0.002/max(d,0.001);
        }
      }
      vec3 col=lineColor*clamp(v,0.0,1.0);
      gl_FragColor=vec4(col,1.0);
    }`;
  }

  const bgColor = new THREE.Color(cfg.bg || '#000000');
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  const q = createFullscreenQuad(THREE, scene, camera, renderer, cfg, buildFrag, {
    lineColor: { value: lc },
  });
  return { start: () => q.start(), stop: () => q.stop(), destroy: () => q.destroy() };
}

// ==================== AbstractEngine ====================
function AbstractEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  const style = cfg.style || 'turbulence';

  function buildFrag(isLowEnd) {
    if (style === 'warp') {
      const N = isLowEnd ? 14 : 25;
      return `
      uniform float time;
      uniform vec2 resolution;
      void main(){
        vec2 uv=gl_FragCoord.xy/resolution.xy;
        vec2 n,q=vec2(0.0);
        vec2 p=uv-0.5;
        float S=6.0,t=time*0.2;
        float a=0.8;
        mat2 m=mat2(cos(a),-sin(a),sin(a),cos(a));
        for(int j=0;j<${N};j++){
          p*=m;
          n=p*S;
          n+=vec2(sin(n.y+t)+sin(n.x*0.4+t*0.5),sin(n.x+t*0.7)+cos(n.y*0.6+t*0.3));
          q+=sin(n)*0.5+0.5;
          S*=1.18;
        }
        q/=float(${N});
        vec3 col=vec3(0.05+q.x*0.2, 0.02+q.y*0.15, 0.1+q.x*q.y*0.4);
        col=pow(col,vec3(0.8));
        gl_FragColor=vec4(col,1.0);
      }`;
    }
    if (style === 'loop') {
      const N = isLowEnd ? 60 : 100;
      return `
      uniform float time;
      uniform vec2 resolution;
      mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
      void main(){
        vec2 uv=(gl_FragCoord.xy*2.0-resolution.xy)/resolution.y;
        float t=time*0.2;
        vec3 col=vec3(0.0);
        float s=0.4;
        for(int i=0;i<${N};i++){
          vec2 p=uv*s;
          p.x+=t*0.2;
          p*=rot(t*0.08);
          float fi=float(i);
          vec2 q=abs(mod(p,2.0)-1.0);
          float d=min(q.x,q.y);
          float glow=0.003/abs(d-0.25);
          col+=glow*vec3(
            0.15+0.15*sin(fi*0.08+t),
            0.1+0.15*sin(fi*0.08+t+2.094),
            0.25+0.2*sin(fi*0.08+t+4.189)
          );
          s*=1.025;
        }
        col=col/(1.0+col);
        col=pow(col,vec3(1.2));
        gl_FragColor=vec4(col,1.0);
      }`;
    }
    // Default: turbulence — dark elegant fluid
    return `
    uniform float time;
    uniform vec2 resolution;
    void main(){
      vec2 uv=gl_FragCoord.xy/resolution.xy;
      float t=time*0.15;
      vec2 p=uv*4.0;
      float v=0.0;
      for(int i=0;i<9;i++){
        float fi=float(i);
        p+=vec2(cos(p.y+t+fi*0.7)*0.8,sin(p.x+t+fi*0.5)*0.8);
        v+=0.5+0.5*sin(p.x+p.y);
      }
      v/=9.0;
      // Dark, moody palette instead of rainbow
      vec3 col=vec3(
        0.08+0.15*sin(v*4.0+t*0.5+0.0),
        0.04+0.12*sin(v*4.0+t*0.5+1.2),
        0.15+0.2*sin(v*4.0+t*0.5+2.5)
      );
      col*=0.8+0.4*v;
      col=pow(col,vec3(0.9));
      gl_FragColor=vec4(col,1.0);
    }`;
  }

  const bgColor = new THREE.Color(cfg.bg || '#000000');
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  const q = createFullscreenQuad(THREE, scene, camera, renderer, cfg, buildFrag, {});
  return { start: () => q.start(), stop: () => q.stop(), destroy: () => q.destroy() };
}

// ==================== CrystalEngine ====================
function CrystalEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  const style = cfg.style || 'octagrams';

  function buildFrag(isLowEnd) {
    const STEPS = isLowEnd ? 70 : 128;
    if (style === 'glass') {
      return `
      uniform float time;
      uniform vec2 resolution;
      uniform vec2 mouse;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      void main(){
        vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
        float t=time*0.4;
        vec3 ro=vec3(0.0,0.0,-3.0+mouse.y*0.5);
        vec3 rd=normalize(vec3(uv,1.5));
        float ca=t*0.2+mouse.x*0.5;
        float cc=cos(ca),ss=sin(ca);
        ro.xz=mat2(cc,-ss,ss,cc)*ro.xz;
        rd.xz=mat2(cc,-ss,ss,cc)*rd.xz;
        vec4 acc=vec4(0.0);
        float tt=0.0;
        for(int i=0;i<${STEPS};i++){
          vec3 p=ro+rd*tt;
          vec3 q=fract(p)-0.5;
          float h=hash(floor(p));
          q+=0.1*(h-0.5);
          float d=max(abs(q.x),max(abs(q.y),abs(q.z)))-0.15+0.05*dot(q,q);
          float aD=clamp(d*10.0,0.0,1.0);
          aD=aD*aD*(3.0-2.0*aD);
          vec3 col=mix(
            vec3(1.0,0.4,0.1),
            vec3(0.1,0.8,0.3),
            0.5+0.5*sin(h*6.28+t)
          );
          acc.rgb+=col*(1.0-aD)*0.04*(1.0-acc.a);
          acc.a+=0.02*(1.0-aD)*(1.0-acc.a);
          tt+=max(abs(d),0.004);
          if(acc.a>0.99||tt>8.0) break;
        }
        vec3 col=acc.rgb/(acc.a+0.001);
        col=col/(1.0+col);
        gl_FragColor=vec4(col*acc.a,1.0);
      }`;
    }
    // Default: octagrams — volumetric octagram structures
    return `
    uniform float time;
    uniform vec2 resolution;
    uniform vec2 mouse;
    mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
    float box(vec3 p,vec3 b){vec3 d=abs(p)-b;return min(max(d.x,max(d.y,d.z)),0.0)+length(max(d,0.0));}
    float scene(vec3 p){
      float d=1e9;
      for(int i=0;i<6;i++){
        float fi=float(i);
        vec3 q=p;
        q.xy*=rot(fi*1.047+time*0.15);
        q.yz*=rot(fi*0.5+time*0.1);
        q=mod(q+1.5,3.0)-1.5;
        d=min(d,box(q,vec3(0.35,0.35,0.015)));
      }
      return d;
    }
    void main(){
      vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
      float t=time*0.4;
      vec3 ro=vec3(0.0,0.0,-3.5+mouse.y*0.3);
      vec3 rd=normalize(vec3(uv,1.0));
      float ca=t*0.12+mouse.x*0.3;
      float cc=cos(ca),ss=sin(ca);
      ro.xz=mat2(cc,-ss,ss,cc)*ro.xz;
      rd.xz=mat2(cc,-ss,ss,cc)*rd.xz;
      vec3 col=vec3(0.0);
      float tt=0.0;
      for(int i=0;i<${STEPS};i++){
        vec3 p=ro+rd*tt;
        float d=scene(p);
        // Tight glow with crisp falloff
        float glow=exp(-d*30.0)*0.15;
        // Rich blue-purple-cyan palette cycling with depth
        vec3 gc=vec3(
          0.15+0.15*sin(t*0.7+tt*0.3+1.0),
          0.2+0.25*sin(t*0.5+tt*0.4+2.5),
          0.5+0.4*sin(t*0.3+tt*0.2)
        );
        // Bright sparkle near surfaces
        float sparkle=exp(-d*80.0)*0.12;
        col+=glow*gc+sparkle*vec3(0.4,0.6,1.0);
        tt+=max(d,0.004);
        if(tt>10.0) break;
      }
      // Tone map with more contrast
      col=pow(col/(0.7+col),vec3(0.85));
      gl_FragColor=vec4(col,1.0);
    }`;
  }

  const bgColor = new THREE.Color(cfg.bg || '#000000');
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  const q = createFullscreenQuad(THREE, scene, camera, renderer, cfg, buildFrag, {});
  return { start: () => q.start(), stop: () => q.stop(), destroy: () => q.destroy() };
}

// ==================== PhantomEngine ====================
function PhantomEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  const userColors = cfg.colors.length ? cfg.colors : ['#00ccff'];
  const gc = new THREE.Color(userColors[0]);

  function buildFrag(isLowEnd) {
    const STEPS = isLowEnd ? 70 : 128;
    return `
    uniform float time;
    uniform vec2 resolution;
    uniform vec2 mouse;
    uniform vec3 glowColor;
    mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
    float box(vec3 p,vec3 b){vec3 d=abs(p)-b;return min(max(d.x,max(d.y,d.z)),0.0)+length(max(d,0.0));}
    float scene(vec3 p){
      float t=time*0.25;
      // IFS fractal — 5 iterations of abs-fold + rotation
      for(int i=0;i<5;i++){
        p=abs(p)-vec3(1.0,1.2,0.9);
        p.xy*=rot(t*0.25+0.6*float(i));
        p.yz*=rot(t*0.15+0.4*float(i));
      }
      // Mod repeat for infinite structure
      vec3 q=mod(p+1.0,2.0)-1.0;
      return box(q,vec3(0.3));
    }
    void main(){
      vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
      float t=time*0.25;
      vec3 ro=vec3(0.0,0.0,-4.0);
      vec3 rd=normalize(vec3(uv,1.2));
      float ca=t*0.2+mouse.x*0.3;
      float cc=cos(ca),ss=sin(ca);
      ro.xz=mat2(cc,-ss,ss,cc)*ro.xz;
      rd.xz=mat2(cc,-ss,ss,cc)*rd.xz;
      vec3 col=vec3(0.0);
      float tt=0.0;
      for(int i=0;i<${STEPS};i++){
        vec3 p=ro+rd*tt;
        float d=scene(p);
        // Crisp phantom glow — tight near structures
        float glow=exp(-d*10.0)*0.10;
        // Bright surface highlight
        float surface=exp(-d*50.0)*0.06;
        // Travelling pulse wave
        float wave=smoothstep(0.0,3.0,mod(length(p)+20.0*time*0.08,25.0));
        float pulse=1.0+1.5*(1.0-wave)*exp(-d*15.0);
        // Color varies with depth for more visual interest
        vec3 gc=glowColor*(0.7+0.3*sin(tt*0.3+vec3(0.0,1.0,2.0)));
        col+=glow*gc*pulse+surface*vec3(0.5,0.7,1.0);
        tt+=max(d,0.004);
        if(tt>12.0) break;
      }
      // Reinhard tone map with more contrast
      col=col/(0.7+col);
      gl_FragColor=vec4(col,1.0);
    }`;
  }

  const bgColor = new THREE.Color(cfg.bg || '#000000');
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  const q = createFullscreenQuad(THREE, scene, camera, renderer, cfg, buildFrag, {
    glowColor: { value: gc },
  });
  return { start: () => q.start(), stop: () => q.stop(), destroy: () => q.destroy() };
}

// ==================== LightcubeEngine ====================
function LightcubeEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;

  function buildFrag(isLowEnd) {
    const LAYERS = isLowEnd ? 6 : 12;
    const STEPS = isLowEnd ? 70 : 120;
    return `
    uniform float time;
    uniform vec2 resolution;
    uniform vec2 mouse;
    float sdBox(vec3 p,vec3 b){vec3 d=abs(p)-b;return min(max(d.x,max(d.y,d.z)),0.0)+length(max(d,0.0));}
    vec3 palette(float t){
      return 0.5+0.5*cos(6.2832*(t+vec3(0.0,0.1,0.2)));
    }
    mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
    void main(){
      vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
      float t=time*0.25;
      vec3 col=vec3(0.0);
      for(int layer=0;layer<${LAYERS};layer++){
        float fl=float(layer);
        float scale=1.0-fl*0.07;
        float boxSize=0.9-fl*0.06;
        vec3 ro=vec3(0.0,0.0,-2.5/scale);
        vec3 rd=normalize(vec3(uv/scale,1.0));
        // Each layer rotates at different speed
        float ca=t*(0.4+fl*0.08)+mouse.x*0.2;
        float sa=sin(ca),cca=cos(ca);
        ro.xz=mat2(cca,-sa,sa,cca)*ro.xz;
        rd.xz=mat2(cca,-sa,sa,cca)*rd.xz;
        float tiltA=t*0.15+fl*0.15;
        ro.yz*=rot(tiltA);
        rd.yz*=rot(tiltA);
        float tt=0.0;
        for(int i=0;i<${STEPS};i++){
          vec3 p=ro+rd*tt;
          float shell=abs(sdBox(p,vec3(boxSize)))-0.008;
          if(shell<0.002){
            // Face UV based on dominant axis
            vec3 ap=abs(p);
            vec2 fuv;
            if(ap.x>ap.y&&ap.x>ap.z) fuv=p.yz;
            else if(ap.y>ap.z) fuv=p.xz;
            else fuv=p.xy;
            // Procedural pattern on faces
            float pattern=0.5+0.5*sin(fuv.x*12.0)*sin(fuv.y*12.0);
            float grid=smoothstep(0.02,0.03,abs(fract(fuv.x*4.0)-0.5))*smoothstep(0.02,0.03,abs(fract(fuv.y*4.0)-0.5));
            vec3 pc=palette(fl*0.12+t*0.15+pattern*0.3);
            // Brighter contribution, fresnel-like edge glow
            float fresnel=pow(1.0-abs(dot(normalize(p),rd)),2.0);
            col+=pc*(0.2+0.15*fresnel)*scale*(0.6+0.4*grid);
            break;
          }
          // Volumetric glow around edges
          float edgeGlow=exp(-shell*20.0)*0.01*scale;
          col+=edgeGlow*palette(fl*0.12+t*0.15);
          tt+=max(shell,0.004);
          if(tt>5.0) break;
        }
      }
      // Brighter tone mapping
      col=1.0-exp(-col*3.0);
      vec2 vig=uv*1.2;
      col*=1.0-dot(vig,vig)*0.25;
      gl_FragColor=vec4(col,1.0);
    }`;
  }

  const bgColor = new THREE.Color(cfg.bg || '#000000');
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  const q = createFullscreenQuad(THREE, scene, camera, renderer, cfg, buildFrag, {});
  return { start: () => q.start(), stop: () => q.stop(), destroy: () => q.destroy() };
}

// ==================== ReflectEngine ====================
function ReflectEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;

  function buildFrag(isLowEnd) {
    const STEPS1 = isLowEnd ? 56 : 128;
    const STEPS2 = isLowEnd ? 0 : 64;
    const SHADOW_STEPS = isLowEnd ? 0 : 32;
    return `
    uniform float time;
    uniform vec2 resolution;
    uniform vec2 mouse;
    float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float sdBox(vec3 p,vec3 b){vec3 d=abs(p)-b;return min(max(d.x,max(d.y,d.z)),0.0)+length(max(d,0.0));}
    float scene(vec3 p){
      vec3 id=floor(p*0.5+0.5);
      vec3 q=fract(p*0.5+0.5)-0.5;
      float h=hash(id);
      // Slightly offset each cube
      q+=0.05*(h-0.5);
      return sdBox(q,vec3(0.2+h*0.04))*2.0-0.02;
    }
    vec3 calcNormal(vec3 p){
      vec2 e=vec2(0.002,0.0);
      return normalize(vec3(
        scene(p+e.xyy)-scene(p-e.xyy),
        scene(p+e.yxy)-scene(p-e.yxy),
        scene(p+e.yyx)-scene(p-e.yyx)
      ));
    }
    vec3 palette(float t){return 0.5+0.5*cos(6.2832*(t+vec3(0.0,0.1,0.2)));}
    ${SHADOW_STEPS > 0 ? `
    float softShadow(vec3 ro,vec3 rd,float tmin,float tmax){
      float res=1.0;float t=tmin;
      for(int i=0;i<${SHADOW_STEPS};i++){
        float d=scene(ro+rd*t);
        res=min(res,6.0*d/t);
        t+=clamp(d,0.02,0.15);
        if(d<0.001||t>tmax) break;
      }
      return clamp(res,0.0,1.0);
    }` : 'float softShadow(vec3 ro,vec3 rd,float a,float b){return 1.0;}'}
    void main(){
      vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
      float t=time*0.2;
      // Camera orbits around the cube grid
      vec3 ro=vec3(sin(t)*5.0,3.0+mouse.y*1.5,cos(t)*5.0);
      vec3 ta=vec3(sin(t*0.3),0.5,cos(t*0.3));
      vec3 ww=normalize(ta-ro);
      vec3 uu=normalize(cross(vec3(0.0,1.0,0.0),ww));
      vec3 vv=cross(ww,uu);
      vec3 rd=normalize(uv.x*uu+uv.y*vv+1.5*ww);
      vec3 lightDir=normalize(vec3(0.8,1.5,0.6));
      vec3 lightDir2=normalize(vec3(-0.5,0.3,-0.8));
      // Sky/background gradient
      vec3 sky=mix(vec3(0.01,0.01,0.04),vec3(0.05,0.02,0.08),uv.y+0.5);
      vec3 col=sky;
      // Primary raymarch
      float tt=0.0;
      bool hit=false;
      for(int i=0;i<${STEPS1};i++){
        vec3 p=ro+rd*tt;
        float d=scene(p);
        if(d<0.002){hit=true;break;}
        tt+=d*0.8;
        if(tt>25.0) break;
      }
      if(hit){
        vec3 p=ro+rd*tt;
        vec3 n=calcNormal(p);
        vec3 id=floor(p*0.5+0.5);
        float h=hash(id);
        float checker=mod(id.x+id.y+id.z,2.0);
        // Color from IQ palette
        vec3 baseCol=palette(h*1.5+t*0.15);
        baseCol=mix(baseCol,baseCol*0.6,checker*0.5);
        // Two-light setup
        float diff1=max(dot(n,lightDir),0.0);
        float diff2=max(dot(n,lightDir2),0.0)*0.3;
        float amb=0.12;
        float shadow=softShadow(p+n*0.02,lightDir,0.05,8.0);
        // Specular
        vec3 halfV=normalize(lightDir-rd);
        float spec=pow(max(dot(n,halfV),0.0),32.0)*0.5;
        col=baseCol*(amb+0.8*diff1*shadow+diff2)+vec3(spec*shadow);
        // Distance fog — fade to dark blue
        col=mix(col,sky,1.0-exp(-tt*0.04));
        ${STEPS2 > 0 ? `
        // Reflection pass
        vec3 rrd=reflect(rd,n);
        float rtt=0.05;
        bool rhit=false;
        for(int i=0;i<${STEPS2};i++){
          vec3 rp=p+rrd*rtt;
          float rd2=scene(rp);
          if(rd2<0.002){rhit=true;break;}
          rtt+=rd2*0.8;
          if(rtt>8.0) break;
        }
        if(rhit){
          vec3 rp=p+rrd*rtt;
          vec3 rid=floor(rp*0.5+0.5);
          vec3 rcol=palette(hash(rid)*1.5+t*0.15)*0.5;
          // Fresnel-weighted reflection
          float fres=pow(1.0-max(dot(n,-rd),0.0),3.0);
          col=mix(col,rcol,fres*0.4);
        }` : ''}
      }
      gl_FragColor=vec4(col,1.0);
    }`;
  }

  const bgColor = new THREE.Color(cfg.bg || '#000000');
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  const q = createFullscreenQuad(THREE, scene, camera, renderer, cfg, buildFrag, {});
  return { start: () => q.start(), stop: () => q.stop(), destroy: () => q.destroy() };
}

// ==================== NetworkEngine ====================
function NetworkEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;

  function buildFrag(isLowEnd) {
    const LAYERS = isLowEnd ? 3 : 5;
    return `
    uniform float time;
    uniform vec2 resolution;
    uniform vec2 mouse;
    float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float dfLine(vec2 a,vec2 b,vec2 p){
      vec2 ab=b-a,ap=p-a;
      float t=clamp(dot(ap,ab)/dot(ab,ab),0.0,1.0);
      return length(ap-ab*t);
    }
    void main(){
      vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
      uv+=mouse*0.05;
      float t=time*0.3;
      vec3 col=vec3(0.0);
      for(int layer=0;layer<${LAYERS};layer++){
        float fl=float(layer);
        float scale=1.5+fl*0.8;
        float fade=1.0/(1.0+fl*0.5);
        vec2 suv=uv*scale;
        // 3x3 grid
        for(int gy=-1;gy<=1;gy++){
          for(int gx=-1;gx<=1;gx++){
            vec2 cell=vec2(float(gx),float(gy));
            float h=hash21(cell+fl*10.0);
            vec2 nodePos=cell+0.3*vec2(
              sin(t*0.5+h*6.28+fl),
              cos(t*0.4+h*3.14+fl)
            );
            float d=length(suv-nodePos);
            // Node glow
            float sparkle=1.0/(d*d*200.0+1.0);
            sparkle*=0.5+0.5*sin(t*3.0+h*6.28);
            // Lines to neighbors
            for(int ny=-1;ny<=1;ny++){
              for(int nx=-1;nx<=1;nx++){
                if(nx==0&&ny==0) continue;
                vec2 ncell=cell+vec2(float(nx),float(ny));
                float nh=hash21(ncell+fl*10.0);
                vec2 npos=ncell+0.3*vec2(
                  sin(t*0.5+nh*6.28+fl),
                  cos(t*0.4+nh*3.14+fl)
                );
                float ld=dfLine(nodePos,npos,suv);
                float line=0.001/max(ld,0.001);
                line*=0.3*fade;
                col+=line*vec3(
                  0.3+0.3*sin(t+fl),
                  0.4+0.3*sin(t+fl+1.0),
                  0.7+0.3*sin(t+fl+2.0)
                );
              }
            }
            col+=sparkle*fade*vec3(0.5,0.7,1.0);
          }
        }
      }
      // Vignette
      float vig=1.0-dot(uv*0.8,uv*0.8);
      col*=max(vig,0.0);
      col=col/(1.0+col);
      gl_FragColor=vec4(col,1.0);
    }`;
  }

  const bgColor = new THREE.Color(cfg.bg || '#000008');
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  const q = createFullscreenQuad(THREE, scene, camera, renderer, cfg, buildFrag, {});
  return { start: () => q.start(), stop: () => q.stop(), destroy: () => q.destroy() };
}

// ==================== GyroidEngine ====================
function GyroidEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;

  function buildFrag(isLowEnd) {
    const STEPS = isLowEnd ? 70 : 150;
    const BOUNCES = isLowEnd ? 1 : 3;
    return `
    uniform float time;
    uniform vec2 resolution;
    uniform vec2 mouse;
    float gyroid(vec3 p,float s){return dot(sin(p*s),cos(p.yzx*s));}
    float scene(vec3 p,out float id){
      float g1=gyroid(p,4.0)*0.3;
      float g2=gyroid(p+3.1416,4.0)*0.3;
      float d1=abs(g1)-0.03;
      float d2=abs(g2)-0.03;
      // Sphere boundary
      float sph=length(p)-2.0;
      d1=max(d1,-sph);
      d2=max(d2,-sph);
      if(d1<d2){id=0.0;return d1;}
      id=1.0;return d2;
    }
    vec3 calcNormal(vec3 p){
      float id;
      vec2 e=vec2(0.001,0.0);
      return normalize(vec3(
        scene(p+e.xyy,id)-scene(p-e.xyy,id),
        scene(p+e.yxy,id)-scene(p-e.yxy,id),
        scene(p+e.yyx,id)-scene(p-e.yyx,id)
      ));
    }
    void main(){
      vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
      float t=time*0.3;
      float ca=t*0.3+mouse.x*0.5;
      float ce=0.3+mouse.y*0.3;
      vec3 ro=vec3(cos(ca)*4.0,sin(ce)*2.0,sin(ca)*4.0);
      vec3 ta=vec3(0.0);
      vec3 ww=normalize(ta-ro);
      vec3 uu=normalize(cross(vec3(0.0,1.0,0.0),ww));
      vec3 vv=cross(ww,uu);
      vec3 rd=normalize(uv.x*uu+uv.y*vv+1.5*ww);
      vec3 light1=normalize(vec3(0.0,1.0,0.5));
      vec3 light2=normalize(vec3(0.0,-1.0,0.0));
      vec3 light3=normalize(vec3(1.0,0.2,0.0));
      vec3 col=vec3(0.0);
      vec3 att=vec3(1.0);
      for(int bounce=0;bounce<${BOUNCES};bounce++){
        float tt=0.0;
        float id;
        bool hit=false;
        for(int i=0;i<${STEPS};i++){
          vec3 p=ro+rd*tt;
          float d=scene(p,id);
          if(d<0.001){hit=true;break;}
          tt+=d;
          if(tt>10.0) break;
        }
        if(!hit){
          col+=att*vec3(0.02,0.01,0.03);
          break;
        }
        vec3 p=ro+rd*tt;
        vec3 n=calcNormal(p);
        vec3 baseCol=id<0.5?vec3(0.2,0.4,0.9):vec3(0.9,0.2,0.4);
        float d1=max(dot(n,light1),0.0);
        float d2=max(dot(n,-light2),0.0);
        float d3=max(dot(n,light3),0.0);
        vec3 lighting=vec3(0.3,0.4,0.8)*d1+vec3(0.8,0.2,0.2)*d2+vec3(0.9,0.5,0.7)*d3;
        col+=att*baseCol*lighting*0.5;
        att*=0.4;
        rd=reflect(rd,n);
        ro=p+n*0.01;
      }
      col=col/(1.0+col);
      gl_FragColor=vec4(col,1.0);
    }`;
  }

  const bgColor = new THREE.Color(cfg.bg || '#000000');
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  const q = createFullscreenQuad(THREE, scene, camera, renderer, cfg, buildFrag, {});
  return { start: () => q.start(), stop: () => q.stop(), destroy: () => q.destroy() };
}

// ==================== TunnelEngine ====================
function TunnelEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  const style = cfg.style || 'fractal';

  function buildFrag(isLowEnd) {
    const STEPS = isLowEnd ? 60 : 110;
    if (style === 'twist') {
      return `
      uniform float time;
      uniform vec2 resolution;
      uniform vec2 mouse;
      mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      void main(){
        vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
        float t=time*0.4;
        // Fisheye
        float r=length(uv);
        vec2 fuv=uv*(1.0+r*r*0.3);
        vec3 ro=vec3(0.0,0.0,t*2.0);
        vec3 rd=normalize(vec3(fuv,1.0));
        rd.xy*=rot(sin(t*0.3)*0.3+mouse.x*0.2);
        vec4 acc=vec4(0.0);
        float tt=0.0;
        for(int i=0;i<${STEPS};i++){
          vec3 p=ro+rd*tt;
          p.xy*=rot(p.z*0.1+t*0.2);
          vec3 q=mod(p+1.0,2.0)-1.0;
          float h=hash(floor(p*0.5+0.5));
          float d=max(abs(q.x),abs(q.y))-0.3+0.1*h;
          float glow=exp(-max(d,0.0)*8.0)*0.06;
          vec3 col=0.5+0.5*cos(6.28*(h+vec3(0.0,0.33,0.67)+t*0.1));
          acc.rgb+=col*glow*(1.0-acc.a);
          acc.a+=0.03*(1.0-acc.a);
          tt+=max(abs(d),0.008);
          if(tt>15.0||acc.a>0.99) break;
        }
        vec3 col=acc.rgb/(acc.a+0.001);
        col=col/(1.0+col);
        gl_FragColor=vec4(col*acc.a,1.0);
      }`;
    }
    if (style === 'city') {
      return `
      uniform float time;
      uniform vec2 resolution;
      uniform vec2 mouse;
      mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
      float sdBox(vec3 p,vec3 b){vec3 d=abs(p)-b;return min(max(d.x,max(d.y,d.z)),0.0)+length(max(d,0.0));}
      float menger(vec3 p){
        float d=sdBox(p,vec3(1.0));
        float s=1.0;
        for(int i=0;i<3;i++){
          vec3 a=mod(p*s,2.0)-1.0;
          s*=3.0;
          vec3 r=abs(1.0-3.0*abs(a));
          float c=sdBox(r,vec3(1.0))/s;
          d=max(d,-c);
        }
        return d;
      }
      void main(){
        vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
        float t=time*0.25;
        // Camera flies through the center channel of the Menger sponge
        vec3 ro=vec3(0.0,0.0,t*3.0);
        vec3 rd=normalize(vec3(uv,1.5));
        rd.xy*=rot(sin(t*0.2)*0.15+mouse.x*0.15);
        rd.yz*=rot(sin(t*0.15)*0.1);
        vec3 col=vec3(0.0);
        float tt=0.01;
        for(int i=0;i<${STEPS};i++){
          vec3 p=ro+rd*tt;
          p.xy*=rot(p.z*0.01);
          p=mod(p+2.0,4.0)-2.0;
          float d=menger(p);
          if(d<0.003&&d>-0.01){
            // Surface hit — normal-based lighting
            vec2 e=vec2(0.003,0.0);
            vec3 np=p;
            vec3 n=normalize(vec3(
              menger(np+e.xyy)-menger(np-e.xyy),
              menger(np+e.yxy)-menger(np-e.yxy),
              menger(np+e.yyx)-menger(np-e.yyx)
            ));
            vec3 light=normalize(vec3(0.5,1.0,0.3));
            vec3 light2=normalize(vec3(-0.3,0.2,-0.8));
            float diff=max(dot(n,light),0.0);
            float diff2=max(dot(n,light2),0.0)*0.3;
            float ao=1.0-float(i)/float(${STEPS});
            // Cool blue-teal base color varying with depth
            float fc=tt*0.06+t*0.3;
            vec3 baseCol=vec3(
              0.15+0.1*sin(fc),
              0.25+0.15*sin(fc+1.5),
              0.5+0.2*sin(fc+3.0)
            );
            col=baseCol*(0.15+0.85*diff+diff2)*ao;
            // Distance fog
            col=mix(col,vec3(0.01,0.02,0.05),1.0-exp(-tt*0.06));
            break;
          }
          // Glow only near surfaces (d > 0 and small)
          if(d>0.0&&d<0.5){
            float glow=exp(-d*10.0)*0.03;
            glow*=exp(-tt*0.05);
            float fc=tt*0.08+t*0.4;
            vec3 gc=vec3(
              0.1+0.1*sin(fc),
              0.15+0.15*sin(fc+1.5),
              0.35+0.2*sin(fc+3.0)
            );
            col+=glow*gc;
          }
          // Use abs(d) for step — negative d means inside carved hole
          tt+=max(abs(d),0.008);
          if(tt>18.0) break;
        }
        float vig=1.0-dot(uv*0.6,uv*0.6);
        col*=max(vig,0.0);
        col=col/(1.0+col);
        gl_FragColor=vec4(col,1.0);
      }`;
    }
    // Default: fractal tunnel — fly-through with glowing walls
    return `
    uniform float time;
    uniform vec2 resolution;
    uniform vec2 mouse;
    mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
    vec2 path(float z){return vec2(sin(z*0.15)*2.0,cos(z*0.1)*1.5);}
    void main(){
      vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/resolution.y;
      float t=time*0.6;
      vec3 ro=vec3(path(t),t);
      vec3 target=vec3(path(t+5.0),t+5.0);
      vec3 ww=normalize(target-ro);
      vec3 uu=normalize(cross(vec3(0.0,1.0,0.0),ww));
      vec3 vv=cross(ww,uu);
      vec3 rd=normalize(uv.x*uu+uv.y*vv+1.5*ww);
      // Fixed step volumetric march through tunnel
      vec3 col=vec3(0.0);
      float stepSize=0.08;
      for(int i=0;i<${STEPS};i++){
        float tt=float(i)*stepSize+0.1;
        vec3 p=ro+rd*tt;
        p.xy-=path(p.z);
        float r=length(p.xy);
        // Tunnel radius
        float tunnelR=2.5;
        float wallDist=tunnelR-r;
        // Only glow near walls (wallDist < 1.0)
        if(wallDist<1.5&&wallDist>-0.5){
          // Fractal pattern on wall
          float ang=atan(p.y,p.x);
          float frac=0.0;
          vec2 wp=vec2(ang*3.0,p.z*0.5);
          for(int j=0;j<4;j++){
            wp=abs(wp)-1.0;
            wp*=rot(0.78);
            frac+=abs(wp.x*wp.y)*0.5;
          }
          float intensity=exp(-wallDist*wallDist*5.0)*0.15;
          // Depth fade
          intensity*=exp(-tt*0.03);
          // Color from angle + depth + time
          float fc=ang*0.3+p.z*0.1+t*0.3+frac*0.3;
          vec3 gc=vec3(
            0.2+0.3*sin(fc),
            0.15+0.25*sin(fc+1.8),
            0.45+0.35*sin(fc+3.5)
          );
          col+=gc*intensity;
        }
        // Rotating ring structures
        float ringZ=mod(p.z+1.0,3.0)-1.5;
        if(abs(ringZ)<0.1){
          float ringD=abs(r-1.8);
          float ringGlow=exp(-ringD*ringD*30.0)*0.08;
          ringGlow*=exp(-tt*0.04);
          col+=ringGlow*vec3(0.4,0.5,1.0);
        }
      }
      col=col/(1.0+col);
      gl_FragColor=vec4(col,1.0);
    }`;
  }

  const bgColor = new THREE.Color(cfg.bg || '#000000');
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  const q = createFullscreenQuad(THREE, scene, camera, renderer, cfg, buildFrag, {});
  return { start: () => q.start(), stop: () => q.stop(), destroy: () => q.destroy() };
}

// ==================== MeshlineEngine ====================
// Faithful recreation of Codrops AnimatedMeshLines (THREE.MeshLine + GSAP)
// using inline ribbon geometry + dash shader

// Generate line control points matching original AnimatedMeshLine pattern
function mlGenPoints(THREE, opts) {
  if (opts.points) return opts.points;
  const { length = 2, nbrOfPoints = 3, orientation = [1, 0, 0], turbulence = [0, 0, 0] } = opts;
  const dir = new THREE.Vector3(orientation[0], orientation[1], orientation[2]).normalize().multiplyScalar(length / nbrOfPoints);
  const cur = new THREE.Vector3();
  const pts = [cur.clone()];
  for (let i = 0; i < nbrOfPoints - 1; i++) {
    cur.add(dir);
    pts.push(new THREE.Vector3(
      cur.x + (Math.random() * 2 - 1) * turbulence[0],
      cur.y + (Math.random() * 2 - 1) * turbulence[1],
      cur.z + (Math.random() * 2 - 1) * turbulence[2]
    ));
  }
  pts.push(cur.add(dir).clone());
  // Smooth with CatmullRomCurve3 (like original SplineCurve but 3D)
  if (pts.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(pts);
    return curve.getPoints(50);
  }
  return pts;
}

// Camera-facing ribbon geometry
function mlRibbonGeom(THREE, points, widthFn, camPos) {
  const n = points.length;
  if (n < 2) return new THREE.BufferGeometry();
  const pos = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const idx = [];
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = lens[n - 1] || 1;
  const T = new THREE.Vector3(), V = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (i === 0) T.subVectors(points[1], points[0]);
    else if (i === n - 1) T.subVectors(points[n - 1], points[n - 2]);
    else T.subVectors(points[i + 1], points[i - 1]);
    T.normalize();
    V.subVectors(camPos, points[i]).normalize();
    P.crossVectors(T, V).normalize();
    if (P.lengthSq() < 0.001) P.crossVectors(T, new THREE.Vector3(0, 1, 0)).normalize();
    const t = lens[i] / total;
    const w = widthFn(t) * 0.5;
    const j = i * 2;
    pos[j * 3] = points[i].x - P.x * w; pos[j * 3 + 1] = points[i].y - P.y * w; pos[j * 3 + 2] = points[i].z - P.z * w;
    pos[(j + 1) * 3] = points[i].x + P.x * w; pos[(j + 1) * 3 + 1] = points[i].y + P.y * w; pos[(j + 1) * 3 + 2] = points[i].z + P.z * w;
    uvs[j * 2] = t; uvs[j * 2 + 1] = 0; uvs[(j + 1) * 2] = t; uvs[(j + 1) * 2 + 1] = 1;
    if (i < n - 1) { const a = j, b = j + 1, c = j + 2, d = j + 3; idx.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

// Dash material matching MeshLine's exact shader logic
// dashArray=2, dashRatio close to 1 → single short visible segment traveling along line
// glow: optional flag for boreal-style edge glow (UV.y alpha falloff + smooth dash)
function mlDashMat(THREE, color, visibleLength, opacity, glow) {
  const dashArray = 2;
  const dashRatio = 1 - (visibleLength || 0.1) * 0.5;
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color || '#ffffff') },
      uOpacity: { value: opacity != null ? opacity : 1.0 },
      uDashArray: { value: dashArray },
      uDashOffset: { value: 0.0 },
      uDashRatio: { value: dashRatio },
      uGlow: { value: glow ? 1.0 : 0.0 },
    },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform vec3 uColor;uniform float uOpacity;uniform float uDashArray;uniform float uDashOffset;uniform float uDashRatio;uniform float uGlow;
      varying vec2 vUv;
      void main(){
        float v=fract(vUv.x*uDashArray+uDashOffset);
        if(uGlow>0.5){
          float vis=smoothstep(uDashRatio-0.03,uDashRatio,v);
          if(vis<0.01)discard;
          float d=abs(vUv.y-0.5)*2.0;
          float edge=exp(-d*d*5.0);
          gl_FragColor=vec4(uColor,uOpacity*vis*edge);
        }else{
          float vis=ceil(v-uDashRatio);
          if(vis<0.5)discard;
          gl_FragColor=vec4(uColor,uOpacity);
        }
      }`,
  });
}

// Text animation — per-letter reveal with bounce (mimics original GSAP + 3D text)
function mlAnimateText(container) {
  const els = container.querySelectorAll('h1,h2,h3,[data-meshline-text]');
  if (!els.length) return () => {};
  if (!document.getElementById('wh-ml-css')) {
    const s = document.createElement('style'); s.id = 'wh-ml-css';
    s.textContent = `@keyframes wh-ml-in{0%{opacity:0;transform:translateY(0.6em) rotateX(-40deg)}60%{transform:translateY(-0.08em) rotateX(4deg)}100%{opacity:1;transform:translateY(0) rotateX(0)}}.wh-ml-l{display:inline-block;opacity:0;animation:wh-ml-in 0.6s cubic-bezier(0.175,0.885,0.32,1.275) forwards}.wh-ml-sp{width:0.3em;display:inline-block}`;
    document.head.appendChild(s);
  }
  const saved = [];
  els.forEach(el => {
    saved.push({ el, html: el.innerHTML });
    const text = el.textContent; el.innerHTML = '';
    let delay = 0.3; // initial delay for camera reveal
    [...text].forEach(ch => {
      if (ch === ' ') { el.appendChild(Object.assign(document.createElement('span'), { className: 'wh-ml-sp', innerHTML: '&nbsp;' })); }
      else { const sp = document.createElement('span'); sp.className = 'wh-ml-l'; sp.style.animationDelay = delay + 's'; sp.textContent = ch; el.appendChild(sp); delay += 0.04; }
    });
  });
  return () => { saved.forEach(({ el, html }) => { el.innerHTML = html; }); };
}

// Pulsing stars (matching original Stars.js)
function mlCreateStars(THREE, scene, count, rotate) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, -Math.random() * 0.5).normalize();
    const r = 100 + Math.random() * 200;
    pos[i * 3] = v.x * r; pos[i * 3 + 1] = v.y * r; pos[i * 3 + 2] = v.z * r;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xECF0F1, size: 2.5, transparent: true, opacity: 0.5, sizeAttenuation: false });
  const stars = new THREE.Points(geo, mat);
  scene.add(stars);
  return {
    obj: stars, t: 0,
    onUpdate() {
      this.t += 0.01;
      mat.opacity = 0.35 + Math.sin(this.t) * 0.2;
      if (rotate) { stars.rotation.y -= 0.0004; stars.rotation.x -= 0.0002; }
    },
    dispose() { scene.remove(stars); geo.dispose(); mat.dispose(); }
  };
}

function MeshlineEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;
  const style = cfg.style || 'v1';
  const spd = cfg.speed || 1.0;
  let raf = 0, running = false;
  const objects = []; // managed scene objects with onUpdate/dispose
  const lines = [];
  let mouseX = 0, mouseY = 0, lookAtY = 0;
  let cleanupMouse = () => {}, cleanupText = () => {};
  const rf = (a, b) => a + Math.random() * (b - a);
  const ri = arr => arr[Math.floor(Math.random() * arr.length)];
  // DSL @colors override: if user provides colors, use them instead of style defaults
  const userColors = cfg.colors && cfg.colors.length > 0 ? cfg.colors : null;

  // ---- Style configs matching original 5 Codrops demos ----
  const styles = {
    v1: { // Demo1: Shooting Stars
      bg: '#0c0c14', camZ: 10, camFov: 50,
      camAmpl: [2, 3], camVel: 0.05, freq: 0.1,
      hasStars: true,
      spawn() {
        return [{
          nbrOfPoints: 1, orientation: [-1, -1, 0], turbulence: [0, 0, 0],
          length: rf(5, 10), width: 0.05, color: '#e6e0e3',
          visibleLength: rf(0.15, 0.5), speed: rf(0.01, 0.02),
          position: [rf(-4, 8), rf(-3, 5), rf(-2, 5)],
        }];
      },
    },
    confetti: { // Demo2: Confetti
      bg: '#f5f5f5', camZ: 10, camFov: 50,
      camAmpl: [4, 4], camVel: 0.1, freq: 0.5,
      spawn() {
        const COLORS = ['#4062BB', '#52489C', '#59C3C3', '#F45B69', '#F45B69'];
        const p = new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() - 1, (Math.random() - 0.5) * 2).multiplyScalar(rf(5, 20));
        return [{
          nbrOfPoints: 5, width: 0.15,
          length: rf(8, 15), visibleLength: rf(0.12, 0.4), speed: rf(0.004, 0.008),
          position: [p.x, p.y, p.z],
          turbulence: [rf(-2, 2), rf(0, 2), rf(-2, 2)],
          orientation: [rf(-0.8, 0.8), 1, 1],
          color: ri(COLORS),
        }];
      },
    },
    energy: { // Demo3: Energy
      bg: '#23212b', camZ: 10, camFov: 50,
      camAmpl: [8, 8], camVel: 0.15, freq: 0.1,
      spawn() {
        const COLORS = ['#FDFFFC', '#FDFFFC', '#FDFFFC', '#FDFFFC', '#EA526F', '#71b9f2'];
        const result = [];
        // Main thick lines from left
        result.push({
          nbrOfPoints: 4, orientation: [1, 0, 0], turbulence: [1, 0.8, 1], speed: 0.03,
          width: rf(0.1, 0.3), length: rf(5, 7), visibleLength: rf(0.15, 0.8),
          position: [-3.2, 0.3, rf(-1, 1)], color: ri(COLORS),
          transformLine: 'diamond', rotationX: rf(0, Math.PI * 2),
        });
        // Background thin lines
        if (Math.random() > 0.1) {
          result.push({
            nbrOfPoints: 4, orientation: [1, 0, 0], turbulence: [1, 0.8, 1],
            width: rf(0.05, 0.1), length: rf(5, 10), visibleLength: rf(0.12, 0.6), speed: 0.05,
            position: [rf(-9, 5), rf(-5, 5), rf(-10, 6)], color: ri(COLORS),
            transformLine: 'diamond', rotationX: rf(0, Math.PI * 2),
          });
        }
        return result;
      },
    },
    spiral: { // Demo4: Colors (spiral helix toward camera)
      bg: '#111016', camZ: 6, camFov: 50,
      camAmpl: [1, 1], camVel: 0.1, freq: 0.9, maxLines: 400,
      spawn() {
        const COLORS = ['#dc202e', '#f7ed99', '#2d338b', '#76306b', '#ea8c2d'];
        let z = -1, radius = (Math.random() > 0.8) ? 0.1 : 0.3, angle = rf(0, Math.PI * 2);
        const pts = [];
        while (z < camera.position.z) {
          pts.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, z));
          z += 0.08; angle += 0.025; radius += 0.02;
        }
        return [{ points: pts, visibleLength: rf(0.1, 0.4), speed: rf(0.001, 0.005), color: ri(COLORS), width: rf(0.01, 0.06), transformLine: 'linear' }];
      },
    },
    boreal: { // Demo5: Boreal Sky — raycasting on partial sphere (matching original)
      bg: '#0a0020', camZ: 2, camFov: 50,
      camAmpl: [1, 1], camVel: 0.1, freq: 0.99,
      hasStars: true, starsRotate: true,
      spawn() { return []; }, // overridden after raycasting sphere setup
    },
  };

  const s = styles[style] || styles.v1;

  // Boreal: set up raycasting on partial sphere (faithful to original demo5)
  if (style === 'boreal') {
    const R = 4;
    const SphGeo = THREE.SphereGeometry || THREE.SphereBufferGeometry;
    const sphereGeo = new SphGeo(R, 32, 32, 0, 3.2, 4, 2.1);
    const sphereMat = new THREE.MeshBasicMaterial({ wireframe: true, visible: false });
    const borealSphere = new THREE.Mesh(sphereGeo, sphereMat);
    borealSphere.position.z = 2;
    scene.add(borealSphere);
    objects.push({ dispose() { scene.remove(borealSphere); sphereGeo.dispose(); sphereMat.dispose(); } });
    const bRay = new THREE.Raycaster();
    const bOri = new THREE.Vector3();
    const bDir = new THREE.Vector3();
    const BCOLORS = ['#FFFAFF', '#0A2463', '#3E92CC', '#723bb7', '#efd28e', '#3f9d8c'];
    s.spawn = function() {
      let y = rf(-R * 0.6, R * 1.8);
      let a = Math.PI * (-25) / 180;
      const aMax = Math.PI * 200 / 180;
      const pts = [];
      while (a < aMax) {
        a += 0.2;
        y -= 0.1;
        bOri.set(R * Math.cos(a), y, R * Math.sin(a));
        bDir.set(-bOri.x, 0, -bOri.z).normalize();
        bRay.set(bOri, bDir);
        const hit = bRay.intersectObject(borealSphere, true);
        if (hit.length) pts.push(new THREE.Vector3(hit[0].point.x, hit[0].point.y, hit[0].point.z));
      }
      if (pts.length < 2) return [];
      if (Math.random() > 0.5) {
        // Slow colorful lines with glow
        return [{ points: pts, visibleLength: rf(0.08, 0.35), speed: rf(0.003, 0.008), color: ri(BCOLORS), width: rf(0.008, 0.04), glow: true }];
      } else {
        // Fast thin white lines with glow
        return [{ points: pts, visibleLength: rf(0.1, 0.35), speed: rf(0.01, 0.1), color: '#FFFAFF', width: 0.008, glow: true }];
      }
    };
  }

  // Setup camera
  camera.fov = s.camFov || 50;
  camera.position.set(0, 0, cfg.camera || s.camZ);
  camera.updateProjectionMatrix();
  lookAtY = -6; // will animate up to 0

  // Setup background
  const bgColor = new THREE.Color((cfg.bg && cfg.bg !== '#000000') ? cfg.bg : s.bg);
  scene.background = bgColor;
  renderer.setClearColor(bgColor, 1);

  // Stars
  if (s.hasStars) {
    objects.push(mlCreateStars(THREE, scene, 300, s.starsRotate));
  }

  // Mouse
  if (cfg.mouse) {
    const onMove = e => {
      mouseX = -((e.clientX / window.innerWidth) - 0.5) * (s.camAmpl ? s.camAmpl[0] : 2);
      mouseY = ((e.clientY / window.innerHeight) - 0.5) * (s.camAmpl ? s.camAmpl[1] : 3);
    };
    window.addEventListener('mousemove', onMove);
    cleanupMouse = () => window.removeEventListener('mousemove', onMove);
  }

  // Text animation
  const container = renderer.domElement.parentNode;
  if (container) { setTimeout(() => { cleanupText = mlAnimateText(container); }, 100); }

  // Spawn a line
  function spawnLine() {
    if (s.maxLines && lines.length >= s.maxLines) return;
    const configs = s.spawn();
    for (const lc of configs) {
      // DSL @colors override
      if (userColors) lc.color = ri(userColors);
      const pts = mlGenPoints(THREE, lc);
      if (pts.length < 2) continue;
      const glowMul = lc.glow ? 2.5 : 1; // widen ribbons for glow effect
      const baseW = (lc.width || 0.05) * glowMul;
      const tf = lc.transformLine;
      const widthFn = tf === 'diamond' ? t => baseW * ((0.5 - Math.abs(0.5 - t)) * 3)
        : tf === 'linear' ? t => baseW * t * 1.5
        : () => baseW;
      const geom = mlRibbonGeom(THREE, pts, widthFn, camera.position);
      const mat = mlDashMat(THREE, lc.color, lc.visibleLength || 0.1, lc.opacity, lc.glow);
      const mesh = new THREE.Mesh(geom, mat);
      if (lc.position) mesh.position.set(lc.position[0], lc.position[1], lc.position[2]);
      if (lc.rotationX != null) mesh.rotation.x = lc.rotationX;
      scene.add(mesh);
      const dashRatio = mat.uniforms.uDashRatio.value;
      const voidLen = 2 * dashRatio;
      const dashLen = 2 - voidLen;
      lines.push({ mesh, mat, speed: (lc.speed || 0.01) * spd, dashLen, dyingAt: 1, diedAt: 1 + dashLen });
    }
  }

  function update() {
    // Spawn (probability per frame, like original)
    if (Math.random() < (s.freq || 0.1)) spawnLine();

    // Update lines (matching original AnimatedMeshLine.update)
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      l.mat.uniforms.uDashOffset.value -= l.speed;
      const offset = l.mat.uniforms.uDashOffset.value;
      // Fade out when dying (matching original opacity formula)
      if (offset < -l.dyingAt) {
        l.mat.uniforms.uOpacity.value = Math.max(0, 0.9 + (offset + 1) / l.dashLen);
      }
      // Remove when dead
      if (offset < -l.diedAt) {
        scene.remove(l.mesh); l.mesh.geometry.dispose(); l.mat.dispose();
        lines.splice(i, 1);
      }
    }

    // Camera orbit (matching original HandleCameraOrbit)
    const vel = s.camVel || 0.05;
    camera.position.x += (mouseX - camera.position.x) * vel;
    camera.position.y += (mouseY - camera.position.y) * vel;
    // Camera reveal animation (lookAt tilts up from -6 to 0)
    if (lookAtY < -0.01) lookAtY += (-lookAtY) * 0.025;
    else lookAtY = 0;
    camera.lookAt(0, lookAtY, 0);

    // Update managed objects (stars etc.)
    for (const o of objects) { if (o.onUpdate) o.onUpdate(); }
  }

  function render() {
    if (!running) return;
    update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  return {
    start() { if (running) return; running = true; lookAtY = -6; raf = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() {
      this.stop();
      cleanupMouse(); cleanupText();
      for (const l of lines) { scene.remove(l.mesh); l.mesh.geometry.dispose(); l.mat.dispose(); }
      lines.length = 0;
      for (const o of objects) { if (o.dispose) o.dispose(); }
      objects.length = 0;
      renderer.dispose();
    },
  };
}

// ==================== Simplex 2D Noise ====================
const simplex2D = (() => {
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const grad3 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return function(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    const g0 = grad3[perm[ii + perm[jj]] & 7];
    const g1 = grad3[perm[ii + i1 + perm[jj + j1]] & 7];
    const g2 = grad3[perm[ii + 1 + perm[jj + 1]] & 7];
    let t0 = 0.5 - x0*x0 - y0*y0;
    const n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * (g0[0]*x0 + g0[1]*y0));
    let t1 = 0.5 - x1*x1 - y1*y1;
    const n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * (g1[0]*x1 + g1[1]*y1));
    let t2 = 0.5 - x2*x2 - y2*y2;
    const n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * (g2[0]*x2 + g2[1]*y2));
    return 70 * (n0 + n1 + n2);
  };
})();

function generateHeightMap(THREE, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 1, freq = 3;
      for (let o = 0; o < 6; o++) {
        v += amp * simplex2D(x / size * freq + o * 31.7, y / size * freq + o * 17.3);
        amp *= 0.5; freq *= 2.1;
      }
      // Boost contrast for more defined marble veins
      v = v * 0.5 + 0.5;
      v = Math.pow(v, 0.85);
      const val = Math.max(0, Math.min(255, Math.floor(v * 255)));
      const idx = (y * size + x) * 4;
      img.data[idx] = img.data[idx+1] = img.data[idx+2] = val;
      img.data[idx+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function generateDisplacementMap(THREE, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const offsets = [[0, 0], [137.5, 251.3], [312.7, 87.1]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        let v = 0, amp = 1, freq = 2.5;
        for (let o = 0; o < 5; o++) {
          v += amp * simplex2D(x / size * freq + offsets[ch][0] + o * 43.1, y / size * freq + offsets[ch][1] + o * 67.9);
          amp *= 0.5; freq *= 2;
        }
        img.data[idx + ch] = Math.max(0, Math.min(255, Math.floor((v * 0.5 + 0.5) * 255)));
      }
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createStudioEnvMap(THREE, renderer) {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0.08, 0.07, 0.06);
  const addPanel = (x, y, z, w, h, r, g, b, rx, ry) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx !== undefined) { m.rotation.x = rx; m.rotation.y = ry || 0; }
    else m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  // Large "window" panels — distinct bright areas that create visible moving highlights
  // Key window: upper-right wall (warm white, large)
  addPanel(6, 3, -1, 3, 4, 18, 17, 15, 0, -Math.PI/2);
  // Secondary window: upper-left wall (cool white, medium)
  addPanel(-6, 2.5, 1, 2.5, 3, 12, 13, 15, 0, Math.PI/2);
  // Back wall: diffuse warm panel
  addPanel(0, 2, -7, 4, 3, 6, 5.5, 4.5);
  // Ceiling fluorescents — elongated, asymmetric placement
  addPanel(-2, 6, -1, 5, 0.4, 14, 14, 13, -Math.PI/2, 0);
  addPanel(2, 6, 2, 4, 0.3, 10, 10, 9.5, -Math.PI/2, 0);
  addPanel(0, 6, -3, 3, 0.35, 8, 8, 7.5, -Math.PI/2, 0);
  // Floor: warm bounce (subtle)
  addPanel(0, -3, 0, 16, 16, 0.4, 0.3, 0.2, Math.PI/2, 0);
  // Accent spots — small intense for rim sparkle
  addPanel(3, 5, -4, 0.6, 0.6, 20, 19, 17);
  addPanel(-4, 4, 3, 0.5, 0.5, 16, 15, 14);
  addPanel(5, 2, 4, 0.4, 0.4, 12, 11, 10);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  pmrem.dispose();
  envScene.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
  return envMap;
}


// ==================== MarbleEngine ====================
function MarbleEngine(ctx, cfg) {
  const { THREE, scene, camera, renderer } = ctx;

  // Save and override renderer settings
  const prevToneMapping = renderer.toneMapping;
  const prevExposure = renderer.toneMappingExposure;
  const prevClearColor = renderer.getClearColor(new THREE.Color());
  const prevClearAlpha = renderer.getClearAlpha();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  camera.position.set(0, 0, 2);
  camera.fov = 75; // match R3F default — sphere fills viewport
  camera.updateProjectionMatrix();

  // Color palettes [H, S, L]
  const palettes = {
    red:     [0, 100, 50],
    olive:   [60, 100, 50],
    emerald: [150, 100, 50],
    blue:    [240, 70, 60],
    silver:  [0, 0, 80],
  };
  const paletteNames = Object.keys(palettes);

  // Determine starting style
  let styleIdx = 0;
  const styleName = (cfg.style || 'red').toLowerCase();
  const found = paletteNames.indexOf(styleName);
  if (found >= 0) styleIdx = found;

  // Parse custom HSL from @colors if provided: "H,S,L"
  let customHSL = null;
  if (cfg.colors && cfg.colors.length >= 3) {
    const nums = cfg.colors.map(Number);
    if (nums.every(n => !isNaN(n))) customHSL = nums;
  }

  function getHSL() {
    return customHSL || palettes[paletteNames[styleIdx % paletteNames.length]];
  }

  // Noise textures — lazy loaded from external files
  const loader = new THREE.TextureLoader();
  let heightMap = null;
  let displacementMap = null;
  let texturesReady = false;

  const texPromise = Promise.all([
    new Promise(resolve => {
      loader.load('/assets/images/marble-noise.jpg', tex => {
        tex.minFilter = THREE.NearestFilter;
        heightMap = tex;
        uniforms.heightMap.value = tex;
        resolve();
      });
    }),
    new Promise(resolve => {
      loader.load('/assets/images/marble-noise3d.jpg', tex => {
        tex.minFilter = THREE.NearestFilter;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        displacementMap = tex;
        uniforms.displacementMap.value = tex;
        resolve();
      });
    }),
  ]).then(() => { texturesReady = true; });

  // Environment map
  const envMap = createStudioEnvMap(THREE, renderer);

  // Current color state
  let currentHSL = getHSL().slice();
  let targetHSL = currentHSL.slice();

  function hslToColor(hsl) {
    const c = new THREE.Color();
    c.setHSL(hsl[0] / 360, hsl[1] / 100, hsl[2] / 100);
    return c;
  }

  // Background gradient sphere
  const bgGeo = new THREE.SphereGeometry(20, 32, 16);
  const bgMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      centerColor: { value: new THREE.Color() },
      edgeColor: { value: new THREE.Color() },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 centerColor;
      uniform vec3 edgeColor;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float t = pow(d, 1.5);
        gl_FragColor = vec4(mix(centerColor, edgeColor, t), 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(bgGeo, bgMat));

  function updateBgColors(hsl) {
    const [h, s, l] = hsl;
    bgMat.uniforms.centerColor.value.setHSL(h / 360, (s * 0.7) / 100, l / 100);
    bgMat.uniforms.edgeColor.value.setHSL(h / 360, (s * 0.4) / 100, (l * 0.2) / 100);
  }
  updateBgColors(currentHSL);

  // Marble material uniforms
  const uniforms = {
    time: { value: 0 },
    colorA: { value: new THREE.Color(0, 0, 0) },
    colorB: { value: hslToColor(currentHSL) },
    heightMap: { value: null },
    displacementMap: { value: null },
    iterations: { value: 48 },
    depth: { value: 0.6 },
    smoothing: { value: 0.2 },
    displacement: { value: 0.1 },
  };

  // Marble sphere
  const sphereGeo = new THREE.SphereGeometry(1, 64, 32);
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.1,
    metalness: 0.0,
    envMap: envMap,
    envMapIntensity: 1.0,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms = Object.assign(shader.uniforms, uniforms);

    // Vertex: add varyings
    shader.vertexShader = `
      varying vec3 v_pos;
      varying vec3 v_dir;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      /void main\(\) {/,
      `void main() {
        v_dir = position - cameraPosition;
        v_pos = position;
      `
    );

    // Fragment: add uniforms and functions
    shader.fragmentShader = `
      #define FLIP vec2(1., -1.)

      uniform vec3 colorA;
      uniform vec3 colorB;
      uniform sampler2D heightMap;
      uniform sampler2D displacementMap;
      uniform int iterations;
      uniform float depth;
      uniform float smoothing;
      uniform float displacement;
      uniform float time;

      varying vec3 v_pos;
      varying vec3 v_dir;
    ` + shader.fragmentShader;

    // Insert marchMarble before main()
    shader.fragmentShader = shader.fragmentShader.replace(
      /void main\(\) {/,
      `
      vec3 displacePoint(vec3 p, float strength) {
        vec2 uv = equirectUv(normalize(p));
        vec2 scroll = vec2(time, 0.);
        vec3 displacementA = texture2D(displacementMap, uv + scroll).rgb;
        vec3 displacementB = texture2D(displacementMap, uv * FLIP - scroll).rgb;
        displacementA -= 0.5;
        displacementB -= 0.5;
        return p + strength * (displacementA + displacementB);
      }

      vec3 marchMarble(vec3 rayOrigin, vec3 rayDir) {
        float perIteration = 1. / float(iterations);
        vec3 deltaRay = rayDir * perIteration * depth;
        vec3 p = rayOrigin;
        float totalVolume = 0.;
        for (int i = 0; i < 48; ++i) {
          vec3 displaced = displacePoint(p, displacement);
          vec2 uv = equirectUv(normalize(displaced));
          float heightMapVal = texture2D(heightMap, uv).r;
          float height = length(p);
          float cutoff = 1. - float(i) * perIteration;
          float slice = smoothstep(cutoff, cutoff + smoothing, heightMapVal);
          totalVolume += slice * perIteration;
          p += deltaRay;
        }
        return mix(colorA, colorB, totalVolume);
      }
      void main() {
      `
    );

    // Replace diffuseColor with ray march result
    shader.fragmentShader = shader.fragmentShader.replace(
      /vec4 diffuseColor\s*=\s*vec4\(\s*diffuse\s*,\s*opacity\s*\)\s*;/,
      `
      vec3 rayDir = normalize(v_dir);
      vec3 rayOrigin = v_pos;
      vec3 rgb = marchMarble(rayOrigin, rayDir);
      vec4 diffuseColor = vec4(rgb, 1.0);
      `
    );
  };

  mat.customProgramCacheKey = function() { return 'marble'; };

  const sphere = new THREE.Mesh(sphereGeo, mat);
  scene.add(sphere);

  // Scene lights (matching original R3F setup)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(2, 3, 5);
  scene.add(dirLight);

  // Mouse tracking
  let mouseX = 0, mouseY = 0;
  let smoothMouseX = 0, smoothMouseY = 0;
  const canvas = renderer.domElement;

  function onMouseMove(e) {
    if (!cfg.mouse) return;
    const rect = canvas.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  }

  // Click to cycle colors + bounce + internal disturbance
  let bounceScale = 1;
  let bounceVel = 0;
  // Spring-animated time offset (original uses tension: 50)
  let timeOffsetTarget = 0;
  let timeOffsetCurrent = 0;
  let timeOffsetVel = 0;
  function cycleColor() {
    if (customHSL) return;
    styleIdx = (styleIdx + 1) % paletteNames.length;
    targetHSL = palettes[paletteNames[styleIdx]].slice();
    timeOffsetTarget += 0.2;
  }
  function onClick() {
    cycleColor();
    bounceScale = 0.93;
    bounceVel = 0;
  }

  // Auto-cycle: @cycle N means cycle every N seconds (0 = disabled)
  const cycleInterval = cfg.cycle || 0;
  let lastCycleTime = 0;

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);

  // Animation
  let animId = 0;
  let running = false;
  let startTime = 0;
  let colorLerp = 0;

  function lerpHSL(a, b, t) {
    // Handle hue wrapping
    let dh = b[0] - a[0];
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    return [
      (a[0] + dh * t + 360) % 360,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  function animate(time) {
    if (!running) return;
    animId = requestAnimationFrame(animate);

    if (!startTime) startTime = time;
    const elapsed = (time - startTime) / 1000;
    const dt = 1 / 60;

    // Auto-cycle colors
    if (cycleInterval > 0 && elapsed - lastCycleTime >= cycleInterval) {
      lastCycleTime = elapsed;
      cycleColor();
    }

    // Spring-animated time offset (soft, tension ~50)
    const offsetForce = (timeOffsetTarget - timeOffsetCurrent) * 3.5;
    timeOffsetVel = (timeOffsetVel + offsetForce * dt) * 0.96;
    timeOffsetCurrent += timeOffsetVel;

    // Update time uniform
    uniforms.time.value = timeOffsetCurrent + elapsed * 0.05;

    // Color transition
    const needsTransition = currentHSL[0] !== targetHSL[0] || currentHSL[1] !== targetHSL[1] || currentHSL[2] !== targetHSL[2];
    if (needsTransition) {
      colorLerp = Math.min(colorLerp + dt * 2, 1);
      const interp = lerpHSL(currentHSL, targetHSL, colorLerp);
      uniforms.colorB.value = hslToColor(interp);
      updateBgColors(interp);
      if (colorLerp >= 1) {
        currentHSL = targetHSL.slice();
        colorLerp = 0;
      }
    }

    // Bounce spring (tension=300, friction=15 equivalent)
    const springForce = (1 - bounceScale) * 18;
    bounceVel = (bounceVel + springForce) * 0.82;
    bounceScale += bounceVel * dt;
    sphere.scale.setScalar(bounceScale);

    // Camera orbits the sphere (NOT sphere rotation!) — critical for ray march
    // Original: OrbitControls autoRotate, NO mouse sway (enableRotate/Pan/Zoom=false)
    const orbitAngle = elapsed * 0.21;
    const orbitR = 2;
    camera.position.x = Math.sin(orbitAngle) * orbitR;
    camera.position.z = Math.cos(orbitAngle) * orbitR;
    camera.position.y = 0;
    camera.lookAt(0, 0, 0);

    if (texturesReady) renderer.render(scene, camera);
  }

  return {
    start() {
      if (running) return;
      running = true;
      startTime = 0;
      animId = requestAnimationFrame(animate);
    },
    stop() {
      running = false;
      cancelAnimationFrame(animId);
    },
    destroy() {
      this.stop();
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
      scene.remove(sphere);
      scene.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (c.material.uniforms) {
            for (const u of Object.values(c.material.uniforms)) {
              if (u.value && u.value.dispose) u.value.dispose();
            }
          }
          c.material.dispose();
        }
      });
      if (heightMap) heightMap.dispose();
      if (displacementMap) displacementMap.dispose();
      envMap.dispose();
      sphereGeo.dispose();
      mat.dispose();
      bgGeo.dispose();
      bgMat.dispose();
      renderer.toneMapping = prevToneMapping;
      renderer.toneMappingExposure = prevExposure;
      renderer.setClearColor(prevClearColor, prevClearAlpha);
    },
  };
}

// ==================== Public Init ====================
const engines = { wave: WaveEngine, blob: BlobEngine, cube: CubeEngine, rings: RingsEngine, galaxy: GalaxyEngine, collapse: CollapseEngine, landscape: LandscapeEngine, ocean: OceanEngine, aurora: AuroraEngine, topo: TopoEngine, retrowave: RetrowaveEngine, clouds: CloudsEngine, crystal: CrystalEngine, phantom: PhantomEngine, lightcube: LightcubeEngine, reflect: ReflectEngine, network: NetworkEngine, gyroid: GyroidEngine, tunnel: TunnelEngine, metaball: MetaballEngine, cubegrid: CubegridEngine, abstract: AbstractEngine, meshline: MeshlineEngine, marble: MarbleEngine };

function init(target, opts) {
  opts = opts || {};
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return Promise.resolve(null);
  injectCSS();

  const text = opts.data || '';
  const cfg = parseConfig(text);
  // Allow opts to override
  if (opts.mode) cfg.mode = opts.mode;

  el.classList.add('wh');

  const canvas = document.createElement('canvas');
  el.insertBefore(canvas, el.firstChild);

  return new Promise(resolve => {
    ensureThree(() => {
      const EngineFn = engines[cfg.mode] || WaveEngine;
      const ctx = createScene(canvas, cfg);
      const cleanupResize = setupResize(canvas, ctx.camera, ctx.renderer);

      const engine = EngineFn(ctx, cfg);

      // Visibility observer — pause when off screen
      let cleanupVis = () => {};
      if (typeof IntersectionObserver !== 'undefined') {
        const io = new IntersectionObserver(entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) engine.start();
            else engine.stop();
          }
        }, { threshold: 0.1 });
        io.observe(el);
        cleanupVis = () => io.disconnect();
      } else {
        engine.start();
      }

      resolve({
        destroy() {
          engine.destroy();
          cleanupResize();
          cleanupVis();
          el.classList.remove('wh');
          if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        },
      });
    });
  });
}

window.WebGLHero = init;

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  for (const s of document.querySelectorAll('script[type="text/webgl-hero"]')) {
    const t = s.dataset.target;
    if (t) {
      init(t, { data: s.textContent });
    } else {
      const div = document.createElement('div');
      div.style.cssText = 'width:100%;height:100%';
      s.parentNode.insertBefore(div, s);
      init(div, { data: s.textContent });
    }
  }
});

})();
