import { describe, expect, test } from "bun:test";
import { FORMAT_CELL_JS } from "../src/web-page/renderers/format-cell.js";

// Extract binding functions from surface.ts JS string by reconstructing them
// (same eval pattern as format-cell.test.ts)
const bindEnv = new Function(`
  ${FORMAT_CELL_JS}

  function _surfaceBindField(obj, dotPath) {
    var parts = dotPath.split(".");
    var val = obj;
    for (var i = 0; i < parts.length; i++) {
      if (val == null) return null;
      if (typeof val === "string" && i < parts.length) {
        try { val = JSON.parse(val); } catch(_) { return null; }
      }
      val = val[parts[i]];
    }
    return val;
  }

  function _surfaceBindDeep(node, data) {
    var bound = JSON.parse(JSON.stringify(node));
    _surfaceReplace(bound, data);
    return bound;
  }

  function _surfaceReplace(obj, data) {
    for (var k in obj) {
      var v = obj[k];
      if (typeof v === "string" && v.indexOf("$" + "{") >= 0) {
        obj[k] = v.replace(/\\$\\{([^}]+)\\}/g, function(_, expr) {
          var pipeIdx = expr.indexOf("|");
          var fp = pipeIdx >= 0 ? expr.slice(0, pipeIdx) : expr;
          var fmt = pipeIdx >= 0 ? expr.slice(pipeIdx + 1) : null;
          var raw = _surfaceBindField(data, fp);
          if (raw == null) return "";
          return fmt ? _formatCell(raw, fmt) : String(raw);
        });
      } else if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) {
          if (typeof v[i] === "string" && v[i].indexOf("$" + "{") >= 0) {
            v[i] = v[i].replace(/\\$\\{([^}]+)\\}/g, function(_, expr) {
              var pipeIdx = expr.indexOf("|");
              var fp = pipeIdx >= 0 ? expr.slice(0, pipeIdx) : expr;
              var fmt = pipeIdx >= 0 ? expr.slice(pipeIdx + 1) : null;
              var raw = _surfaceBindField(data, fp);
              if (raw == null) return "";
              return fmt ? _formatCell(raw, fmt) : String(raw);
            });
          } else if (v[i] && typeof v[i] === "object") {
            _surfaceReplace(v[i], data);
          }
        }
      } else if (v && typeof v === "object") {
        _surfaceReplace(v, data);
      }
    }
  }

  return { bindDeep: _surfaceBindDeep, bindField: _surfaceBindField };
`)() as {
  bindDeep: (
    node: Record<string, unknown>,
    data: Record<string, unknown>,
  ) => Record<string, unknown>;
  bindField: (obj: Record<string, unknown>, dotPath: string) => unknown;
};

describe("_surfaceBindField", () => {
  test("resolves simple dot-path", () => {
    expect(bindEnv.bindField({ content: { name: "TBA" } }, "content.name")).toBe("TBA");
  });

  test("resolves nested dot-path", () => {
    expect(bindEnv.bindField({ content: { a: { b: "deep" } } }, "content.a.b")).toBe("deep");
  });

  test("returns null/undefined for missing path", () => {
    expect(bindEnv.bindField({ content: {} }, "content.missing")).toBeUndefined();
  });

  test("auto-parses JSON string in path", () => {
    expect(bindEnv.bindField({ content: '{"key":"val"}' }, "content.key")).toBe("val");
  });

  test("returns raw value (preserves type)", () => {
    expect(bindEnv.bindField({ content: { count: 42 } }, "content.count")).toBe(42);
    expect(bindEnv.bindField({ content: { flag: true } }, "content.flag")).toBe(true);
  });
});

describe("_surfaceBindDeep", () => {
  test("binds ${field} to data", () => {
    const recipe = { type: "text", props: { content: "Hello ${content.name}" } };
    const data = { content: { name: "World" } };
    const result = bindEnv.bindDeep(recipe, data) as { props: { content: string } };
    expect(result.props.content).toBe("Hello World");
  });

  test("binds ${field|format} with pipe", () => {
    const recipe = { type: "text", props: { content: "${content.count|number}" } };
    const data = { content: { count: 1234567 } };
    const result = bindEnv.bindDeep(recipe, data) as { props: { content: string } };
    expect(result.props.content).toContain("1,234,567");
  });

  test("binds ${field|truncate:8}", () => {
    const recipe = { type: "text", props: { content: "${content.address|truncate:8}" } };
    const data = { content: { address: "z1N4azRREHzRR" } };
    const result = bindEnv.bindDeep(recipe, data) as { props: { content: string } };
    expect(result.props.content).toBe("z1N4azRR...");
  });

  test("missing field renders empty string", () => {
    const recipe = { type: "text", props: { content: "Val: ${content.missing}" } };
    const result = bindEnv.bindDeep(recipe, { content: {} });
    expect((result as { props: { content: string } }).props.content).toBe("Val: ");
  });

  test("binds nested children", () => {
    const recipe = {
      type: "view",
      children: [
        { type: "text", props: { content: "${content.symbol}" } },
        { type: "text", props: { content: "${content.balance|bignum}" } },
      ],
    };
    const data = { content: { symbol: "TBA", balance: 1500000000 } };
    const result = bindEnv.bindDeep(recipe, data) as {
      children: Array<{ props: { content: string } }>;
    };
    expect(result.children[0]!.props.content).toBe("TBA");
    expect(result.children[1]!.props.content).toBe("1.50B");
  });

  test("does not mutate original recipe", () => {
    const recipe = { type: "text", props: { content: "${content.name}" } };
    const original = JSON.stringify(recipe);
    bindEnv.bindDeep(recipe, { content: { name: "Test" } });
    expect(JSON.stringify(recipe)).toBe(original);
  });

  test("handles array string elements with bindings", () => {
    const recipe = { type: "view", items: ["${content.a}", "${content.b}"] };
    const data = { content: { a: "one", b: "two" } };
    const result = bindEnv.bindDeep(recipe, data) as { items: string[] };
    expect(result.items[0]).toBe("one");
    expect(result.items[1]).toBe("two");
  });

  test("mixed string with multiple bindings", () => {
    const recipe = { type: "text", props: { content: "${content.name} (${content.symbol})" } };
    const data = { content: { name: "Token", symbol: "TBA" } };
    const result = bindEnv.bindDeep(recipe, data) as { props: { content: string } };
    expect(result.props.content).toBe("Token (TBA)");
  });
});
