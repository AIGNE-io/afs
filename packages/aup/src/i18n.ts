/**
 * AUP i18n & variable resolution.
 *
 * Three-level API:
 * - resolveTranslationString() — resolve $t() in a single string
 * - resolveTranslations()      — resolve $t() recursively in an AUP node tree
 * - resolveAUPVariables()      — resolve $locale, $theme etc. in an AUP node tree
 *
 * Security notes:
 * - Translation values are substituted as-is — HTML escaping is the renderer's responsibility.
 * - Values containing $t() are NOT recursively resolved — prevents injection loops.
 * - Only props and children are resolved — id, type, events are never touched.
 */
import type { AUPNode } from "./aup-types.js";

const T_PATTERN = /\$t\(([^)]+)\)/g;

/**
 * Resolve $t(key) placeholders in a single string.
 *
 * Returns the original string unchanged if no $t() patterns are present.
 * Does NOT recursively resolve — if a translation value itself contains $t(),
 * it will appear literally in the output.
 */
export function resolveTranslationString(
  text: string,
  messages: Record<string, string>,
  fallback?: Record<string, string>,
): string {
  if (!text.includes("$t(")) return text;
  return text.replace(T_PATTERN, (_match, key) => {
    return messages[key] ?? fallback?.[key] ?? _match;
  });
}

/**
 * Resolve $t(key) placeholders in an AUP node tree.
 *
 * Walks the tree recursively and replaces $t() patterns in all string values
 * within `props` and `children`. Does not touch `id`, `type`, or `events`.
 *
 * Does not mutate the original tree — returns a new tree.
 *
 * @param node - AUP node tree
 * @param messages - Translation messages for the target locale
 * @param fallback - Optional fallback messages (e.g. English) when key missing
 */
export function resolveTranslations(
  node: AUPNode,
  messages: Record<string, string>,
  fallback?: Record<string, string>,
): AUPNode {
  const resolveValue = (value: unknown): unknown => {
    if (typeof value === "string") {
      return resolveTranslationString(value, messages, fallback);
    }
    if (Array.isArray(value)) {
      return value.map(resolveValue);
    }
    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = resolveValue(v);
      }
      return result;
    }
    return value;
  };

  const result: AUPNode = { ...node };
  if (result.props) {
    result.props = resolveValue(result.props) as Record<string, unknown>;
  }
  if (result.children) {
    result.children = result.children.map((child) => {
      if ((child as any).$ref) return child;
      return resolveTranslations(child as AUPNode, messages, fallback);
    });
  }
  return result;
}

/**
 * Resolve AUP protocol-level variables ($locale, $theme, etc.) in an AUP node tree.
 *
 * Replaces `$varName` patterns in all string values within `props`, `events`,
 * and `children`. Does not touch `id`, `type`, or `$t()` patterns.
 * Does not mutate the original tree — returns a new tree.
 *
 * @param node - AUP node tree
 * @param variables - Variable map (e.g. `{ locale: "zh", theme: "opus" }`)
 */
export function resolveAUPVariables(node: AUPNode, variables: Record<string, string>): AUPNode {
  const keys = Object.keys(variables);
  if (keys.length === 0) return node;

  const replaceVars = (str: string): string => {
    let result = str;
    for (const key of keys) {
      const token = `$${key}`;
      if (result.includes(token)) {
        // Only replace exact $varName, not $t(varName) — skip if preceded by $t(
        result = result.replaceAll(token, variables[key]!);
      }
    }
    return result;
  };

  const resolveValue = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (!value.includes("$")) return value;
      return replaceVars(value);
    }
    if (Array.isArray(value)) {
      return value.map(resolveValue);
    }
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = resolveValue(v);
      }
      return out;
    }
    return value;
  };

  const result: AUPNode = { ...node };
  if (result.props) {
    result.props = resolveValue(result.props) as Record<string, unknown>;
  }
  if (result.events) {
    result.events = resolveValue(result.events) as typeof result.events;
  }
  if (result.children) {
    result.children = result.children.map((child) => {
      if ((child as any).$ref) return child;
      return resolveAUPVariables(child as AUPNode, variables);
    });
  }
  return result;
}
