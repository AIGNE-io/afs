export const UNKNOWN_JS = `
  function renderAupUnknown(node) {
    var el = document.createElement("div");
    el.className = "aup-unknown";
    el.textContent = "Unknown: " + _escapeHtml(String(node.type));
    // Still render children (graceful degradation)
    if (node.children) {
      node.children.forEach(function(child) {
        var childEl = renderAupNode(child);
        if (childEl) el.appendChild(childEl);
      });
    }
    return el;
  }
`;
