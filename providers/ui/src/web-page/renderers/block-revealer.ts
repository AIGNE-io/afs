export const BLOCK_REVEALER_JS = `
  function renderAupBlockRevealer(node) {
    var p = node.props || {};
    var direction = p.direction || "lr";
    var color = p.color || "#000000";
    var duration = p.duration != null ? parseInt(p.duration) : 500;
    var easing = p.easing || "easeInOutQuint";
    var delay = p.delay != null ? parseInt(p.delay) : 0;
    var trigger = p.trigger || "load";

    // Render children as HTML via temp container
    var childHtml = "";
    if (node.children) {
      var tmp = document.createElement("div");
      node.children.forEach(function(child) {
        var childEl = renderAupNode(child);
        if (childEl) tmp.appendChild(childEl);
      });
      childHtml = tmp.innerHTML;
    }

    var iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;border:none;min-height:120px;display:block;background:transparent;";
    iframe.setAttribute("scrolling", "no");

    var html = '<!DOCTYPE html><html><head><style>'
      + 'body{margin:0;overflow:hidden;background:transparent}'
      + '</style></head><body>'
      + '<div data-block-reveal'
      + ' data-direction="' + direction + '"'
      + ' data-color="' + color + '"'
      + ' data-duration="' + duration + '"'
      + ' data-easing="' + easing + '"'
      + ' data-delay="' + delay + '"'
      + ' data-trigger="' + trigger + '"'
      + '>' + childHtml + '</div>'
      + '<script src="/widgets/block-revealer.js"><\\/script>'
      + '</body></html>';
    iframe.srcdoc = html;

    // Auto-resize iframe to content height
    iframe.onload = function() {
      try {
        var h = iframe.contentDocument.body.scrollHeight;
        if (h > 0) iframe.style.height = h + "px";
      } catch(e) {}
    };

    return iframe;
  }
`;
