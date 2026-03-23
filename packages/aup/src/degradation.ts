/**
 * AUP Degradation Transformer (D14)
 *
 * Walks an AUP node tree and degrades unsupported primitives
 * according to protocol-defined degradation chains.
 * Annotates degraded nodes with `_degradedFrom` in props.
 */

import type { AUPNode, DeviceCaps, PrimitiveCap } from "./aup-types.js";

// ── Degradation Chain Registry ──

/**
 * Each entry maps a primitive type to its ordered degradation chain.
 * The chain is tried left-to-right; the first supported type wins.
 * "unsupported" means no meaningful fallback exists.
 */
export const DEGRADATION_CHAINS: Record<string, string[]> = {
  globe: ["map", "media", "text"],
  chart: ["table", "text"],
  map: ["media", "text"],
  editor: ["input", "text"],
  canvas: ["media", "text"],
  rtc: ["unsupported"],
  calendar: ["table", "text"],
  time: ["text"],
  overlay: ["text"],
};

// ── Core API ──

/**
 * Walk the AUP tree and degrade unsupported primitives.
 * Returns a new tree (does not mutate the original).
 */
export function degradeTree(node: AUPNode, caps: DeviceCaps): AUPNode {
  return degradeNode(node, caps);
}

// ── Internal ──

function isSupported(primitiveType: string, caps: DeviceCaps): boolean {
  const cap: PrimitiveCap | undefined = caps.primitives[primitiveType];
  // "native", "webview", "partial" are all considered supported
  // "unsupported" or missing means not supported
  return cap === "native" || cap === "webview" || cap === "partial";
}

function degradeNode(node: AUPNode, caps: DeviceCaps): AUPNode {
  // First, degrade this node if needed
  let result = degradeNodeType(node, caps);

  // Then recurse into children
  if (result.children && result.children.length > 0) {
    const degradedChildren = result.children.map((child) => degradeNode(child, caps));
    // Only create new object if children actually changed
    if (degradedChildren.some((c, i) => c !== result.children![i])) {
      result = { ...result, children: degradedChildren };
    }
  }

  return result;
}

function degradeNodeType(node: AUPNode, caps: DeviceCaps): AUPNode {
  const nodeType = node.type;

  // Already supported — no degradation needed
  if (isSupported(nodeType, caps)) {
    return node;
  }

  // No degradation chain defined — pass through (unknown/custom type)
  const chain = DEGRADATION_CHAINS[nodeType];
  if (!chain) {
    return node;
  }

  // Walk the chain to find the first supported fallback
  const originalType = nodeType;
  for (const fallbackType of chain) {
    if (fallbackType === "unsupported") {
      // No meaningful fallback — mark as unsupported
      return {
        ...node,
        type: "text",
        props: {
          ...node.props,
          _degradedFrom: originalType,
          _unsupported: true,
          content: node.props?.content ?? `[${originalType}: unsupported on this device]`,
        },
      };
    }

    if (isSupported(fallbackType, caps)) {
      // Found a supported fallback
      return {
        ...node,
        type: fallbackType,
        props: {
          ...node.props,
          _degradedFrom: originalType,
        },
      };
    }
  }

  // Exhausted chain without finding support — degrade to text with annotation
  return {
    ...node,
    type: "text",
    props: {
      ...node.props,
      _degradedFrom: originalType,
      content: node.props?.content ?? `[${originalType}: degraded to text]`,
    },
  };
}
