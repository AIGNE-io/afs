export const WEBGL_HERO_JS = `
  function renderAupWebglHero(node) {
    var p = node.props || {};
    var mode = p.mode || "wave";
    var speed = p.speed != null ? Number(p.speed) : 0.6;
    var bg = p.bg || "#0d0d14";
    var colors = p.colors || "";
    var opacity = p.opacity != null ? Number(p.opacity) : 1.0;
    var height = p.height ? parseInt(p.height) : 400;
    var mouse = p.mouse !== false;

    var iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:" + height + "px;border:none;display:block;border-radius:8px;overflow:hidden;";

    var dsl = "@mode " + mode + "\\n@speed " + speed + "\\n@bg " + bg;
    if (colors) dsl += "\\n@colors " + colors;
    if (opacity < 1) dsl += "\\n@opacity " + opacity;
    if (!mouse) dsl += "\\n@mouse false";

    // Render children as overlay HTML
    var childHtml = "";
    if (node.children && node.children.length) {
      var tmp = document.createElement("div");
      node.children.forEach(function(child) {
        var childEl = renderAupNode(child);
        if (childEl) {
          childEl.style.pointerEvents = "auto";
          tmp.appendChild(childEl);
        }
      });
      childHtml = '<div style="position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;pointer-events:none;">'
        + tmp.innerHTML + '</div>';
    }

    var html = '<!DOCTYPE html><html><head><style>'
      + 'body{margin:0;overflow:hidden;background:' + bg + '}'
      + '#target{width:100%;height:100%}'
      + '</style></head><body>'
      + '<div id="target" style="width:100%;height:' + height + 'px;position:relative">'
      + childHtml
      + '</div>'
      + '<script type="text/webgl-hero" data-target="#target">'
      + dsl + '<\\/script>'
      + '<script src="/widgets/webgl-hero.js"><\\/script>'
      + '</body></html>';
    iframe.srcdoc = html;

    return iframe;
  }
`;
