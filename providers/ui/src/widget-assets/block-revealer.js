/**
 * block-revealer.js
 * Block Reveal Effects — colored block slides across to reveal content
 * Ported from Codrops BlockRevealers (MIT License)
 * Self-contained: uses Web Animations API, no external dependencies
 */
;(function(window) {
  'use strict';

  // ── Easing presets (cubic-bezier) ──
  var EASINGS = {
    'easeInOutQuint': 'cubic-bezier(0.86, 0, 0.07, 1)',
    'easeInOutCirc':  'cubic-bezier(0.785, 0.135, 0.15, 0.86)',
    'easeOutExpo':    'cubic-bezier(0.19, 1, 0.22, 1)',
    'easeInOutQuad':  'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
    'easeOutQuad':    'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    'easeInQuad':     'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
    'easeOutCubic':   'cubic-bezier(0.215, 0.61, 0.355, 1)',
    'easeInOutCubic': 'cubic-bezier(0.645, 0.045, 0.355, 1)',
    'linear':         'linear'
  };

  function resolveEasing(name) {
    if (!name) return EASINGS['easeInOutQuint'];
    if (name.indexOf('cubic-bezier') === 0 || name === 'linear') return name;
    return EASINGS[name] || EASINGS['easeInOutQuint'];
  }

  // ── RevealFx class ──

  function RevealFx(el, options) {
    this.el = el;
    this.options = {};
    this.options.isContentHidden = options && options.isContentHidden !== undefined
      ? options.isContentHidden : true;
    this.options.revealSettings = {};
    if (options && options.revealSettings) {
      for (var k in options.revealSettings) {
        this.options.revealSettings[k] = options.revealSettings[k];
      }
    }
    this.isAnimating = false;
    this._layout();
  }

  RevealFx.DEFAULTS = {
    direction: 'lr',
    bgcolor: '#f0f0f0',
    duration: 500,
    easing: 'easeInOutQuint',
    coverArea: 0,
    delay: 0,
    onCover: function() {},
    onStart: function() {},
    onComplete: function() {}
  };

  RevealFx.prototype._layout = function() {
    var pos = getComputedStyle(this.el).position;
    if (pos !== 'fixed' && pos !== 'absolute' && pos !== 'relative') {
      this.el.style.position = 'relative';
    }
    // Wrap existing children into a content div
    this.content = document.createElement('div');
    this.content.className = 'block-revealer__content';
    while (this.el.firstChild) {
      this.content.appendChild(this.el.firstChild);
    }
    if (this.options.isContentHidden) {
      this.content.style.opacity = '0';
    }
    // Create the revealer overlay
    this.revealer = document.createElement('div');
    this.revealer.className = 'block-revealer__element';
    this.el.classList.add('block-revealer');
    this.el.appendChild(this.content);
    this.el.appendChild(this.revealer);
  };

  RevealFx.prototype._getTransformSettings = function(direction) {
    switch (direction) {
      case 'rl': return { from: 'scaleX(0)', to: 'scaleX(1)', origin: '100% 50%', origin2: '0 50%', prop: 'scaleX' };
      case 'tb': return { from: 'scaleY(0)', to: 'scaleY(1)', origin: '50% 0',    origin2: '50% 100%', prop: 'scaleY' };
      case 'bt': return { from: 'scaleY(0)', to: 'scaleY(1)', origin: '50% 100%', origin2: '50% 0',   prop: 'scaleY' };
      default:   return { from: 'scaleX(0)', to: 'scaleX(1)', origin: '0 50%',    origin2: '100% 50%', prop: 'scaleX' };
    }
  };

  /**
   * Trigger the reveal animation.
   * @param {Object} [revealSettings] - Override settings for this reveal
   */
  RevealFx.prototype.reveal = function(revealSettings) {
    if (this.isAnimating) return false;
    this.isAnimating = true;

    // Merge: DEFAULTS < constructor settings < call-time settings
    var s = {};
    var d = RevealFx.DEFAULTS;
    var o = this.options.revealSettings || {};
    var r = revealSettings || {};
    for (var k in d) s[k] = d[k];
    for (var k in o) if (o[k] !== undefined) s[k] = o[k];
    for (var k in r) if (r[k] !== undefined) s[k] = r[k];

    var ts = this._getTransformSettings(s.direction);
    var self = this;
    var easing = resolveEasing(s.easing);
    var coverEnd = (s.coverArea || 0) / 100;

    // Setup revealer
    this.revealer.style.transform = ts.from;
    this.revealer.style.transformOrigin = ts.origin;
    this.revealer.style.backgroundColor = s.bgcolor;
    this.revealer.style.opacity = '1';

    if (typeof s.onStart === 'function') {
      s.onStart(self.content, self.revealer);
    }

    // Cancel any running animation on this revealer
    if (this._currentAnim) {
      try { this._currentAnim.cancel(); } catch(e) {}
    }

    // Phase 1: cover (scale 0 → 1)
    var anim1 = this.revealer.animate(
      [{ transform: ts.from }, { transform: ts.to }],
      { duration: s.duration, easing: easing, delay: s.delay || 0, fill: 'forwards' }
    );
    this._currentAnim = anim1;

    anim1.onfinish = function() {
      // Flip transform origin for the uncover phase
      self.revealer.style.transformOrigin = ts.origin2;

      if (typeof s.onCover === 'function') {
        s.onCover(self.content, self.revealer);
      }

      // Phase 2: uncover (scale 1 → coverArea%)
      var endTransform = ts.prop === 'scaleX'
        ? 'scaleX(' + coverEnd + ')'
        : 'scaleY(' + coverEnd + ')';

      var anim2 = self.revealer.animate(
        [{ transform: ts.to }, { transform: endTransform }],
        { duration: s.duration, easing: easing, fill: 'forwards' }
      );
      self._currentAnim = anim2;

      anim2.onfinish = function() {
        self.isAnimating = false;
        self._currentAnim = null;
        if (typeof s.onComplete === 'function') {
          s.onComplete(self.content, self.revealer);
        }
      };
    };

    return true;
  };

  // ── Inject CSS ──
  var css = '.block-revealer__element{position:absolute;top:0;left:0;width:100%;height:100%;background:#000;pointer-events:none;opacity:0;z-index:100}';
  if (typeof document !== 'undefined') {
    var style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Auto-initialization via data attributes ──

  function autoInit() {
    var els = document.querySelectorAll('[data-block-reveal]');
    if (!els.length) return;

    var scrollItems = [];

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el._blockRevealInited) continue;
      el._blockRevealInited = true;

      var dir      = el.getAttribute('data-block-reveal') || 'lr';
      var color    = el.getAttribute('data-reveal-color') || '#000';
      var duration = parseInt(el.getAttribute('data-reveal-duration')) || 500;
      var easing   = el.getAttribute('data-reveal-easing') || 'easeInOutQuint';
      var delay    = parseInt(el.getAttribute('data-reveal-delay')) || 0;
      var trigger  = el.getAttribute('data-reveal-trigger') || 'scroll';
      var cover    = parseInt(el.getAttribute('data-reveal-cover')) || 0;
      var group    = el.getAttribute('data-reveal-group') || null;

      var rev = new RevealFx(el, {
        revealSettings: {
          direction: dir,
          bgcolor: color,
          duration: duration,
          easing: easing,
          delay: delay,
          coverArea: cover,
          onCover: function(contentEl) {
            contentEl.style.opacity = '1';
          }
        }
      });

      el._revealFx = rev;

      if (trigger === 'load') {
        rev.reveal();
      } else {
        scrollItems.push({ el: el, rev: rev, group: group });
      }
    }

    // IntersectionObserver for scroll-triggered reveals
    if (scrollItems.length) {
      var observer = new IntersectionObserver(function(entries) {
        for (var j = 0; j < entries.length; j++) {
          if (!entries[j].isIntersecting) continue;
          var target = entries[j].target;
          for (var k = 0; k < scrollItems.length; k++) {
            if (scrollItems[k].el !== target) continue;
            var item = scrollItems[k];
            if (item.group) {
              // Trigger all elements in the same group
              for (var m = 0; m < scrollItems.length; m++) {
                if (scrollItems[m].group === item.group) {
                  scrollItems[m].rev.reveal();
                  observer.unobserve(scrollItems[m].el);
                }
              }
            } else {
              item.rev.reveal();
              observer.unobserve(item.el);
            }
            break;
          }
        }
      }, { threshold: 0.15 });

      for (var n = 0; n < scrollItems.length; n++) {
        observer.observe(scrollItems[n].el);
      }
    }
  }

  // ── Export ──
  window.RevealFx = RevealFx;
  window.BlockRevealer = { init: autoInit, easings: EASINGS, resolveEasing: resolveEasing };

  // Auto-init on DOMContentLoaded
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoInit);
    } else {
      setTimeout(autoInit, 0);
    }
  }

})(window);
