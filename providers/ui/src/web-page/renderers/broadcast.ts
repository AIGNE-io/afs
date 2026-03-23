export const BROADCAST_JS = `
  // ── Broadcast Primitive ──
  // Expands semantic roles into standard AUP nodes, then delegates to renderAupView.

  var _BROADCAST_ROLE_MAP = {
    "live-badge":       { type: "text", props: { mode: "badge" } },
    "clock":            { type: "text", props: {} },
    "viewer-count":     { type: "text", props: {} },
    "alert":            { type: "text", props: {} },
    "headline":         { type: "text", props: {} },
    "hashtag":          { type: "text", props: {} },
    "speaker-bar":      { type: "view", props: { layout: "column" } },
    "lower-third":      { type: "view", props: { layout: "column" } },
    "data-widget":      { type: "view", props: { layout: "column" } },
    "featured-comment": { type: "view", props: { layout: "column" } },
    "score-bug":        { type: "view", props: { layout: "column" } },
    "logo":             { type: "media", props: {} },
    "ticker":           { type: "ticker", props: {} }
  };

  var _BROADCAST_PLACEMENTS = {
    _default: {
      "live-badge": "top-start",
      "clock": "top-end",
      "viewer-count": "top-center",
      "speaker-bar": "lower-start",
      "lower-third": "lower-center",
      "alert": "lower-start",
      "headline": "lower-center",
      "ticker": "ticker",
      "logo": "lower-end",
      "score-bug": "mid-end",
      "data-widget": "mid-end",
      "hashtag": "bottom-end",
      "featured-comment": "mid-center"
    },
    apple: {
      "live-badge": "top-end",
      "clock": "top-start"
    }
  };

  function _resolveBroadcastPlacements(theme) {
    var themeName = typeof theme === "string" ? theme : "_default";
    var base = _BROADCAST_PLACEMENTS._default;
    var overrides = _BROADCAST_PLACEMENTS[themeName];
    if (!overrides || themeName === "_default") return base;
    var merged = {};
    for (var k in base) { if (base.hasOwnProperty(k)) merged[k] = base[k]; }
    for (var k2 in overrides) { if (overrides.hasOwnProperty(k2)) merged[k2] = overrides[k2]; }
    return merged;
  }

  function _expandBroadcastChild(child, region) {
    var role = child.role;
    var mapping = _BROADCAST_ROLE_MAP[role];
    if (!mapping) return null;

    var nodeType = mapping.type;
    var nodeProps = {};
    for (var pk in mapping.props) { if (mapping.props.hasOwnProperty(pk)) nodeProps[pk] = mapping.props[pk]; }
    nodeProps.region = region;
    nodeProps.role = role;

    // Logo: if src is present, use media; otherwise view
    if (role === "logo") {
      if (child.src) {
        nodeType = "media";
        nodeProps.src = child.src;
        if (child.alt) nodeProps.alt = child.alt;
        if (child.size) nodeProps.size = child.size;
      } else {
        nodeType = "view";
      }
    }

    // Ticker: wrap items in a ticker node inside a view
    if (role === "ticker") {
      var tickerItems = child.items || [];
      var tickerChildren = [];
      for (var ti = 0; ti < tickerItems.length; ti++) {
        tickerChildren.push({ type: "text", props: { content: tickerItems[ti] } });
      }
      var tickerProps = {};
      if (child.intent) tickerProps.intent = child.intent;
      if (child.mode) tickerProps.mode = child.mode;
      if (child.speed) tickerProps.speed = child.speed;
      return {
        type: "view",
        props: { region: region },
        children: [{
          type: "ticker",
          props: tickerProps,
          children: tickerChildren
        }]
      };
    }

    // Simple text roles: text prop → content
    if (nodeType === "text") {
      if (child.text) nodeProps.content = child.text;
      return { type: "text", props: nodeProps };
    }

    // Compound view roles (speaker-bar, lower-third, data-widget, featured-comment, score-bug)
    if (nodeType === "view") {
      var viewChildren = [];
      // lines[] → text children
      if (child.lines && child.lines.length) {
        for (var li = 0; li < child.lines.length; li++) {
          viewChildren.push({ type: "text", props: { content: child.lines[li] } });
        }
      }
      // Passthrough children[] — already-expanded AUP nodes
      if (child.children && child.children.length) {
        viewChildren = viewChildren.concat(child.children);
      }
      return { type: "view", props: nodeProps, children: viewChildren };
    }

    // Media (logo with src)
    if (nodeType === "media") {
      return { type: "media", props: nodeProps };
    }

    return null;
  }

  function renderAupBroadcast(node) {
    var p = node.props || {};
    var theme = p.theme || "minimal";
    var placements = _resolveBroadcastPlacements(theme);

    var viewNode = {
      type: "view",
      props: { layout: "overlay-grid", theme: theme },
      children: []
    };

    // Forward background
    if (p.background) viewNode.props.background = p.background;

    var children = node.children || [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var role = child.role;
      if (!role) continue;
      var region = child.at || (placements[role] || "mid-center");
      var expanded = _expandBroadcastChild(child, region);
      if (expanded) viewNode.children.push(expanded);
    }

    return renderAupView(viewNode);
  }
`;
