/**
 * Re-export all AUP types from @aigne/afs-aup.
 *
 * This file preserves backward compatibility — all existing imports
 * from "./aup-types.js" continue to work without changes.
 */

export type {
  AUPClientMessage,
  AUPCreateOp,
  AUPEvent,
  AUPEventMessage,
  AUPEventResultMessage,
  AUPIntent,
  AUPNode,
  AUPPatchMessage,
  AUPPatchOp,
  AUPRemoveOp,
  AUPRenderMessage,
  AUPReorderOp,
  AUPServerMessage,
  AUPSize,
  AUPStageMessage,
  AUPTakeMessage,
  AUPUpdateOp,
  AUPVariant,
  DeviceCaps,
  DeviceDisplay,
  DeviceInput,
  PrimitiveCap,
} from "@aigne/afs-aup";
export {
  AUP_PRIMITIVES,
  DEVICE_CAPS_TERM,
  DEVICE_CAPS_TTY,
  DEVICE_CAPS_WEB_CHAT,
  DEVICE_CAPS_WEB_FULL,
  fillPrimitives,
  validateDeviceCaps,
  validateNode,
  validatePatchOp,
} from "@aigne/afs-aup";
