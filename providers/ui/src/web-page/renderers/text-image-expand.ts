export const TEXT_IMAGE_EXPAND_JS = `
  function renderAupTextImageExpand(node) {
    var p = node.props || {};

    var el = document.createElement("div");
    el.className = "aup-text-image-expand";
    el.setAttribute("data-text-image-expand", "");

    // Render children (expects img + text nodes)
    if (node.children) {
      node.children.forEach(function(child) {
        var childEl = renderAupNode(child);
        if (childEl) el.appendChild(childEl);
      });
    }

    // Trigger widget re-scan after DOM insertion
    requestAnimationFrame(function() {
      document.dispatchEvent(new CustomEvent("aup:widget-init", { detail: { type: "text-image-expand" } }));
    });

    return el;
  }
`;
