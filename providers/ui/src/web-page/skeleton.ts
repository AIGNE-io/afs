export const SKELETON = `
<body>
  <header style="display:none">
    <h1>AFS</h1>
    <span class="dot off" id="dot"></span>
    <span class="status" id="status">Connecting...</span>
  </header>

  <div id="desktop-splash" class="hidden">
    <div class="splash-orbit splash-orbit-1"></div>
    <div class="splash-orbit splash-orbit-2"></div>
    <div class="splash-orbit splash-orbit-3"></div>
    <div class="splash-content">
      <div class="splash-glyph">
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path class="glyph-outer" d="M40 4 L72 22 V58 L40 76 L8 58 V22 Z" stroke="currentColor" stroke-width="1" fill="none"/>
          <path class="glyph-inner" d="M40 16 L60 28 V52 L40 64 L20 52 V28 Z" stroke="currentColor" stroke-width="0.75" fill="none"/>
          <circle class="glyph-core" cx="40" cy="40" r="6" fill="currentColor"/>
          <line class="glyph-ray" x1="40" y1="34" x2="40" y2="16" stroke="currentColor" stroke-width="0.5"/>
          <line class="glyph-ray" x1="45.2" y1="37" x2="60" y2="28" stroke="currentColor" stroke-width="0.5"/>
          <line class="glyph-ray" x1="45.2" y1="43" x2="60" y2="52" stroke="currentColor" stroke-width="0.5"/>
          <line class="glyph-ray" x1="40" y1="46" x2="40" y2="64" stroke="currentColor" stroke-width="0.5"/>
          <line class="glyph-ray" x1="34.8" y1="43" x2="20" y2="52" stroke="currentColor" stroke-width="0.5"/>
          <line class="glyph-ray" x1="34.8" y1="37" x2="20" y2="28" stroke="currentColor" stroke-width="0.5"/>
        </svg>
      </div>
      <div class="splash-wordmark">AFS</div>
      <div class="splash-sub">Agentic File System</div>
      <div class="splash-status">
        <span class="dot off" id="splash-dot"></span>
        <span id="splash-status">waiting for connection</span>
      </div>
    </div>
  </div>

  <div id="aup-display">
    <div id="aup-root"></div>
  </div>

  <div id="session-badge"><span id="session-dot"></span><span id="session-id"></span></div>

`;
