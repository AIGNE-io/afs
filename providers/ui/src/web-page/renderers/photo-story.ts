export const PHOTO_STORY_JS = `
  function renderAupPhotoStory(node) {
    var p = node.props || {};
    var mode = p.mode || "scroll";
    var theme = p.theme || "dark";
    var interval = p.interval ? parseInt(p.interval) : 6000;

    var el = document.createElement("div");
    el.className = "aup-photo-story";
    el.setAttribute("data-photo-story", mode);
    el.setAttribute("data-theme", theme);
    if (interval !== 6000) el.setAttribute("data-interval", String(interval));

    // Render children as story slides
    if (node.children) {
      node.children.forEach(function(child) {
        var slide = document.createElement("div");
        slide.className = mode === "slideshow" ? "story-slide" : "ps-block";
        var childEl = renderAupNode(child);
        if (childEl) slide.appendChild(childEl);
        el.appendChild(slide);
      });
    }

    // Trigger widget re-scan after DOM insertion
    requestAnimationFrame(function() {
      document.dispatchEvent(new CustomEvent("aup:widget-init", { detail: { type: "photo-story" } }));
    });

    return el;
  }
`;
