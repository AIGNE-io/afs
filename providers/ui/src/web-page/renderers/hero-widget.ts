export const HERO_WIDGET_JS = `
  function renderAupHeroWidget(node) {
    var p = node.props || {};
    var title = p.title || "";
    var desc = p.desc || "";
    var style = p.style || "cube";
    var callout = p.callout || "left";
    var dslContent = p.dsl || "";
    var height = p.height ? parseInt(p.height) : 400;

    var iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:" + height + "px;border:none;display:block;border-radius:8px;overflow:hidden;";

    var dsl = "@title " + title + "\\n@desc " + desc + "\\n@style " + style + "\\n@callout " + callout;
    if (dslContent) dsl += "\\n" + dslContent;

    var html = '<!DOCTYPE html><html><head><style>'
      + 'body{margin:0;overflow:hidden}'
      + '</style></head><body>'
      + '<div id="target" style="width:100%;min-height:' + height + 'px"></div>'
      + '<script type="text/hero-widget" data-target="#target">'
      + dsl + '<\\/script>'
      + '<script src="/widgets/hero-widget.js"><\\/script>'
      + '</body></html>';
    iframe.srcdoc = html;

    return iframe;
  }
`;
