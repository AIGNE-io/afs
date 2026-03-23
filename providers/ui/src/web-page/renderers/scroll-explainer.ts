export const SCROLL_EXPLAINER_JS = `
  function renderAupScrollExplainer(node) {
    var p = node.props || {};
    var height = p.height ? parseInt(p.height) : 400;

    var el = document.createElement("div");
    el.className = "scroll-explainer aup-scroll-explainer";
    el.style.minHeight = height + "px";
    var seId = "se-" + (node.id || Math.random().toString(36).slice(2, 8));
    el.id = seId;

    var textCol = document.createElement("div");
    textCol.className = "explainer-text";

    var mediaCol = document.createElement("div");
    mediaCol.className = "explainer-media";

    // Render children as steps
    if (node.children) {
      node.children.forEach(function(child, i) {
        var step = document.createElement("div");
        step.className = "step";
        step.setAttribute("data-step", String(i + 1));
        var childEl = renderAupNode(child);
        if (childEl) step.appendChild(childEl);
        textCol.appendChild(step);
      });
    }

    el.appendChild(textCol);
    el.appendChild(mediaCol);

    // Trigger ScrollExplainer function-call init after DOM insertion
    requestAnimationFrame(function() {
      if (typeof ScrollExplainer === "function") {
        ScrollExplainer("#" + seId);
      }
    });

    return el;
  }
`;
