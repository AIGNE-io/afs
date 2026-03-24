;(() => {
'use strict';

// ==================== CSS ====================
const CSS = `
.tb{
  --tb-text:var(--theme-text-inverse,#f5f5f5);
  --tb-text-dim:var(--theme-text-secondary,#404040);
  --tb-bg:var(--theme-bg-inverse,#0a0a0a);
  --tb-font:var(--font-mono,'JetBrains Mono','Fira Code',monospace);
  font-family:var(--tb-font);
  background:var(--tb-bg);
  color:var(--tb-text);
  overflow:hidden;
  line-height:1.4;
  position:relative;
  box-sizing:border-box;
}
.tb *,.tb *::before,.tb *::after{box-sizing:border-box;margin:0;padding:0}

/* Shuffle mode */
.tb-shuffle{padding:24px;display:flex;flex-direction:column;gap:4px}
.tb-sline{white-space:pre;overflow:hidden}
.tb-sline span{display:inline-block;transition:color .15s}
.tb-sline span.tb-dim{color:var(--tb-text-dim)}

/* Matrix + Noise mode */
.tb-grid{padding:8px;white-space:pre;overflow:hidden;user-select:none}
.tb-grid-line{display:block;overflow:hidden}
.tb-hi{font-weight:bold}

/* Spotlight mode */
.tb-spot{position:relative;padding:8px;white-space:pre;overflow:hidden;user-select:none;cursor:crosshair}
.tb-spot-chars{position:relative;z-index:1;
  -webkit-mask-image:radial-gradient(var(--tb-radius,250px) circle at var(--tb-x,50%) var(--tb-y,50%),black 20%,rgba(0,0,0,.15),transparent);
  mask-image:radial-gradient(var(--tb-radius,250px) circle at var(--tb-x,50%) var(--tb-y,50%),black 20%,rgba(0,0,0,.15),transparent)}
.tb-spot-chars .tb-grid-line{display:block;overflow:hidden}
.tb-spot-grad{position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;pointer-events:none;
  background:radial-gradient(var(--tb-radius,250px) circle at var(--tb-x,50%) var(--tb-y,50%),var(--tb-grad-1,#6366f1),var(--tb-grad-2,#8b5cf6),transparent);
  mix-blend-mode:screen;opacity:.6}
.tb-spot:not(:hover) .tb-spot-chars{-webkit-mask-image:none;mask-image:none;opacity:.08}
.tb-spot:not(:hover) .tb-spot-grad{opacity:0}
.tb-spot:hover .tb-spot-chars{transition:opacity .3s}
.tb-spot-grad{transition:opacity .3s}
`;

function injectCSS() {
  if (document.getElementById('tb-css')) return;
  const s = document.createElement('style');
  s.id = 'tb-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ==================== Shared ====================
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$&*<>[]{}=/\\|~^';
function rndChar() { return CHARS[Math.random() * CHARS.length | 0]; }
function rndInt(max) { return Math.random() * max | 0; }

// ==================== DSL Parser ====================
function parseConfig(text) {
  const lines = text.split('\n');
  const cfg = {
    mode: 'shuffle',
    cols: 60,
    rows: 16,
    speed: 1.0,
    effect: 'cascade',
    loop: false,
    colors: [],
    radius: 250,
    bg: '',
    fg: '',
    avoid: '',
    phrases: [],
  };

  let inContent = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;

    if (t[0] === '@') {
      const sp = t.indexOf(' ');
      if (sp > 0) {
        const key = t.slice(1, sp).toLowerCase();
        const val = t.slice(sp + 1).trim();
        switch (key) {
          case 'mode': cfg.mode = val; break;
          case 'cols': cfg.cols = parseInt(val, 10) || 60; break;
          case 'rows': cfg.rows = parseInt(val, 10) || 16; break;
          case 'speed': cfg.speed = parseFloat(val) || 1.0; break;
          case 'effect': cfg.effect = val; break;
          case 'loop': cfg.loop = val === 'true'; break;
          case 'colors': cfg.colors = val.split(',').map(s => s.trim()); break;
          case 'radius': cfg.radius = parseInt(val, 10) || 250; break;
          case 'bg': cfg.bg = val; break;
          case 'fg': cfg.fg = val; break;
          case 'avoid': cfg.avoid = val; break;
        }
      }
      continue;
    }

    if (t === '---') { inContent = true; continue; }
    cfg.phrases.push(t);
  }

  return cfg;
}

// ==================== ShuffleEngine ====================
function ShuffleEngine(container, cfg) {
  const lines = cfg.phrases;
  if (!lines.length) return { destroy() {} };

  container.classList.add('tb-shuffle');
  const speed = cfg.speed;
  const effect = cfg.effect;
  const colors = cfg.colors.length ? cfg.colors : null;
  let raf = 0;
  let running = false;

  // Build DOM
  const lineEls = lines.map(line => {
    const div = document.createElement('div');
    div.className = 'tb-sline';
    const spans = [];
    for (let i = 0; i < line.length; i++) {
      const span = document.createElement('span');
      span.textContent = rndChar();
      span.classList.add('tb-dim');
      div.appendChild(span);
      spans.push({ el: span, target: line[i], resolved: false, flipCount: 0, maxFlips: 0, delay: 0, startTime: 0 });
    }
    container.appendChild(div);
    return { el: div, chars: spans };
  });

  function computeDelays() {
    const totalDuration = 2000 / speed;

    for (let li = 0; li < lineEls.length; li++) {
      const line = lineEls[li];
      for (let ci = 0; ci < line.chars.length; ci++) {
        const ch = line.chars[ci];
        ch.resolved = false;
        ch.flipCount = 0;
        ch.el.textContent = rndChar();
        ch.el.classList.add('tb-dim');
        if (colors) ch.el.style.color = '';

        switch (effect) {
          case 'wave':
            ch.delay = ((li * line.chars.length + ci) / (lineEls.length * (line.chars.length || 1))) * totalDuration * 0.6;
            ch.maxFlips = 8 + rndInt(8);
            break;
          case 'scatter':
            ch.delay = Math.random() * totalDuration * 0.8;
            ch.maxFlips = 6 + rndInt(10);
            break;
          case 'flicker':
            ch.delay = 0;
            ch.maxFlips = 15 + rndInt(10);
            break;
          default: // cascade
            ch.delay = li * 200 / speed;
            ch.maxFlips = 10 + rndInt(6);
            break;
        }
      }
    }
  }

  function animate(startTime) {
    if (!running) return;
    const now = performance.now();
    const elapsed = now - startTime;
    let allDone = true;

    for (const line of lineEls) {
      for (const ch of line.chars) {
        if (ch.resolved) continue;
        if (elapsed < ch.delay) { allDone = false; continue; }

        const localElapsed = elapsed - ch.delay;
        const flipInterval = 50 / speed;
        const expectedFlips = Math.floor(localElapsed / flipInterval);

        if (expectedFlips > ch.flipCount) {
          ch.flipCount = expectedFlips;
          if (ch.flipCount >= ch.maxFlips) {
            ch.el.textContent = ch.target;
            ch.el.classList.remove('tb-dim');
            if (colors) ch.el.style.color = '';
            ch.resolved = true;
          } else {
            ch.el.textContent = rndChar();
            if (colors) {
              ch.el.style.color = colors[rndInt(colors.length)];
            }
          }
        }
        if (!ch.resolved) allDone = false;
      }
    }

    if (allDone) {
      if (cfg.loop) {
        setTimeout(() => {
          if (!running) return;
          computeDelays();
          raf = requestAnimationFrame(() => animate(performance.now()));
        }, 2000 / speed);
      }
      return;
    }

    raf = requestAnimationFrame(() => animate(startTime));
  }

  function start() {
    if (running) return;
    running = true;
    computeDelays();
    raf = requestAnimationFrame(() => animate(performance.now()));
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  return { start, stop, destroy() { stop(); container.innerHTML = ''; } };
}

// ==================== MatrixEngine ====================
function MatrixEngine(container, cfg) {
  const cols = cfg.cols;
  const rows = cfg.rows;
  const phrases = cfg.phrases.length ? cfg.phrases : ['HELLO WORLD', 'TYPE BLOCK', 'ASCII ART'];
  const speed = cfg.speed;
  const userColors = cfg.colors.length ? cfg.colors : null;
  let raf = 0;
  let running = false;

  container.classList.add('tb-grid');

  // Grid state
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({ ch: rndChar(), hi: false, color: '' });
    }
    grid.push(row);
  }

  // Phrase placement
  let currentPhrases = [];
  let phraseIndex = 0;

  function placePhrases() {
    currentPhrases = [];
    const count = Math.min(phrases.length, Math.max(2, Math.floor(rows / 3)));
    const usedRows = new Set();

    for (let i = 0; i < count; i++) {
      const text = phrases[(phraseIndex + i) % phrases.length];
      let row, attempts = 0;
      do {
        row = rndInt(rows);
        attempts++;
      } while (usedRows.has(row) && attempts < rows * 2);
      usedRows.add(row);

      const maxStart = Math.max(0, cols - text.length);
      const col = rndInt(maxStart + 1);
      const hue = userColors
        ? userColors[i % userColors.length]
        : `hsl(${(phraseIndex * 60 + i * 120) % 360},70%,60%)`;

      currentPhrases.push({ text, row, col, color: hue });
    }
    phraseIndex += count;
  }

  // Tween state
  let phase = 'show'; // show | hold | hide | wait
  let tweenStart = 0;
  const showDuration = 1500 / speed;
  const holdDuration = 1200 / speed;
  const hideDuration = 800 / speed;
  const waitDuration = 400 / speed;

  function buildHTML() {
    let html = '';
    for (let r = 0; r < rows; r++) {
      html += '<span class="tb-grid-line">';
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell.hi && cell.color) {
          html += `<span class="tb-hi" style="color:${cell.color}">${escChar(cell.ch)}</span>`;
        } else if (cell.hi) {
          html += `<span class="tb-hi">${escChar(cell.ch)}</span>`;
        } else {
          html += `<span style="color:var(--tb-text-dim)">${escChar(cell.ch)}</span>`;
        }
      }
      html += '</span>';
    }
    container.innerHTML = html;
  }

  function escChar(ch) {
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '&') return '&amp;';
    return ch;
  }

  function animate() {
    if (!running) return;
    const now = performance.now();
    const elapsed = now - tweenStart;

    // Shuffle noise characters every few frames
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c].hi && Math.random() < 0.05) {
          grid[r][c].ch = rndChar();
        }
      }
    }

    switch (phase) {
      case 'show': {
        const progress = Math.min(1, elapsed / showDuration);
        // Two-stage: first expand visible range, then reveal phrases
        const showRateA = Math.min(1, progress * 2);       // 0-0.5 → expand range
        const showRateB = Math.max(0, (progress - 0.3) / 0.7); // 0.3-1.0 → reveal text

        for (const p of currentPhrases) {
          const visibleChars = Math.floor(p.text.length * showRateA);
          const revealedChars = Math.floor(p.text.length * showRateB);

          for (let i = 0; i < p.text.length; i++) {
            const r = p.row;
            const c = p.col + i;
            if (c >= cols) break;

            if (i < revealedChars) {
              grid[r][c].ch = p.text[i];
              grid[r][c].hi = true;
              grid[r][c].color = p.color;
            } else if (i < visibleChars) {
              grid[r][c].ch = rndChar();
              grid[r][c].hi = true;
              grid[r][c].color = p.color;
            } else {
              grid[r][c].hi = false;
              grid[r][c].color = '';
            }
          }
        }

        if (progress >= 1) { phase = 'hold'; tweenStart = now; }
        break;
      }
      case 'hold':
        if (elapsed >= holdDuration) { phase = 'hide'; tweenStart = now; }
        break;
      case 'hide': {
        const progress = Math.min(1, elapsed / hideDuration);
        for (const p of currentPhrases) {
          const hiddenChars = Math.floor(p.text.length * progress);
          for (let i = 0; i < p.text.length; i++) {
            const c = p.col + i;
            if (c >= cols) break;
            if (i < hiddenChars) {
              grid[p.row][c].hi = false;
              grid[p.row][c].color = '';
              grid[p.row][c].ch = rndChar();
            }
          }
        }
        if (progress >= 1) { phase = 'wait'; tweenStart = now; }
        break;
      }
      case 'wait':
        if (elapsed >= waitDuration) {
          placePhrases();
          phase = 'show';
          tweenStart = now;
        }
        break;
    }

    buildHTML();
    raf = requestAnimationFrame(animate);
  }

  function start() {
    if (running) return;
    running = true;
    placePhrases();
    phase = 'show';
    tweenStart = performance.now();
    raf = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  return { start, stop, destroy() { stop(); container.innerHTML = ''; } };
}

// ==================== NoiseEngine ====================
function NoiseEngine(container, cfg) {
  const cols = cfg.cols;
  const rows = cfg.rows;
  const keywords = cfg.phrases.length ? cfg.phrases : ['TYPE', 'BLOCK', 'NOISE'];
  const speed = cfg.speed;
  let raf = 0;
  let running = false;

  container.classList.add('tb-grid');

  // Grid state
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({ ch: rndChar(), hi: false, fade: 0 });
    }
    grid.push(row);
  }

  // Placement state — each keyword has current + next position for crossfade
  const placements = [];
  // Avoid center rows if configured (shared by placeKeywords + startReposition)
  const avoidCenter = cfg.avoid === 'center';
  const topZone = Math.floor(rows * 0.18);
  const bottomStart = Math.floor(rows * 0.82);
  function placeKeywords() {
    placements.length = 0;
    const usedCells = new Set();

    for (const word of keywords) {
      let placed = false;
      for (let attempt = 0; attempt < 50 && !placed; attempt++) {
        let r;
        if (avoidCenter) {
          r = Math.random() < 0.5 ? rndInt(topZone) : bottomStart + rndInt(rows - bottomStart);
        } else {
          r = rndInt(rows);
        }
        const c = rndInt(Math.max(1, cols - word.length));
        let overlap = false;
        for (let i = 0; i < word.length; i++) {
          if (usedCells.has(`${r},${c + i}`)) { overlap = true; break; }
        }
        if (!overlap && c + word.length <= cols) {
          for (let i = 0; i < word.length; i++) {
            usedCells.add(`${r},${c + i}`);
          }
          placements.push({ word, row: r, col: c, opacity: 1 });
          placed = true;
        }
      }
    }
  }

  // Move a random subset of keywords to new positions periodically
  let lastReposition = 0;
  const repositionInterval = 3000 / speed;
  let fading = []; // { word, oldRow, oldCol, newRow, newCol, progress }

  function startReposition() {
    // Pick ~half the keywords to move
    const count = Math.max(1, Math.floor(placements.length * 0.4));
    const indices = [];
    while (indices.length < count) {
      const idx = rndInt(placements.length);
      if (!indices.includes(idx)) indices.push(idx);
    }

    fading = [];
    const usedCells = new Set();
    // Reserve cells for keywords that are NOT moving
    for (let i = 0; i < placements.length; i++) {
      if (indices.includes(i)) continue;
      const p = placements[i];
      for (let j = 0; j < p.word.length; j++) usedCells.add(`${p.row},${p.col + j}`);
    }

    for (const idx of indices) {
      const p = placements[idx];
      // Find new position
      let newRow, newCol, found = false;
      for (let attempt = 0; attempt < 50 && !found; attempt++) {
        if (avoidCenter) {
          newRow = Math.random() < 0.5 ? rndInt(topZone) : bottomStart + rndInt(rows - bottomStart);
        } else {
          newRow = rndInt(rows);
        }
        newCol = rndInt(Math.max(1, cols - p.word.length));
        let ok = true;
        for (let i = 0; i < p.word.length; i++) {
          if (usedCells.has(`${newRow},${newCol + i}`)) { ok = false; break; }
        }
        if (ok && newCol + p.word.length <= cols) {
          found = true;
          for (let i = 0; i < p.word.length; i++) usedCells.add(`${newRow},${newCol + i}`);
        }
      }
      if (found) {
        fading.push({ idx, oldRow: p.row, oldCol: p.col, newRow, newCol, word: p.word });
      }
    }
  }

  function escChar(ch) {
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '&') return '&amp;';
    return ch;
  }

  function buildHTML(fadeProgress) {
    // Reset highlights
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        grid[r][c].hi = false;
        grid[r][c].fade = 0;
      }
    }

    // Apply static keyword highlights
    for (const p of placements) {
      for (let i = 0; i < p.word.length; i++) {
        const c = p.col + i;
        if (c < cols) {
          grid[p.row][c].ch = p.word[i];
          grid[p.row][c].hi = true;
          grid[p.row][c].fade = 1;
        }
      }
    }

    // Apply fading keywords (old fading out, new fading in)
    if (fadeProgress > 0 && fadeProgress < 1) {
      for (const f of fading) {
        // Old position fades out
        const outOpacity = Math.max(0, 1 - fadeProgress * 2); // 0→0.5: 1→0
        for (let i = 0; i < f.word.length; i++) {
          const c = f.oldCol + i;
          if (c < cols) {
            if (outOpacity > 0) {
              grid[f.oldRow][c].ch = f.word[i];
              grid[f.oldRow][c].hi = true;
              grid[f.oldRow][c].fade = outOpacity;
            } else {
              grid[f.oldRow][c].hi = false;
              grid[f.oldRow][c].fade = 0;
            }
          }
        }
        // New position fades in
        const inOpacity = Math.max(0, (fadeProgress - 0.5) * 2); // 0.5→1: 0→1
        for (let i = 0; i < f.word.length; i++) {
          const c = f.newCol + i;
          if (c < cols) {
            if (inOpacity > 0) {
              grid[f.newRow][c].ch = f.word[i];
              grid[f.newRow][c].hi = true;
              grid[f.newRow][c].fade = inOpacity;
            }
          }
        }
      }
    }

    let html = '';
    for (let r = 0; r < rows; r++) {
      html += '<span class="tb-grid-line">';
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell.hi) {
          const op = cell.fade < 1 ? `;opacity:${cell.fade.toFixed(2)}` : '';
          html += `<span class="tb-hi" style="color:var(--tb-text)${op}">${escChar(cell.ch)}</span>`;
        } else {
          html += `<span style="color:var(--tb-text-dim)">${escChar(cell.ch)}</span>`;
        }
      }
      html += '</span>';
    }
    container.innerHTML = html;
  }

  let lastFlip = 0;
  const flipInterval = 80 / speed;
  let fadeStart = 0;
  const fadeDuration = 800 / speed;

  function animate(now) {
    if (!running) return;

    // Reposition keywords periodically
    if (now - lastReposition > repositionInterval) {
      lastReposition = now;
      startReposition();
      fadeStart = now;
    }

    // Calculate fade progress
    let fadeProgress = 0;
    if (fading.length && fadeStart) {
      fadeProgress = Math.min(1, (now - fadeStart) / fadeDuration);
      if (fadeProgress >= 1) {
        // Commit new positions
        for (const f of fading) {
          placements[f.idx].row = f.newRow;
          placements[f.idx].col = f.newCol;
        }
        fading = [];
        fadeStart = 0;
        fadeProgress = 0;
      }
    }

    if (now - lastFlip > flipInterval) {
      lastFlip = now;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!grid[r][c].hi && Math.random() < 0.03) {
            grid[r][c].ch = rndChar();
          }
        }
      }
      buildHTML(fadeProgress);
    } else if (fading.length) {
      buildHTML(fadeProgress);
    }

    raf = requestAnimationFrame(animate);
  }

  function start() {
    if (running) return;
    running = true;
    placeKeywords();
    buildHTML(0);
    lastFlip = performance.now();
    lastReposition = performance.now();
    raf = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  return { start, stop, destroy() { stop(); container.innerHTML = ''; } };
}

// ==================== SpotlightEngine ====================
function SpotlightEngine(container, cfg) {
  const cols = cfg.cols;
  const rows = cfg.rows;
  const speed = cfg.speed;
  const radius = cfg.radius;
  const colors = cfg.colors.length >= 2 ? cfg.colors : ['#6366f1', '#8b5cf6'];
  let raf = 0;
  let running = false;

  container.classList.add('tb-spot');
  container.style.setProperty('--tb-radius', radius + 'px');
  container.style.setProperty('--tb-grad-1', colors[0]);
  container.style.setProperty('--tb-grad-2', colors[1] || colors[0]);

  // Character layer
  const charEl = document.createElement('div');
  charEl.className = 'tb-spot-chars';
  container.appendChild(charEl);

  // Gradient overlay
  const gradEl = document.createElement('div');
  gradEl.className = 'tb-spot-grad';
  container.appendChild(gradEl);

  // Grid state
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(rndChar());
    }
    grid.push(row);
  }

  function escChar(ch) {
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '&') return '&amp;';
    return ch;
  }

  function buildHTML() {
    let html = '';
    for (let r = 0; r < rows; r++) {
      html += '<span class="tb-grid-line">';
      for (let c = 0; c < cols; c++) {
        html += escChar(grid[r][c]);
      }
      html += '</span>';
    }
    charEl.innerHTML = html;
  }

  // Mouse tracking with lerp
  let mouseX = 0.5, mouseY = 0.5;
  let curX = 0.5, curY = 0.5;

  function onMouseMove(e) {
    const rect = container.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) / rect.width;
    mouseY = (e.clientY - rect.top) / rect.height;
  }

  let lastFlip = 0;
  const flipInterval = 60 / speed;

  function animate(now) {
    if (!running) return;

    // Lerp cursor position
    curX += (mouseX - curX) * 0.15;
    curY += (mouseY - curY) * 0.15;
    const px = (curX * 100).toFixed(1) + '%';
    const py = (curY * 100).toFixed(1) + '%';
    container.style.setProperty('--tb-x', px);
    container.style.setProperty('--tb-y', py);

    // Flip characters periodically
    if (now - lastFlip > flipInterval) {
      lastFlip = now;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.04) {
            grid[r][c] = rndChar();
          }
        }
      }
      buildHTML();
    }

    raf = requestAnimationFrame(animate);
  }

  function start() {
    if (running) return;
    running = true;
    buildHTML();
    lastFlip = performance.now();
    container.addEventListener('mousemove', onMouseMove);
    raf = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    container.removeEventListener('mousemove', onMouseMove);
  }

  return { start, stop, destroy() { stop(); container.innerHTML = ''; } };
}

// ==================== Adaptive Font Size ====================
function setupResize(el, cfg, engine) {
  let charRatio = 0;

  function measureCharRatio() {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:100px';
    probe.style.fontFamily = getComputedStyle(el).fontFamily || 'monospace';
    probe.textContent = 'XXXXXXXXXXXXXXXXXXXX'; // 20 chars for accuracy
    el.appendChild(probe);
    charRatio = probe.offsetWidth / 2000; // char width per 1px of font-size
    el.removeChild(probe);
    if (!charRatio || charRatio < 0.3) charRatio = 0.6; // fallback
  }

  function recalc() {
    const w = el.clientWidth;
    if (!w) return;
    if (!charRatio) measureCharRatio();
    const gridEl = el.querySelector('.tb-grid,.tb-spot,.tb-shuffle');
    const pad = gridEl ? parseFloat(getComputedStyle(gridEl).paddingLeft || 0) + parseFloat(getComputedStyle(gridEl).paddingRight || 0) : 0;
    const availW = w - pad;
    const fontSize = Math.floor(availW / (cfg.cols * charRatio));
    el.style.fontSize = Math.max(6, Math.min(fontSize, 24)) + 'px';
  }
  recalc();

  let ro;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(recalc);
    ro.observe(el);
  }

  return () => { if (ro) ro.disconnect(); };
}

// ==================== Visibility Observer ====================
function setupVisibility(el, engine) {
  if (typeof IntersectionObserver === 'undefined') {
    engine.start();
    return () => {};
  }

  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) engine.start();
      else engine.stop();
    }
  }, { threshold: 0.1 });

  io.observe(el);
  return () => io.disconnect();
}

// ==================== Public Init ====================
function init(target, opts = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  injectCSS();

  const text = opts.data || '';
  const cfg = parseConfig(text);

  // Apply custom bg/fg
  if (cfg.bg) el.style.setProperty('--tb-bg', cfg.bg);
  if (cfg.fg) el.style.setProperty('--tb-text', cfg.fg);

  el.classList.add('tb');

  // Create inner container
  const inner = document.createElement('div');
  el.appendChild(inner);

  let engine;
  switch (cfg.mode) {
    case 'matrix':
      engine = MatrixEngine(inner, cfg);
      break;
    case 'noise':
      engine = NoiseEngine(inner, cfg);
      break;
    case 'spotlight':
      engine = SpotlightEngine(inner, cfg);
      break;
    default: // shuffle
      engine = ShuffleEngine(inner, cfg);
      break;
  }

  const needsResize = cfg.mode !== 'shuffle';
  const cleanupResize = needsResize ? setupResize(el, cfg, engine) : () => {};

  const cleanupVis = setupVisibility(el, engine);

  return {
    destroy() {
      engine.destroy();
      cleanupResize();
      cleanupVis();
      el.classList.remove('tb');
      el.innerHTML = '';
    }
  };
}

window.TypeBlock = init;

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  for (const s of document.querySelectorAll('script[type="text/type-block"]')) {
    const t = s.dataset.target;
    if (t) {
      init(t, { data: s.textContent });
    } else {
      // Create container before the script tag
      const div = document.createElement('div');
      s.parentNode.insertBefore(div, s);
      init(div, { data: s.textContent });
    }
  }
});

})();
