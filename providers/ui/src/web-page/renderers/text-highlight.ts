export const TEXT_HIGHLIGHT_JS = `
  function renderAupTextHighlight(node) {
    var p = node.props || {};
    var mode = p.mode || "reveal";
    var content = p.content || "";

    // Convert ==marks== to <mark> tags
    var html = _escapeHtml(content).replace(/==([^=]+)==/g, function(_, text) {
      return '<mark data-highlight="' + mode + '">' + text + '</mark>';
    });

    var iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;border:none;min-height:80px;display:block;background:transparent;";
    iframe.setAttribute("scrolling", "no");

    var doc = '<!DOCTYPE html><html><head><style>'
      + 'body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;'
      + 'font-size:16px;line-height:1.6;color:#e0e0e0;background:transparent}'
      + '</style></head><body>'
      + '<div class="th" id="th-root">' + html + '</div>'
      + '<script src="/widgets/text-highlight.js"><\\/script>'
      + '<script>if(typeof TextHighlight==="function")TextHighlight("#th-root",{mode:"' + mode + '"});<\\/script>'
      + '</body></html>';
    iframe.srcdoc = doc;

    iframe.onload = function() {
      try {
        var h = iframe.contentDocument.body.scrollHeight;
        if (h > 0) iframe.style.height = h + "px";
      } catch(e) {}
    };

    return iframe;
  }
`;
