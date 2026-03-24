/**
 * AUP content tree validator.
 *
 * Validates AUP node trees against the primitive registry before
 * accepting them into the WM. Returns actionable error messages
 * with complete fix recipes so LLM agents can self-correct in one round.
 */

import { ALL_TYPES, type PrimitiveDef } from "./aup-registry.js";

interface ValidationError {
  nodeId: string;
  nodeType: string;
  message: string;
}

/**
 * Validate an AUP content tree recursively.
 * Returns an array of errors — empty means valid.
 */
export function validateAupContent(node: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  walkNode(node, errors);
  return errors;
}

/**
 * Format validation errors into a single error message for the LLM.
 * Includes complete fix recipes — correct prop schemas and working examples
 * so the agent can fix everything in one round without exploring /ui/primitives.
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  const lines = ["AUP content validation failed:"];
  const shownExamples = new Set<string>();

  for (const e of errors) {
    lines.push(`- [${e.nodeType}#${e.nodeId}] ${e.message}`);
  }

  // Append fix recipes for each unique known type that had errors
  for (const e of errors) {
    if (shownExamples.has(e.nodeType)) continue;
    const def = ALL_TYPES[e.nodeType];
    if (!def) continue;
    shownExamples.add(e.nodeType);
    lines.push("");
    lines.push(`FIX for "${e.nodeType}":`);
    lines.push(`  Props: ${formatFullPropSchema(def)}`);
    lines.push(`  Example: ${JSON.stringify(def.example)}`);
  }

  return lines.join("\n");
}

// ── Internal ──

/** Known internal/structural types that bypass primitive validation */
const STRUCTURAL_TYPES = new Set(["wm-surface", "wm"]);

function walkNode(node: Record<string, unknown>, errors: ValidationError[]): void {
  const id = (node.id as string) || "(no id)";
  const type = node.type as string | undefined;

  if (!type) {
    errors.push({
      nodeId: id,
      nodeType: "(missing)",
      message: "Node is missing required `type` field.",
    });
    return;
  }

  // Skip structural types (wm-surface, wm)
  if (STRUCTURAL_TYPES.has(type)) {
    walkChildren(node, errors);
    return;
  }

  const def = ALL_TYPES[type];
  if (!def) {
    const known = Object.keys(ALL_TYPES)
      .filter((k) => ALL_TYPES[k]?.category === "fundamental")
      .join(", ");
    errors.push({
      nodeId: id,
      nodeType: type,
      message: `Unknown primitive type "${type}". Common types: ${known}`,
    });
    return;
  }

  // Validate props
  const props = (node.props as Record<string, unknown>) || {};
  validateProps(id, type, props, def, errors);

  // Recurse into children
  walkChildren(node, errors);
}

function validateProps(
  nodeId: string,
  nodeType: string,
  props: Record<string, unknown>,
  def: PrimitiveDef,
  errors: ValidationError[],
): void {
  const defProps = def.props;

  // Check required props
  for (const [key, propDef] of Object.entries(defProps)) {
    if (propDef.required && !(key in props)) {
      errors.push({
        nodeId,
        nodeType,
        message: `Missing required prop "${key}" (${propDef.type}) — ${propDef.description}`,
      });
    }
  }

  // Check for unknown props
  const unknownKeys = Object.keys(props).filter((k) => !(k in defProps));
  if (unknownKeys.length > 0) {
    errors.push({
      nodeId,
      nodeType,
      message: `Unknown props: ${unknownKeys.join(", ")}. Valid props: ${Object.keys(defProps).join(", ")}`,
    });
  }
}

function walkChildren(node: Record<string, unknown>, errors: ValidationError[]): void {
  const children = node.children as Record<string, unknown>[] | undefined;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === "object") {
        walkNode(child, errors);
      }
    }
  }
}

/** Full prop schema: each prop with type, required flag, and description */
function formatFullPropSchema(def: PrimitiveDef): string {
  const parts: string[] = [];
  for (const [key, propDef] of Object.entries(def.props)) {
    const req = propDef.required ? " REQUIRED" : "";
    parts.push(`${key}(${propDef.type}${req})`);
  }
  return `{ ${parts.join(", ")} }`;
}
