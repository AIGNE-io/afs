;(() => {
'use strict';

// ==================== CSS ====================
const CSS = `
/* ── Mark reset ── */
.th mark{
  background:none;
  color:inherit;
  position:relative;
}

/* ── Reveal mode (default): word-by-word fade + rise ── */
.th-word{
  display:inline-block;
  opacity:0.12;
  transform:translateY(5px);
  transition:opacity 0.4s cubic-bezier(0.4,0,0.2,1),
             transform 0.4s cubic-bezier(0.4,0,0.2,1),
             color 0.4s cubic-bezier(0.4,0,0.2,1);
  transition-delay:var(--d,0s);
}
.th-active .th-word{
  opacity:1;
  transform:translateY(0);
}
.th-active .th-mark{
  color:var(--th-accent,var(--theme-primary,#3b82f6));
  font-weight:var(--font-medium,500);
}

/* ── Glow mode: character bloom + glow ── */
.th-char{
  display:inline-block;
  opacity:0.12;
  transition:opacity 0.35s cubic-bezier(0.4,0,0.2,1),
             filter 0.5s cubic-bezier(0.4,0,0.2,1),
             color 0.35s cubic-bezier(0.4,0,0.2,1);
  transition-delay:var(--d,0s);
}
.th-active .th-char{opacity:1}
.th--glow.th-active .th-mark{
  color:var(--th-accent,var(--theme-primary,#3b82f6));
  font-weight:var(--font-medium,500);
  filter:drop-shadow(0 0 8px color-mix(in srgb,var(--th-accent,var(--theme-primary,#3b82f6)) 50%,transparent));
}

/* ── Rise mode: 3D character rotation ── */
.th--rise .th-char{
  transform:translateY(40%) rotateX(-40deg);
  opacity:0;
  transition:opacity 0.45s cubic-bezier(0.4,0,0.2,1),
             transform 0.55s cubic-bezier(0.23,1,0.32,1),
             color 0.35s cubic-bezier(0.4,0,0.2,1);
  transition-delay:var(--d,0s);
}
.th--rise.th-active .th-char{
  transform:translateY(0) rotateX(0);
  opacity:1;
}
.th--rise.th-active .th-mark{
  color:var(--th-accent,var(--theme-primary,#3b82f6));
  font-weight:var(--font-medium,500);
}

/* ── Sweep mode: gradient color sweep ── */
.th--sweep mark{
  background:linear-gradient(to right,
    var(--th-accent,var(--theme-primary,#3b82f6)) 50%,transparent 50%);
  background-size:200% 100%;
  background-position:100% 0;
  -webkit-background-clip:text;
  background-clip:text;
  -webkit-text-fill-color:transparent;
  transition:background-position 0.8s cubic-bezier(0.25,0.46,0.45,0.94);
}
.th--sweep.th-active mark{
  background-position:0 0;
}

/* ── Highlight mode: background slide (multi-line safe) + selection handles ── */
.th--highlight mark{
  background:linear-gradient(
    color-mix(in srgb,var(--th-accent,var(--theme-primary,#3b82f6)) 14%,transparent),
    color-mix(in srgb,var(--th-accent,var(--theme-primary,#3b82f6)) 14%,transparent));
  background-size:0% 100%;
  background-repeat:no-repeat;
  -webkit-box-decoration-break:clone;
  box-decoration-break:clone;
  padding:1px 5px;
  border-radius:4px;
  color:var(--th-dim,var(--theme-text-secondary,#6b7280));
  transition:background-size 0.7s cubic-bezier(0.25,0.46,0.45,0.94),
             color 0.4s cubic-bezier(0.4,0,0.2,1);
}
.th--highlight.th-active mark{
  background-size:100% 100%;
  color:var(--th-accent,var(--theme-primary,#3b82f6));
}
/* Selection-handle markers (matches Codrops Effect 13 proportions: 9×88 SVG) */
.th--highlight mark::before,
.th--highlight mark::after{
  content:'';
  display:inline-block;
  width:0.155em;
  height:1.25em;
  vertical-align:middle;
  background:var(--th-accent,var(--theme-primary,#3b82f6));
  -webkit-mask-repeat:no-repeat;
  mask-repeat:no-repeat;
  -webkit-mask-size:auto 100%;
  mask-size:auto 100%;
  opacity:0;
  transform:scaleY(0);
  transition:opacity 0.25s cubic-bezier(0.4,0,0.2,1),
             transform 0.3s cubic-bezier(0.23,1,0.32,1);
  transition-delay:0.45s;
}
.th--highlight mark::before{
  margin-left:-5px;margin-right:0;
  transform-origin:center top;
  -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 88'%3E%3Ccircle cx='4.5' cy='4.5' r='4.5'/%3E%3Crect x='4' y='8' width='1' height='80'/%3E%3C/svg%3E");
  mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 88'%3E%3Ccircle cx='4.5' cy='4.5' r='4.5'/%3E%3Crect x='4' y='8' width='1' height='80'/%3E%3C/svg%3E");
}
.th--highlight mark::after{
  margin-left:0;margin-right:-5px;
  transform-origin:center bottom;
  -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 88'%3E%3Crect x='4' y='0' width='1' height='80'/%3E%3Ccircle cx='4.5' cy='83.5' r='4.5'/%3E%3C/svg%3E");
  mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 88'%3E%3Crect x='4' y='0' width='1' height='80'/%3E%3Ccircle cx='4.5' cy='83.5' r='4.5'/%3E%3C/svg%3E");
}
.th--highlight.th-active mark::before,
.th--highlight.th-active mark::after{
  opacity:0.55;
  transform:scaleY(1);
}

/* ── Blink mode: character flicker ── */
.th--blink .th-char{
  opacity:0.12;
  transition:none;
}
.th--blink.th-active .th-char{
  animation:th-blink 0.15s steps(2,jump-none) calc(var(--d,0s) + 0s) 3;
  opacity:1;
}
.th--blink.th-active .th-mark{
  color:var(--th-accent,var(--theme-primary,#3b82f6));
  font-weight:var(--font-medium,500);
}
@keyframes th-blink{
  0%,100%{opacity:1}
  50%{opacity:0}
}

/* ── Bloom mode: scale down + scale up + glow (Effect 3) ── */
.th--bloom .th-char{
  opacity:0;
  transform:scale(0.8);
  transition:opacity 0.4s cubic-bezier(0.4,0,0.2,1),
             transform 0.4s cubic-bezier(0.23,1,0.32,1),
             filter 0.5s cubic-bezier(0.4,0,0.2,1),
             color 0.4s cubic-bezier(0.4,0,0.2,1);
  transition-delay:var(--d,0s);
}
.th--bloom.th-active .th-char{
  opacity:1;
  transform:scale(1);
}
.th--bloom.th-active .th-mark{
  color:var(--th-accent,var(--theme-primary,#3b82f6));
  font-weight:var(--font-medium,500);
  filter:drop-shadow(0 0 18px color-mix(in srgb,var(--th-accent,var(--theme-primary,#3b82f6)) 45%,transparent));
}

/* ── Pulse mode: scale up + down with dual color (Effect 4) ── */
.th--pulse .th-char{
  display:inline-block;
  opacity:0.12;
  transform:scale(1);
  transition:opacity 0.3s cubic-bezier(0.4,0,0.2,1),
             transform 0.5s cubic-bezier(0.23,1,0.32,1),
             color 0.35s cubic-bezier(0.4,0,0.2,1);
  transition-delay:var(--d,0s);
}
.th--pulse.th-active .th-char{
  opacity:1;
  animation:th-pulse 0.6s cubic-bezier(0.23,1,0.32,1) var(--d,0s) 1 both;
}
.th--pulse.th-active .th-mark{
  color:var(--th-accent,var(--theme-primary,#3b82f6));
  font-weight:var(--font-medium,500);
}
@keyframes th-pulse{
  0%{transform:scale(1);opacity:0.12}
  40%{transform:scale(1.35);opacity:1}
  100%{transform:scale(1);opacity:1}
}

/* ── Bounce mode: elastic word rotation (Effect 9) ── */
.th--bounce .th-word{
  display:inline-block;
  opacity:0;
  transform:rotate(-25deg);
  transform-origin:0% 50%;
  transition:opacity 0.4s cubic-bezier(0.4,0,0.2,1),
             transform 1s cubic-bezier(0.175,0.885,0.32,1.275),
             color 0.4s cubic-bezier(0.4,0,0.2,1);
  transition-delay:var(--d,0s);
}
.th--bounce.th-active .th-word{
  opacity:1;
  transform:rotate(0);
}
.th--bounce.th-active .th-mark{
  color:var(--th-accent,var(--theme-primary,#3b82f6));
  font-weight:var(--font-medium,500);
}

/* ── Flicker mode: random glow flicker (Effect 8) ── */
.th--flicker .th-char{
  opacity:0.12;
  transition:none;
}
.th--flicker.th-active .th-char{
  opacity:1;
  animation:th-flicker 0.2s ease-in var(--d,0s) 2 alternate;
}
.th--flicker.th-active .th-mark{
  color:var(--th-accent,var(--theme-primary,#3b82f6));
  font-weight:var(--font-medium,500);
  filter:drop-shadow(0 0 6px var(--th-accent,var(--theme-primary,#3b82f6)));
}
@keyframes th-flicker{
  0%{filter:brightness(1) drop-shadow(0 0 0px var(--th-accent,#3b82f6))}
  100%{filter:brightness(2.5) drop-shadow(0 0 30px var(--th-accent,#3b82f6))}
}
`;

// ==================== Inject CSS once ====================
let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
  cssInjected = true;
}

// ==================== Text splitting ====================
function splitWords(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(node => {
    const text = node.textContent;
    if (!text.trim()) return;
    const frag = document.createDocumentFragment();
    text.split(/(\s+)/).forEach(part => {
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else if (part) {
        const span = document.createElement('span');
        span.className = 'th-word';
        if (el.tagName === 'MARK') span.classList.add('th-mark');
        span.textContent = part;
        frag.appendChild(span);
      }
    });
    node.parentNode.replaceChild(frag, node);
  });
}

function splitChars(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(node => {
    const text = node.textContent;
    if (!text.trim()) return;
    const frag = document.createDocumentFragment();
    for (const ch of text) {
      if (ch === ' ' || ch === '\n' || ch === '\t') {
        frag.appendChild(document.createTextNode(ch));
      } else {
        const span = document.createElement('span');
        span.className = 'th-char';
        if (el.tagName === 'MARK') span.classList.add('th-mark');
        span.textContent = ch;
        frag.appendChild(span);
      }
    }
    node.parentNode.replaceChild(frag, node);
  });
}

function splitWordsInParagraph(p) {
  if (p.querySelector('.th-word')) return;
  const children = Array.from(p.childNodes);
  const frag = document.createDocumentFragment();

  children.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent.split(/(\s+)/).forEach(part => {
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
        } else if (part) {
          const span = document.createElement('span');
          span.className = 'th-word';
          span.textContent = part;
          frag.appendChild(span);
        }
      });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'MARK') splitWords(node);
      frag.appendChild(node);
    }
  });

  p.innerHTML = '';
  p.appendChild(frag);
}

// ==================== Stagger delays ====================
function applyStagger(container, sel, delay) {
  container.querySelectorAll(sel).forEach((el, i) => {
    el.style.setProperty('--d', `${(delay * i).toFixed(3)}s`);
  });
}

// Flicker mode: random delays instead of sequential
function applyRandomStagger(container, sel, maxDelay) {
  container.querySelectorAll(sel).forEach(el => {
    el.style.setProperty('--d', `${(Math.random() * maxDelay).toFixed(3)}s`);
  });
}

// ==================== Mode config ====================
const CHAR_MODES = ['glow', 'rise', 'blink', 'bloom', 'pulse', 'flicker'];
const WORD_MODES = ['reveal', 'bounce'];
const NO_SPLIT_MODES = ['sweep', 'highlight'];

// ==================== Main ====================
/**
 * TextHighlight(selector, options)
 *
 * Options:
 *   mode:    'reveal'|'sweep'|'highlight'|'glow'|'rise'|'blink'|'bloom'|'pulse'|'bounce'|'flicker'
 *   trigger: 'scroll' | 'none'  (default: 'scroll')
 *   stagger: number in seconds  (default: 0.04)
 *   once:    boolean — disconnect observer after first activation (default: false)
 *
 * Returns: { activate(), deactivate(), destroy() }
 */
function TextHighlight(selector, opts = {}) {
  const el = typeof selector === 'string'
    ? document.querySelector(selector) : selector;
  if (!el) return null;

  injectCSS();

  const mode = opts.mode || el.dataset.highlight || 'reveal';
  const stagger = opts.stagger != null ? opts.stagger
    : parseFloat(el.dataset.stagger || '0.04');
  const trigger = opts.trigger || 'scroll';
  const once = opts.once === true;

  // Determine split type from mode
  const split = opts.split || (
    CHAR_MODES.includes(mode) ? 'char' :
    WORD_MODES.includes(mode) ? 'word' : 'none'
  );

  // Add classes
  el.classList.add('th');
  if (mode !== 'reveal') el.classList.add(`th--${mode}`);

  // Split text
  if (!NO_SPLIT_MODES.includes(mode)) {
    // Split marks
    el.querySelectorAll('mark').forEach(mark => {
      if (split === 'char') splitChars(mark);
      else splitWords(mark);
    });
    // For word modes, also split all paragraph text
    if (WORD_MODES.includes(mode)) {
      el.querySelectorAll('p').forEach(p => splitWordsInParagraph(p));
    }
  }

  // Apply stagger delays
  const staggerSel = split === 'char' ? '.th-char' : '.th-word';
  if (mode === 'flicker') {
    applyRandomStagger(el, staggerSel, 0.8);
  } else {
    applyStagger(el, staggerSel, stagger);
  }

  // Activation
  let observer = null;

  function activate() { el.classList.add('th-active'); }
  function deactivate() { el.classList.remove('th-active'); }

  if (trigger === 'scroll') {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          activate();
          if (once) {
            observer.disconnect();
            observer = null;
          }
        } else if (!once) {
          deactivate();
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '-10% 0px -10% 0px'
    });
    observer.observe(el);
  }

  return {
    activate,
    deactivate,
    destroy() {
      if (observer) observer.disconnect();
      el.classList.remove('th', 'th-active', `th--${mode}`);
    }
  };
}

// ==================== Export ====================
window.TextHighlight = TextHighlight;

})();
