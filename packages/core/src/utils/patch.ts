import { AFSPatchError } from "../error.js";
import type { AFSPatch } from "../type.js";

/**
 * Validate target and find its unique position in text.
 * Throws AFSPatchError if target is empty, not found, or ambiguous.
 */
function findUniqueTarget(text: string, target: string): number {
  if (!target) {
    throw new AFSPatchError("PATCH_TARGET_NOT_FOUND", "Patch target cannot be empty");
  }
  const idx = text.indexOf(target);
  if (idx === -1) {
    throw new AFSPatchError(
      "PATCH_TARGET_NOT_FOUND",
      `Patch target not found: "${target.length > 80 ? `${target.slice(0, 80)}...` : target}"`,
    );
  }
  if (text.indexOf(target, idx + 1) !== -1) {
    throw new AFSPatchError(
      "PATCH_TARGET_AMBIGUOUS",
      `Patch target appears more than once: "${target.length > 80 ? `${target.slice(0, 80)}...` : target}"`,
    );
  }
  return idx;
}

/**
 * Apply a single patch operation to text. Returns the modified text.
 * Throws AFSPatchError on validation failure.
 */
export function applyPatch(text: string, patch: AFSPatch): string {
  const { op, target, content: replacement = "" } = patch;
  const idx = findUniqueTarget(text, target);
  const endIdx = idx + target.length;

  switch (op) {
    case "str_replace":
      return text.slice(0, idx) + replacement + text.slice(endIdx);
    case "insert_before":
      return text.slice(0, idx) + replacement + text.slice(idx);
    case "insert_after":
      return text.slice(0, endIdx) + replacement + text.slice(endIdx);
    case "delete":
      return text.slice(0, idx) + text.slice(endIdx);
  }
}

/**
 * Apply multiple patches sequentially. Each patch operates on the result of the previous.
 * Atomic: validates all patches can apply before returning. On failure, throws and
 * the caller's original data is unchanged (this function is pure).
 */
export function applyPatches(text: string, patches: AFSPatch[]): string {
  let result = text;
  for (const patch of patches) {
    result = applyPatch(result, patch);
  }
  return result;
}
