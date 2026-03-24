;(() => {
'use strict';

// ==================== CSS ====================
const CSS = `
/* Theme-aware custom properties */
.hw{
  --hw-text:var(--theme-text,#171717);
  --hw-text-2:var(--theme-text-secondary,#737373);
  --hw-bg:var(--theme-bg,#fff);
  --hw-bg-2:var(--theme-bg-secondary,#fafafa);
  --hw-border:var(--theme-border,#e8e8e8);
  --hw-surface:rgba(255,255,255,.92);
  --hw-muted:rgba(0,0,0,.04);
  --hw-muted-h:rgba(0,0,0,.08);
  --hw-shadow:rgba(0,0,0,.08);
  --hw-shadow-lg:rgba(0,0,0,.12);
  --hw-cube-top:var(--hw-bg);
  --hw-cube-face:#E5E7EB;
  --hw-cube-base:#D1D5DB;
  --hw-font:var(--font-sans,'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);
  position:relative;box-sizing:border-box;overflow:hidden;
  color:var(--hw-text);font-family:var(--hw-font)
}
[data-theme="dark"] .hw{
  --hw-surface:rgba(255,255,255,.10);
  --hw-muted:rgba(255,255,255,.08);
  --hw-muted-h:rgba(255,255,255,.14);
  --hw-shadow:rgba(0,0,0,.3);
  --hw-shadow-lg:rgba(0,0,0,.5);
  --hw-cube-top:#404040;
  --hw-cube-face:#505050;
  --hw-cube-base:#333
}
[data-theme="dark"] .hw .hw-gname{color:var(--hw-text)}
[data-theme="dark"] .hw .hw-title{color:#fff}
.hw *,.hw *::before,.hw *::after{box-sizing:border-box;margin:0;padding:0}

/* Background */
.hw-bg{display:none;position:absolute;left:0;top:0;width:100%;height:100%;
  background-repeat:no-repeat;background-size:cover;background-position:center;
  transition:transform .1s linear;will-change:transform}

/* Layout */
.hw-inner{max-width:1280px;margin:0 auto;padding:80px 24px;position:relative;z-index:10;
  display:flex;flex-direction:column;align-items:center;gap:40px}

/* Callout: title + desc */
.hw-left{flex:1;flex-shrink:0;min-height:128px}
.hw-title{font-size:32px;font-weight:900;line-height:1.2;text-align:center;text-wrap:balance;
  color:var(--hw-text)}
.hw-desc{font-size:18px;text-align:center;text-wrap:balance;white-space:pre-wrap;margin-top:12px;
  color:var(--hw-text-2)}
.hw-left.hw-fade{animation:hw-fi .5s ease}
@keyframes hw-fi{0%{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

/* Callout positions */
.hw[data-callout="none"] .hw-left{display:none}
.hw[data-callout="overlay"] .hw-left{position:absolute;left:24px;bottom:24px;max-width:420px;
  background:var(--hw-surface);backdrop-filter:blur(16px);padding:28px;border-radius:16px;
  z-index:20;box-shadow:0 4px 24px var(--hw-shadow)}
@media(max-width:899px){
  .hw[data-callout="overlay"] .hw-left{position:static;background:none;backdrop-filter:none;
    padding:0;border-radius:0;max-width:none;box-shadow:none}
}

/* Right: rows of groups */
.hw-right{flex:2;width:100%;display:flex;flex-direction:column;gap:16px}
.hw-row{display:flex;flex-wrap:wrap;gap:16px;width:100%}

/* Group card */
.hw-group{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;
  position:relative;border:1px solid var(--hw-border);background:var(--hw-muted);
  backdrop-filter:blur(3px);border-radius:8px;padding:32px 8px 12px;gap:8px 16px;
  transition:background .2s;cursor:pointer}
.hw-group:hover{background:var(--hw-muted-h)}

/* Group header */
.hw-ghdr{position:absolute;left:12px;top:8px;display:inline-flex;align-items:center;gap:4px;
  text-decoration:none;font-size:14px}
.hw-ghdr img{width:16px;height:16px}
.hw-gname{font-family:var(--hw-font);
  color:var(--hw-text-2);font-weight:normal;font-size:14px}
.hw-arrow{opacity:0;margin-left:-8px;transition:all .3s ease-in-out;
  color:var(--hw-text-2);font-size:14px}
.hw-group:hover:not(:has(.hw-item:hover)) .hw-arrow,
.hw-ghdr:hover .hw-arrow{opacity:1;margin-left:0}

/* Item base */
.hw-item{display:flex;flex-direction:column;align-items:center;text-align:center;
  text-decoration:none;color:var(--hw-text);position:relative}
.hw-item:hover{z-index:10}
.hw-iname{font-size:14px;font-family:var(--hw-font)}

/* 3D Cube (default style) */
.hw-cwrap{height:52px;margin-top:8px}
.hw-cpersp{transform:rotateX(45deg);height:0}
.hw-cube{margin:0 16px 8px;position:relative;display:flex;align-items:center;justify-content:center;
  width:68px;height:60px;background:var(--hw-cube-top);
  transform:perspective(100px) rotate(-30deg) skew(25deg) translate(0,0) scale(.65);
  transition:all .3s;box-shadow:-20px 20px 20px var(--hw-shadow)}
.hw-cube::before{content:"";position:absolute;top:6px;left:-12px;height:100%;width:12px;
  background:var(--hw-cube-face);transition:all .5s;transform:skewY(-45deg)}
.hw-cube::after{content:"";position:absolute;bottom:-12px;left:-6px;height:12px;width:100%;
  background:var(--hw-cube-base);transition:all .5s;transform:skewX(-45deg)}
.hw-item:hover .hw-cube{
  transform:perspective(1000px) rotate(-30deg) skew(25deg) translate(12px,-12px) scale(.75);
  box-shadow:-50px 50px 50px var(--hw-shadow-lg);background:var(--c1,#FFEE58)}
.hw-item:hover .hw-cube::before{background:var(--c2,#FFCA28)}
.hw-item:hover .hw-cube::after{background:var(--c3,#FFA000)}
.hw-cicon{width:64%;height:64%;background-size:contain;background-position:center;
  background-repeat:no-repeat;background-image:var(--icon)}
.hw-item:hover .hw-cicon{background-image:var(--hi,var(--icon))}

/* Card style */
.hw-item--card{flex-direction:row;align-items:center;background:var(--hw-surface);
  backdrop-filter:blur(8px);border-radius:12px;padding:12px 16px;gap:12px;text-align:left;
  box-shadow:0 1px 4px var(--hw-shadow);transition:transform .2s,box-shadow .2s;width:100%}
.hw-item--card:hover{transform:translateY(-2px);box-shadow:0 6px 20px var(--hw-shadow-lg)}
.hw-card-icon{width:40px;height:40px;border-radius:8px;flex-shrink:0;
  background-size:contain;background-repeat:no-repeat;background-position:center}
.hw-card-body{min-width:0;flex:1}
.hw-card-title{font-weight:600;font-size:14px;font-family:var(--hw-font);
  color:var(--hw-text)}
.hw-card-desc{font-size:12px;color:var(--hw-text-2);margin-top:2px;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.hw[data-style="card"] .hw-group{flex-direction:column;align-items:stretch;gap:8px}

/* Pill style */
.hw-item--pill{flex-direction:row;align-items:center;background:var(--hw-muted);
  border-radius:999px;padding:4px 14px 4px 4px;gap:8px;transition:background .2s}
.hw-item--pill:hover{background:var(--hw-muted-h)}
.hw-pill-icon{width:28px;height:28px;border-radius:50%;object-fit:contain}
.hw-pill-name{font-size:13px;font-family:var(--hw-font);white-space:nowrap}

/* Icon style */
.hw-item--icon{padding:8px;border-radius:12px;transition:background .2s,transform .2s}
.hw-item--icon:hover{background:var(--hw-muted);transform:scale(1.1)}
.hw-icon-img{width:48px;height:48px;object-fit:contain}

/* Logo style */
.hw-item--logo{flex-direction:column;padding:16px;border:1px solid var(--hw-border);
  border-radius:12px;background:var(--hw-bg);transition:box-shadow .2s,transform .2s}
.hw-item--logo:hover{box-shadow:0 4px 16px var(--hw-shadow);transform:translateY(-2px)}
.hw-logo-img{width:56px;height:56px;object-fit:contain;margin-bottom:4px}

/* Desktop */
@media(min-width:900px){
  .hw-bg{display:block}
  .hw-inner{flex-direction:row;padding:96px 24px}
  .hw-left{min-height:auto}
  .hw-title{font-size:48px;text-align:left}
  .hw-desc{text-align:left}
  .hw-row{flex-wrap:nowrap}
  /* Callout overrides */
  .hw[data-callout="right"] .hw-inner{flex-direction:row-reverse}
  .hw[data-callout="top"] .hw-inner{flex-direction:column}
  .hw[data-callout="top"] .hw-title,.hw[data-callout="top"] .hw-desc{text-align:center}
  .hw[data-callout="bottom"] .hw-inner{flex-direction:column-reverse}
  .hw[data-callout="bottom"] .hw-title,.hw[data-callout="bottom"] .hw-desc{text-align:center}
  .hw[data-callout="overlay"] .hw-inner{flex-direction:column}
  .hw[data-callout="overlay"] .hw-left{left:48px;bottom:48px}
}

/* ===== Grid mode ===== */
.hw-grid{max-width:1280px;margin:0 auto;padding:24px}
.hw-gc{display:grid;gap:8px;height:100%;align-items:stretch;width:100%}
.hw-gbox{position:relative;border:2px solid var(--gc,#818cf8);border-radius:12px;
  padding:20px 8px 8px;display:flex;flex-direction:column;min-width:0;height:100%}
.hw-glabel{position:absolute;top:-11px;left:8px;background:var(--hw-bg);padding:0 6px;
  font-size:14px;font-weight:bold;color:var(--gc,#818cf8);white-space:nowrap;
  text-overflow:ellipsis;overflow:hidden;max-width:calc(100% - 16px);
  font-family:var(--hw-font)}
.hw-gleaf{display:flex;align-items:center;justify-content:center;
  text-decoration:none;color:inherit;padding:8px 4px;border-radius:6px;transition:background .2s}
.hw-gleaf:hover{background:var(--hw-muted)}
.hw-gleaf img{height:40px;width:auto;object-fit:contain;border-radius:4px;transition:all .3s}
.hw-gleaf:hover img{transform:translateY(-2px)}
@media(max-width:599px){
  .hw-grid{padding:12px}
  .hw-gleaf img{height:28px}
  .hw-gbox{padding:16px 4px 4px;border-radius:8px}
  .hw-glabel{font-size:12px;top:-9px}
}

/* ===== Showcase layout ===== */
.hw-showcase{max-width:1280px;margin:0 auto;padding:40px 24px}
.hw-sc-header{text-align:center;margin-bottom:40px}
.hw-sc-title{font-size:36px;font-weight:800;font-family:var(--hw-font);
  color:var(--hw-text)}
.hw-sc-desc{font-size:18px;color:var(--hw-text-2);margin-top:8px;text-wrap:balance}
.hw-sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px}
.hw-scard{background:var(--hw-bg);border-radius:16px;border:1px solid var(--hw-border);padding:24px;
  transition:box-shadow .3s,transform .3s}
.hw-scard:hover{box-shadow:0 12px 32px var(--hw-shadow-lg);transform:translateY(-4px)}
.hw-scard-head{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.hw-scard-icon{width:36px;height:36px}
.hw-scard-name{font-size:18px;font-weight:700;font-family:var(--hw-font);
  color:var(--hw-text)}
.hw-scard-desc{font-size:14px;color:var(--hw-text-2);margin-bottom:16px;line-height:1.5}
.hw-scard-items{display:flex;flex-wrap:wrap;gap:8px}
.hw-scard-item{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;
  background:var(--hw-muted);border-radius:8px;font-size:13px;text-decoration:none;
  color:inherit;transition:background .2s}
.hw-scard-item:hover{background:var(--hw-muted-h)}
.hw-scard-item img{width:20px;height:20px;object-fit:contain}

/* ===== Stack layout ===== */
.hw-stack{max-width:900px;margin:0 auto;padding:40px 24px}
.hw-stk-header{text-align:center;margin-bottom:32px}
.hw-stk-title{font-size:32px;font-weight:800;font-family:var(--hw-font);
  color:var(--hw-text)}
.hw-stk-desc{font-size:16px;color:var(--hw-text-2);margin-top:8px}
.hw-stk-layers{display:flex;flex-direction:column;gap:6px;align-items:center}
.hw-stk-layer{display:flex;align-items:center;border-radius:12px;padding:16px 24px;gap:20px;
  transition:transform .2s,box-shadow .2s;color:#fff}
.hw-stk-layer:hover{transform:scale(1.02);box-shadow:0 4px 16px var(--hw-shadow-lg)}
.hw-stk-label{font-weight:700;font-size:15px;min-width:120px;
  font-family:var(--hw-font)}
.hw-stk-items{display:flex;flex-wrap:wrap;gap:8px}
.hw-stk-item{display:inline-flex;align-items:center;gap:6px;
  background:rgba(255,255,255,.2);padding:5px 14px;border-radius:999px;font-size:13px;
  color:#fff;text-decoration:none;transition:background .2s}
.hw-stk-item:hover{background:rgba(255,255,255,.35)}
.hw-stk-item img{width:18px;height:18px;filter:brightness(10)}
@media(max-width:599px){
  .hw-stk-layer{flex-direction:column;align-items:flex-start;gap:8px;width:100%!important}
}

/* ===== Timeline layout ===== */
.hw-timeline{max-width:800px;margin:0 auto;padding:40px 24px}
.hw-tl-header{text-align:center;margin-bottom:48px}
.hw-tl-title{font-size:32px;font-weight:800;font-family:var(--hw-font);
  color:var(--hw-text)}
.hw-tl-desc{font-size:16px;color:var(--hw-text-2);margin-top:8px}
.hw-tl-track{position:relative;padding:0 20px}
.hw-tl-line{position:absolute;left:50%;top:0;bottom:0;width:2px;background:var(--hw-border);
  transform:translateX(-50%)}
.hw-tl-entry{position:relative;display:flex;margin-bottom:40px;align-items:flex-start}
.hw-tl-entry:nth-child(even) .hw-tl-card{margin-left:calc(50% + 28px);margin-right:0}
.hw-tl-entry:nth-child(odd) .hw-tl-card{margin-right:calc(50% + 28px);margin-left:0;text-align:right}
.hw-tl-entry:nth-child(odd) .hw-tl-items{align-items:flex-end}
.hw-tl-dot{position:absolute;left:50%;width:40px;height:40px;background:var(--hw-bg);
  border:3px solid var(--hw-accent,#6366f1);border-radius:50%;transform:translateX(-50%);
  display:flex;align-items:center;justify-content:center;z-index:2}
.hw-tl-dot img{width:20px;height:20px}
.hw-tl-card{flex:1;background:var(--hw-bg);border-radius:12px;border:1px solid var(--hw-border);
  padding:20px;box-shadow:0 2px 8px var(--hw-shadow)}
.hw-tl-name{font-size:17px;font-weight:700;font-family:var(--hw-font);
  color:var(--hw-text)}
.hw-tl-cdesc{font-size:13px;color:var(--hw-text-2);margin:4px 0 12px;line-height:1.5}
.hw-tl-items{display:flex;flex-direction:column;gap:6px}
.hw-tl-item{display:inline-flex;align-items:center;gap:8px;font-size:13px;
  text-decoration:none;color:var(--hw-text);padding:2px 0;transition:color .2s}
.hw-tl-item:hover{color:var(--hw-accent,#6366f1)}
.hw-tl-item img{width:22px;height:22px;object-fit:contain}
@media(max-width:699px){
  .hw-tl-line{left:20px}
  .hw-tl-dot{left:20px;width:32px;height:32px}
  .hw-tl-dot img{width:16px;height:16px}
  .hw-tl-entry:nth-child(even) .hw-tl-card,
  .hw-tl-entry:nth-child(odd) .hw-tl-card{margin:0 0 0 56px;text-align:left}
  .hw-tl-entry:nth-child(odd) .hw-tl-items{align-items:flex-start}
}

/* ===== Orbit layout ===== */
.hw-orbit{max-width:700px;margin:0 auto;padding:40px 24px}
.hw-orbit-ring{position:relative;width:100%;aspect-ratio:1}
.hw-orbit-ring::before{content:"";position:absolute;left:50%;top:50%;
  width:72%;height:72%;border:2px dashed var(--hw-border);border-radius:50%;
  transform:translate(-50%,-50%)}
.hw-orbit-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  width:140px;height:140px;border-radius:50%;
  background:linear-gradient(135deg,var(--hw-accent,#6366f1),#8b5cf6);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;color:#fff;z-index:10;box-shadow:0 8px 32px rgba(99,102,241,.3)}
.hw-orbit-ct{font-size:14px;font-weight:800;padding:0 12px;line-height:1.3;
  font-family:var(--hw-font)}
.hw-orbit-node{position:absolute;transform:translate(-50%,-50%);background:var(--hw-bg);
  border:2px solid var(--hw-border);border-radius:14px;padding:10px;text-align:center;
  width:110px;transition:all .3s;box-shadow:0 2px 8px var(--hw-shadow);z-index:5;
  text-decoration:none;color:var(--hw-text)}
.hw-orbit-node:hover{border-color:var(--hw-accent,#6366f1);
  box-shadow:0 8px 24px rgba(99,102,241,.15);z-index:20;
  transform:translate(-50%,-50%) scale(1.08)}
.hw-orbit-ni{width:32px;height:32px;margin:0 auto 4px;display:block}
.hw-orbit-nn{font-size:11px;font-weight:600;line-height:1.2;
  font-family:var(--hw-font)}
.hw-orbit-items{display:flex;flex-wrap:wrap;justify-content:center;gap:2px;margin-top:6px}
.hw-orbit-leaf{width:18px;height:18px;border-radius:4px;transition:transform .2s}
.hw-orbit-leaf:hover{transform:scale(1.3)}
@media(max-width:599px){
  .hw-orbit-ring{aspect-ratio:auto;display:flex;flex-direction:column;align-items:center;gap:12px}
  .hw-orbit-ring::before{display:none}
  .hw-orbit-center{position:static;transform:none;width:120px;height:120px;margin-bottom:8px}
  .hw-orbit-node{position:static!important;transform:none!important;width:100%;max-width:300px;
    display:flex;align-items:center;gap:12px;text-align:left;padding:12px 16px}
  .hw-orbit-ni{margin:0;width:28px;height:28px}
  .hw-orbit-items{justify-content:flex-start}
}

/* ===== Tree layout ===== */
.hw-tree{max-width:700px;margin:0 auto;padding:40px 24px}
.hw-tree-header{margin-bottom:24px}
.hw-tree-title{font-size:28px;font-weight:800;font-family:var(--hw-font);
  color:var(--hw-text)}
.hw-tree-desc{font-size:15px;color:var(--hw-text-2);margin-top:4px}
.hw-tnode{margin-left:20px;border-left:2px solid var(--hw-border);padding-left:16px;margin-top:4px}
.hw-tnode-head{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;
  cursor:pointer;user-select:none;transition:background .15s}
.hw-tnode-head:hover{background:var(--hw-muted)}
.hw-tnode-arrow{font-size:10px;transition:transform .2s;color:var(--hw-text-2);
  width:16px;text-align:center;flex-shrink:0}
.hw-tnode.hw-collapsed .hw-tnode-arrow{transform:rotate(-90deg)}
.hw-tnode.hw-collapsed .hw-tnode-kids{display:none}
.hw-tnode-icon{width:20px;height:20px;flex-shrink:0}
.hw-tnode-name{font-weight:600;font-size:14px;color:var(--hw-text);
  font-family:var(--hw-font)}
.hw-tleaf{display:flex;align-items:center;gap:8px;padding:5px 8px 5px 44px;
  text-decoration:none;color:var(--hw-text);font-size:13px;border-radius:6px;transition:background .15s}
.hw-tleaf:hover{background:var(--hw-muted)}
.hw-tleaf img{width:22px;height:22px;object-fit:contain}
`;

function injectCSS() {
  if (document.getElementById('hw-css')) return;
  const s = document.createElement('style');
  s.id = 'hw-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ==================== Shared helpers ====================
function resIcon(v, cfg) {
  if (!v) return '';
  if (v.startsWith('http')) return v;
  return (cfg.base || '') + (cfg.icons || '/') + v;
}

function resUrl(v, cfg) {
  if (!v) return '';
  if (v.startsWith('http') || v.startsWith('/') || v.startsWith('#')) return v;
  return (cfg.base || '') + (cfg.urls || '/') + v;
}

function esc(s) {
  return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
}
function ea(s) {
  return s ? s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
}

// ==================== Hero Item Renderers ====================
function renderHeroItem(item, style) {
  const base = ` href="${ea(item.url || '#')}" data-t="${ea(item.title)}" data-d="${ea(item.desc)}"`;

  switch (style) {
    case 'card': {
      const bg = item.iconUrl ? `background-image:url(${item.iconUrl})` : '';
      return `<a class="hw-item hw-item--card"${base}>` +
        `<div class="hw-card-icon" style="${bg}"></div>` +
        `<div class="hw-card-body"><div class="hw-card-title">${esc(item.name)}</div>` +
        (item.desc ? `<div class="hw-card-desc">${esc(item.desc)}</div>` : '') +
        `</div></a>`;
    }
    case 'pill':
      return `<a class="hw-item hw-item--pill"${base}>` +
        (item.iconUrl ? `<img class="hw-pill-icon" src="${ea(item.iconUrl)}" alt="">` : '') +
        `<span class="hw-pill-name">${esc(item.name)}</span></a>`;
    case 'icon':
      return `<a class="hw-item hw-item--icon"${base} title="${ea(item.name)}">` +
        (item.iconUrl ? `<img class="hw-icon-img" src="${ea(item.iconUrl)}" alt="${ea(item.name)}">` : '') +
        `</a>`;
    case 'logo':
      return `<a class="hw-item hw-item--logo"${base}>` +
        (item.iconUrl ? `<img class="hw-logo-img" src="${ea(item.iconUrl)}" alt="${ea(item.name)}">` : '') +
        `<span class="hw-iname">${esc(item.name)}</span></a>`;
    default: { // cube
      const c = item.colors.length >= 3 ? item.colors : [];
      let sty = c.length ? `--c1:${c[0]};--c2:${c[1]};--c3:${c[2]}` : '';
      if (item.iconUrl) sty += `${sty ? ';' : ''}--icon:url(${item.iconUrl})`;
      if (item.hoverIconUrl) sty += `;--hi:url(${item.hoverIconUrl})`;
      return `<a class="hw-item"${base} style="${sty}">` +
        '<div class="hw-cwrap"><div class="hw-cpersp"><div class="hw-cube"><div class="hw-cicon"></div></div></div></div>' +
        `<span class="hw-iname">${esc(item.name)}</span></a>`;
    }
  }
}

// ==================== Hero Parser ====================
function parseHero(text) {
  const lines = text.split('\n');
  const cfg = {};
  const rows = [];
  let row = null, group = null, item = null;
  let phase = '';

  for (const raw of lines) {
    const t = raw.trim();

    if (!t) {
      if (phase === 'group-meta') phase = 'items';
      continue;
    }

    // @config
    if (t[0] === '@') {
      const sp = t.indexOf(' ');
      if (sp > 0) cfg[t.slice(1, sp)] = t.slice(sp + 1).trim();
      continue;
    }

    // === row ===
    if (/^={3,}\s*row\s*={3,}$/i.test(t)) {
      row = []; rows.push(row);
      group = null; item = null; phase = '';
      continue;
    }

    // ## Group
    if (t.startsWith('## ')) {
      const parts = t.slice(3).split('|').map(s => s.trim());
      group = {
        name: parts[0], slug: parts[1] || '', icon: parts[2] || '',
        colors: parts[3] ? parts[3].trim().split(/\s+/) : [],
        title: '', desc: '', items: []
      };
      if (!row) { row = []; rows.push(row); }
      row.push(group);
      item = null; phase = 'group-meta';
      continue;
    }

    // - Item
    if (t[0] === '-' && t[1] === ' ') {
      const parts = t.slice(2).split('|').map(s => s.trim());
      const iconParts = (parts[2] || '').split('~');
      item = {
        name: parts[0], slug: parts[1] || '',
        icon: iconParts[0] || '', hoverIcon: iconParts[1] || '',
        colors: parts[3] ? parts[3].trim().split(/\s+/) : [],
        title: '', desc: ''
      };
      if (group) group.items.push(item);
      phase = 'items';
      continue;
    }

    // > Item meta
    if (t[0] === '>' && t[1] === ' ' && item) {
      if (!item.title) item.title = t.slice(2);
      else item.desc += (item.desc ? '\n' : '') + t.slice(2);
      continue;
    }

    // Group meta
    if (phase === 'group-meta' && group) {
      if (!group.title) group.title = t;
      else group.desc += (group.desc ? '\n' : '') + t;
    }
  }

  // Resolve references
  for (const r of rows) for (const g of r) {
    g.iconUrl = resIcon(g.icon, cfg);
    g.url = resUrl(g.slug, cfg);
    if (!g.title) g.title = g.name;
    for (const it of g.items) {
      it.iconUrl = resIcon(it.icon || g.icon, cfg);
      it.hoverIconUrl = it.hoverIcon ? resIcon(it.hoverIcon, cfg) : '';
      it.url = resUrl(it.slug, cfg);
      if (!it.title) it.title = it.name;
      if (!it.colors.length && g.colors.length) it.colors = g.colors;
    }
  }

  return { cfg, rows };
}

// ==================== Grid Parser ====================
function parseGrid(text) {
  const lines = text.split('\n');
  const cfg = {};
  const root = { type: 'group', name: '', children: [] };
  const stack = [{ node: root, depth: 0 }];

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;

    if (t[0] === '@') {
      const sp = t.indexOf(' ');
      if (sp > 0) cfg[t.slice(1, sp)] = t.slice(sp + 1).trim();
      continue;
    }

    if (/^={3,}\s*row\s*={3,}$/i.test(t)) continue;

    const hm = t.match(/^(#{2,4})\s+(.+)/);
    if (hm) {
      const depth = hm[1].length - 1;
      const parts = hm[2].split('|').map(s => s.trim());
      const group = {
        type: 'group', name: parts[0], slug: parts[1] || '',
        icon: parts[2] || '', depth, children: []
      };
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
      stack[stack.length - 1].node.children.push(group);
      stack.push({ node: group, depth });
      continue;
    }

    if (t[0] === '-' && t[1] === ' ') {
      const parts = t.slice(2).split('|').map(s => s.trim());
      const iconParts = (parts[2] || '').split('~');
      const item = {
        type: 'item', name: parts[0], slug: parts[1] || '',
        icon: iconParts[0] || '', hoverIcon: iconParts[1] || ''
      };
      stack[stack.length - 1].node.children.push(item);
      continue;
    }
  }

  function resolveNode(n) {
    if (n.icon) n.iconUrl = resIcon(n.icon, cfg);
    if (n.hoverIcon) n.hoverIconUrl = resIcon(n.hoverIcon, cfg);
    if (n.slug) n.url = resUrl(n.slug, cfg);
    if (n.children) n.children.forEach(resolveNode);
  }
  resolveNode(root);

  return { cfg, root };
}

// ==================== Hero Renderer ====================
function renderHero(el, data) {
  const { cfg, rows } = data;
  const style = cfg.style || 'cube';
  const callout = cfg.callout || 'left';
  const bgUrl = cfg.bg
    ? (cfg.bg.startsWith('http') ? cfg.bg : (cfg.base || '') + cfg.bg)
    : '';

  let h = '';

  if (bgUrl) {
    h += `<div class="hw-bg" style="background-image:url(${esc(bgUrl)})"></div>`;
  }

  h += '<div class="hw-inner">';
  if (callout !== 'none') {
    h += '<div class="hw-left">';
    h += `<h1 class="hw-title">${esc(cfg.title || '')}</h1>`;
    h += `<p class="hw-desc">${esc(cfg.desc || '')}</p>`;
    h += '</div>';
  }
  h += '<div class="hw-right">';

  for (const row of rows) {
    h += '<div class="hw-row">';
    for (const g of row) {
      const flex = Math.max(1, g.items.length);
      h += `<div class="hw-group" style="flex:${flex}" data-t="${ea(g.title)}" data-d="${ea(g.desc)}"${g.url ? ` data-url="${ea(g.url)}"` : ''}>`;

      h += `<a class="hw-ghdr"${g.url ? ` href="${ea(g.url)}"` : ''}>`;
      if (g.iconUrl) h += `<img src="${ea(g.iconUrl)}" alt="">`;
      h += `<span class="hw-gname">${esc(g.name)}</span>`;
      if (g.url) h += '<span class="hw-arrow">\u2192</span>';
      h += '</a>';

      for (const it of g.items) {
        h += renderHeroItem(it, style);
      }

      h += '</div>';
    }
    h += '</div>';
  }

  h += '</div></div>';
  el.innerHTML = h;
  el.classList.add('hw');
  if (callout !== 'left') el.setAttribute('data-callout', callout);
  if (style !== 'cube') el.setAttribute('data-style', style);
}

// ==================== Hero Interactivity ====================
function activateHero(el, data) {
  const { cfg } = data;
  const titleEl = el.querySelector('.hw-title');
  const descEl = el.querySelector('.hw-desc');
  const leftEl = el.querySelector('.hw-left');
  const bgEl = el.querySelector('.hw-bg');
  const rightEl = el.querySelector('.hw-right');
  const defTitle = cfg.title || '';
  const defDesc = cfg.desc || '';
  let curTitle = defTitle;
  let tid = null;

  function setTitle(t, d) {
    if (!leftEl || t === curTitle) return;
    clearTimeout(tid);
    tid = setTimeout(() => {
      curTitle = t;
      titleEl.textContent = t;
      descEl.textContent = d;
      leftEl.classList.remove('hw-fade');
      void leftEl.offsetWidth;
      leftEl.classList.add('hw-fade');
    }, 80);
  }

  if (rightEl) {
    rightEl.addEventListener('mouseover', e => {
      const itemEl = e.target.closest('.hw-item');
      const groupEl = e.target.closest('.hw-group');
      if (itemEl) setTitle(itemEl.dataset.t || '', itemEl.dataset.d || '');
      else if (groupEl) setTitle(groupEl.dataset.t || '', groupEl.dataset.d || '');
    });
    rightEl.addEventListener('mouseleave', () => setTitle(defTitle, defDesc));
  }

  if (bgEl) {
    let raf = false;
    const onScroll = () => {
      if (raf) return;
      raf = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        bgEl.style.transform = `scale(${1.1 - Math.max(0.1, y / 3000)}) translateZ(0)`;
        raf = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  for (const g of el.querySelectorAll('.hw-group')) {
    g.addEventListener('click', e => {
      if (e.target.closest('.hw-item') || e.target.closest('.hw-ghdr')) return;
      const url = g.dataset.url;
      if (url) location.href = url;
    });
  }
}

// ==================== Grid Layout ====================
function countLeaves(node) {
  if (node.type === 'item') return 1;
  if (!node.children || !node.children.length) return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

function distributeColumns(children, availCols) {
  const weights = children.map(c => countLeaves(c));
  let curAvail = availCols;
  let curMaxRows = 1;
  const shares = [];

  for (let i = 0; i < children.length; i++) {
    const w = weights[i];
    let share = 2;
    if (w <= curMaxRows) {
      curAvail -= share;
      curMaxRows = Math.max(curMaxRows, Math.ceil(w / share));
    } else if (w >= curAvail && curAvail > 0 && w % curAvail === 0) {
      share = curAvail; curAvail = availCols; curMaxRows = 1;
    } else if (w < curAvail) {
      share = w; curAvail -= share;
      curMaxRows = Math.max(curMaxRows, Math.ceil(w / share));
    } else {
      share = Math.max(2, Math.floor(Math.sqrt(w)));
      curAvail -= share;
      curMaxRows = Math.max(curMaxRows, Math.ceil(w / share));
    }
    if (curAvail <= 0) { curAvail = availCols; curMaxRows = 1; }
    shares.push(share);
  }

  const rows = [];
  let curRow = [], colsUsed = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i], share = shares[i];
    let innerCols;
    if (child.type === 'item') { innerCols = share; }
    else {
      const hasInnerGroups = child.children && child.children.some(c => c.type === 'group');
      innerCols = hasInnerGroups ? 1 : share;
    }
    if (i === children.length - 1 && curRow.length > 0) {
      innerCols = availCols - colsUsed;
      if (child.type !== 'item') {
        const hasInnerGroups = child.children && child.children.some(c => c.type === 'group');
        if (hasInnerGroups) innerCols = 1;
      }
    }
    curRow.push({ node: child, innerCols, share });
    colsUsed += share;
    if (colsUsed >= availCols) {
      rows.push({ cols: curRow.length, items: curRow });
      curRow = []; colsUsed = 0;
    }
  }
  if (curRow.length > 0) rows.push({ cols: curRow.length, items: curRow });
  return rows;
}

function renderGrid(el, data) {
  const { cfg, root } = data;
  const colors = [cfg.color1 || '#3773F2', cfg.color2 || '#1DC1C7', cfg.color3 || '#CCCCCC'];
  const totalLeaves = countLeaves(root);
  const totalCols = Math.min(8, Math.max(3, Math.floor(Math.sqrt(totalLeaves))));

  let h = '<div class="hw-grid">';
  h += gridLevel(root.children, 0, colors, totalCols);
  h += '</div>';
  el.innerHTML = h;
  el.classList.add('hw');
}

function gridLevel(children, depth, colors, availCols) {
  if (!children || !children.length) return '';
  if (children.every(c => c.type === 'item')) {
    let h = `<div class="hw-gc" style="grid-template-columns:repeat(${availCols},1fr)">`;
    for (const c of children) h += gridLeaf(c);
    return h + '</div>';
  }
  const rows = distributeColumns(children, availCols);
  let h = '';
  for (const row of rows) {
    h += `<div class="hw-gc" style="grid-template-columns:repeat(${row.cols},1fr)">`;
    for (const { node, innerCols } of row.items) {
      if (node.type === 'item') { h += `<div>${gridLeaf(node)}</div>`; }
      else {
        const showBorder = !!node.name;
        const nextDepth = showBorder ? depth + 1 : depth;
        const color = colors[Math.min(depth, colors.length - 1)];
        h += `<div style="${showBorder ? 'padding-top:10px' : ''}">`;
        if (showBorder) {
          h += `<div class="hw-gbox" style="--gc:${color}">`;
          h += `<span class="hw-glabel">${esc(node.name)}</span>`;
        }
        h += gridLevel(node.children, nextDepth, colors, innerCols);
        if (showBorder) h += '</div>';
        h += '</div>';
      }
    }
    h += '</div>';
  }
  return h;
}

function gridLeaf(item) {
  return `<a class="hw-gleaf" href="${ea(item.url || '#')}" title="${ea(item.name)}">` +
    `<img src="${ea(item.iconUrl || '')}" alt="${ea(item.name)}">` +
    '</a>';
}

// ==================== Showcase Renderer ====================
function renderShowcase(el, data) {
  const { cfg, rows } = data;
  let h = '<div class="hw-showcase">';
  if (cfg.title) {
    h += '<div class="hw-sc-header">';
    h += `<h2 class="hw-sc-title">${esc(cfg.title)}</h2>`;
    if (cfg.desc) h += `<p class="hw-sc-desc">${esc(cfg.desc)}</p>`;
    h += '</div>';
  }
  h += '<div class="hw-sc-grid">';
  for (const row of rows) {
    for (const g of row) {
      h += '<div class="hw-scard">';
      h += '<div class="hw-scard-head">';
      if (g.iconUrl) h += `<img class="hw-scard-icon" src="${ea(g.iconUrl)}" alt="">`;
      h += `<div class="hw-scard-name">${esc(g.name)}</div>`;
      h += '</div>';
      if (g.desc) h += `<div class="hw-scard-desc">${esc(g.desc)}</div>`;
      h += '<div class="hw-scard-items">';
      for (const it of g.items) {
        h += `<a class="hw-scard-item" href="${ea(it.url || '#')}">`;
        if (it.iconUrl) h += `<img src="${ea(it.iconUrl)}" alt="">`;
        h += `<span>${esc(it.name)}</span></a>`;
      }
      h += '</div></div>';
    }
  }
  h += '</div></div>';
  el.innerHTML = h;
  el.classList.add('hw');
}

// ==================== Stack Renderer ====================
function renderStack(el, data) {
  const { cfg, rows } = data;
  const allGroups = rows.flat();
  const palette = ['#6366f1','#8b5cf6','#a855f7','#3b82f6','#14b8a6','#10b981','#f59e0b','#ef4444'];

  let h = '<div class="hw-stack">';
  if (cfg.title) {
    h += '<div class="hw-stk-header">';
    h += `<h2 class="hw-stk-title">${esc(cfg.title)}</h2>`;
    if (cfg.desc) h += `<p class="hw-stk-desc">${esc(cfg.desc)}</p>`;
    h += '</div>';
  }
  h += '<div class="hw-stk-layers">';
  const n = allGroups.length;
  allGroups.forEach((g, i) => {
    const pct = 55 + (45 * i / Math.max(1, n - 1));
    const color = palette[i % palette.length];
    h += `<div class="hw-stk-layer" style="width:${pct}%;background:${color}">`;
    h += `<div class="hw-stk-label">${esc(g.name)}</div>`;
    h += '<div class="hw-stk-items">';
    for (const it of g.items) {
      h += `<a class="hw-stk-item" href="${ea(it.url || '#')}">`;
      if (it.iconUrl) h += `<img src="${ea(it.iconUrl)}" alt="">`;
      h += `<span>${esc(it.name)}</span></a>`;
    }
    h += '</div></div>';
  });
  h += '</div></div>';
  el.innerHTML = h;
  el.classList.add('hw');
}

// ==================== Timeline Renderer ====================
function renderTimeline(el, data) {
  const { cfg, rows } = data;
  const allGroups = rows.flat();

  let h = '<div class="hw-timeline">';
  if (cfg.title) {
    h += '<div class="hw-tl-header">';
    h += `<h2 class="hw-tl-title">${esc(cfg.title)}</h2>`;
    if (cfg.desc) h += `<p class="hw-tl-desc">${esc(cfg.desc)}</p>`;
    h += '</div>';
  }
  h += '<div class="hw-tl-track"><div class="hw-tl-line"></div>';
  for (const g of allGroups) {
    h += '<div class="hw-tl-entry">';
    h += '<div class="hw-tl-dot">';
    if (g.iconUrl) h += `<img src="${ea(g.iconUrl)}" alt="">`;
    h += '</div>';
    h += '<div class="hw-tl-card">';
    h += `<div class="hw-tl-name">${esc(g.name)}</div>`;
    if (g.desc) h += `<div class="hw-tl-cdesc">${esc(g.desc)}</div>`;
    if (g.items.length) {
      h += '<div class="hw-tl-items">';
      for (const it of g.items) {
        h += `<a class="hw-tl-item" href="${ea(it.url || '#')}">`;
        if (it.iconUrl) h += `<img src="${ea(it.iconUrl)}" alt="">`;
        h += `<span>${esc(it.name)}</span></a>`;
      }
      h += '</div>';
    }
    h += '</div></div>';
  }
  h += '</div></div>';
  el.innerHTML = h;
  el.classList.add('hw');
}

// ==================== Orbit Renderer ====================
function renderOrbit(el, data) {
  const { cfg, rows } = data;
  const allGroups = rows.flat();
  const n = allGroups.length;
  const radius = 36;

  let h = '<div class="hw-orbit"><div class="hw-orbit-ring">';
  // Center
  h += '<div class="hw-orbit-center">';
  h += `<div class="hw-orbit-ct">${esc(cfg.title || '')}</div>`;
  h += '</div>';

  // Nodes
  for (let i = 0; i < n; i++) {
    const angle = (360 / n) * i - 90;
    const rad = (angle * Math.PI) / 180;
    const x = 50 + radius * Math.cos(rad);
    const y = 50 + radius * Math.sin(rad);
    const g = allGroups[i];

    h += `<div class="hw-orbit-node" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%">`;
    if (g.iconUrl) h += `<img class="hw-orbit-ni" src="${ea(g.iconUrl)}" alt="">`;
    h += `<div class="hw-orbit-nn">${esc(g.name)}</div>`;
    if (g.items.length) {
      h += '<div class="hw-orbit-items">';
      for (const it of g.items) {
        h += `<a class="hw-orbit-leaf" href="${ea(it.url || '#')}" title="${ea(it.name)}">`;
        if (it.iconUrl) h += `<img src="${ea(it.iconUrl)}" alt="${ea(it.name)}" style="width:100%;height:100%;object-fit:contain">`;
        h += '</a>';
      }
      h += '</div>';
    }
    h += '</div>';
  }

  h += '</div></div>';
  el.innerHTML = h;
  el.classList.add('hw');
}

// ==================== Tree Renderer ====================
function renderTree(el, data) {
  const { cfg, root } = data;

  let h = '<div class="hw-tree">';
  if (cfg.title) {
    h += '<div class="hw-tree-header">';
    h += `<h2 class="hw-tree-title">${esc(cfg.title)}</h2>`;
    if (cfg.desc) h += `<p class="hw-tree-desc">${esc(cfg.desc)}</p>`;
    h += '</div>';
  }
  h += treeNode(root);
  h += '</div>';
  el.innerHTML = h;
  el.classList.add('hw');
}

function treeNode(node) {
  if (node.type === 'item') {
    return `<a class="hw-tleaf" href="${ea(node.url || '#')}">` +
      (node.iconUrl ? `<img src="${ea(node.iconUrl)}" alt="">` : '') +
      `<span>${esc(node.name)}</span></a>`;
  }
  if (!node.name && node.children) {
    return node.children.map(treeNode).join('');
  }
  let h = '<div class="hw-tnode">';
  h += '<div class="hw-tnode-head">';
  h += '<span class="hw-tnode-arrow">\u25B6</span>';
  if (node.iconUrl) h += `<img class="hw-tnode-icon" src="${ea(node.iconUrl)}" alt="">`;
  h += `<span class="hw-tnode-name">${esc(node.name)}</span>`;
  h += '</div>';
  if (node.children && node.children.length) {
    h += '<div class="hw-tnode-kids">';
    h += node.children.map(treeNode).join('');
    h += '</div>';
  }
  h += '</div>';
  return h;
}

function activateTree(el) {
  el.addEventListener('click', e => {
    const head = e.target.closest('.hw-tnode-head');
    if (!head) return;
    const node = head.closest('.hw-tnode');
    if (node) node.classList.toggle('hw-collapsed');
  });
}

// ==================== Unified Parser ====================
function parse(text) {
  const layoutMatch = text.match(/@layout\s+(\w+)/);
  const modeMatch = text.match(/@mode\s+(\w+)/);
  const layout = (layoutMatch ? layoutMatch[1] : (modeMatch ? modeMatch[1] : 'hero'));

  if (layout === 'grid' || layout === 'tree') {
    const data = parseGrid(text);
    data.mode = layout;
    return data;
  }

  const data = parseHero(text);
  data.mode = layout;
  return data;
}

// ==================== Public API ====================
function init(target, opts = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  injectCSS();

  function go(text) {
    const d = parse(text);
    switch (d.mode) {
      case 'grid':
        renderGrid(el, d);
        break;
      case 'showcase':
        renderShowcase(el, d);
        break;
      case 'stack':
        renderStack(el, d);
        break;
      case 'timeline':
        renderTimeline(el, d);
        break;
      case 'orbit':
        renderOrbit(el, d);
        break;
      case 'tree':
        renderTree(el, d);
        activateTree(el);
        break;
      default: // hero
        renderHero(el, d);
        activateHero(el, d);
        break;
    }
  }

  if (opts.src && opts.src !== 'inline') {
    fetch(opts.src).then(r => r.text()).then(go);
  } else {
    go(opts.data || '');
  }
}

window.HeroWidget = init;

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  for (const s of document.querySelectorAll('script[type="text/hero-widget"]')) {
    const t = s.dataset.target;
    if (t) init(t, { data: s.textContent });
  }
  for (const el of document.querySelectorAll('[data-hero-src]')) {
    init(el, { src: el.dataset.heroSrc });
  }
});

})();
