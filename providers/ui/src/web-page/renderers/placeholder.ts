/**
 * Shared placeholder logic — injected as global functions into the browser IIFE.
 * Called after binding to handle empty primary content props.
 *
 * _primaryProp(type)          → returns the primary content prop name for a node type
 * _saveOrigBindings(node)     → walks tree, saves original binding expressions before bind
 * _applyPlaceholders(node, d) → walks bound tree, applies placeholder/hidden logic
 */
export const PLACEHOLDER_JS = `
function _primaryProp(type) {
  if (type === "text") return "content";
  if (type === "media") return "src";
  return null;
}

function _saveOrigBindings(node) {
  if (!node) return;
  var pp = _primaryProp(node.type);
  if (pp && node.props) {
    var val = node.props[pp];
    if (typeof val === "string" && val.indexOf("$" + "{") >= 0) {
      var matches = val.match(/\\$\\{([^|}]+)/g);
      if (matches) {
        var bindings = matches.map(function(m) { return m.replace(/^\\$\\{/, ""); });
        node._origBinding = bindings.join(", ");
      }
    }
  }
  if (node.children) {
    for (var i = 0; i < node.children.length; i++) {
      _saveOrigBindings(node.children[i]);
    }
  }
}

function _applyPlaceholders(node, designMode) {
  if (!node) return;
  var pp = _primaryProp(node.type);
  if (pp && node.props) {
    var val = node.props[pp];
    var isEmpty = (val == null || val === "");
    if (isEmpty) {
      var ph = node.placeholder;
      if (ph === false) {
        node._aupHidden = true;
      } else if (typeof ph === "string") {
        node.props[pp] = ph;
        node._aupPlaceholder = true;
      } else if (designMode) {
        var expr = node._origBinding || pp;
        node.props[pp] = "\\u26a0 missing: " + expr;
        node._aupPlaceholder = true;
      } else {
        node._aupHidden = true;
      }
    }
  }
  if (node.children) {
    for (var i = 0; i < node.children.length; i++) {
      _applyPlaceholders(node.children[i], designMode);
    }
  }
}
`;
