/**
 * AFS Meta System
 *
 * Provides metadata and Kind schema support for AFS nodes.
 * Uses JSON Schema for meta validation.
 */

// Kind definition
export {
  createKindResolver,
  defaultKindResolver,
  defineKind,
  getInheritanceChain,
  type Kind,
  type KindDefinition,
  KindError,
  type KindResolver,
  resolveKindSchema,
} from "./kind.js";
// Meta path utilities
export {
  getNodePathFromMetaPath,
  isKindsPath,
  isMetaPath,
  KINDS_SEGMENT,
  META_SEGMENT,
  parseMetaPath,
} from "./path.js";
// Types
export type {
  AFSExplainResult,
  JSONSchema7,
  KindSchema,
  MetaPathInfo,
  NodeConstraint,
  NodesConstraints,
  ValidationError,
  ValidationResult,
} from "./type.js";
// Validation utilities
export { combineValidationResults, validateNodes } from "./validation.js";
// Well-known kinds
export {
  afsDocument,
  afsExecutable,
  afsImage,
  afsLink,
  afsNode,
  afsProgram,
  commonMetaSchema,
  getWellKnownKind,
  isWellKnownKind,
  WELL_KNOWN_KINDS,
  WELL_KNOWN_KINDS_MAP,
} from "./well-known-kinds.js";
