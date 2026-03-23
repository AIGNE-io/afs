export const TYPE_BLOCK_JS = `
  function renderAupTypeBlock(node) {
    var p = node.props || {};
    var content = p.content || "";
    var mode = p.mode || "shuffle";
    var effect = p.effect || "cascade";
    var height = p.height ? parseInt(p.height) : 300;

    var iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:" + height + "px;border:none;display:block;border-radius:8px;";

    var dsl = "@mode " + mode + "\\n@effect " + effect + "\\n" + content;

    var html = '<!DOCTYPE html><html><head><style>'
      + 'body{margin:0;overflow:hidden}'
      + '</style></head><body>'
      + '<script type="text/type-block">' + dsl + '<\\/script>'
      + '<script src="/widgets/type-block.js"><\\/script>'
      + '</body></html>';
    iframe.srcdoc = html;

    return iframe;
  }
`;
