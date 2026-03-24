/**
 * Meta Path Utilities for AFS
 *
 * Provides functions to work with .meta virtual paths:
 * - /dir/.meta - directory metadata
 * - /dir/.meta/icon.png - directory meta resource
 * - /dir/file.txt/.meta - file metadata
 * - /.meta/.kinds - provider kinds list
 * - /.meta/.kinds/chamber:project - specific kind
 */

import { AFSPathError, normalizePath, validatePath } from "../path.js";
import type { MetaPathInfo } from "./type.js";

/** The .meta virtual path segment */
export const META_SEGMENT = ".meta";

/** The .kinds virtual path segment (under .meta) */
export const KINDS_SEGMENT = ".kinds";

/**
 * Check if a path is a .meta virtual path.
 *
 * A path is considered a meta path if it contains "/.meta" as a path segment
 * (not just a substring of a filename).
 *
 * @param path - Path to check
 * @returns true if the path is a .meta path
 */
export function isMetaPath(path: string): boolean {
  if (!path) {
    return false;
  }

  // Normalize the path to handle // and . and ..
  // But don't throw for invalid paths, just return false
  let normalizedPath: string;
  try {
    // Handle trailing slash
    const trimmedPath = path.endsWith("/") ? path.slice(0, -1) : path;
    if (!trimmedPath.startsWith("/")) {
      return false;
    }
    normalizedPath = normalizePath(trimmedPath);
  } catch {
    return false;
  }

  const segments = normalizedPath.split("/");

  // Check if any segment is exactly .meta
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === META_SEGMENT) {
      return true;
    }
  }

  return false;
}

/**
 * Parse a .meta virtual path into its components.
 *
 * @param path - Meta path to parse (must be absolute and contain .meta)
 * @returns Parsed MetaPathInfo
 * @throws AFSPathError if path is invalid or not a meta path
 */
export function parseMetaPath(path: string): MetaPathInfo {
  if (!path || path.trim() === "") {
    throw new AFSPathError("Meta path cannot be empty", path);
  }

  if (!path.startsWith("/")) {
    throw new AFSPathError("Meta path must be absolute (start with /)", path);
  }

  // Validate and normalize the path (checks for control characters)
  let normalizedPath: string;
  try {
    const trimmedPath = path.endsWith("/") ? path.slice(0, -1) : path;
    // validatePath both validates and normalizes
    normalizedPath = validatePath(trimmedPath);
  } catch (e) {
    if (e instanceof AFSPathError) {
      throw e;
    }
    throw new AFSPathError(`Invalid meta path: ${path}`, path);
  }

  const segments = normalizedPath.split("/");

  // Find the .meta segment index
  let metaIndex = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === META_SEGMENT) {
      metaIndex = i;
      break;
    }
  }

  if (metaIndex === -1) {
    throw new AFSPathError(`Path does not contain .meta: ${path}`, path);
  }

  // Node path is everything before .meta
  const nodeSegments = segments.slice(0, metaIndex);
  const nodePath = nodeSegments.length === 0 ? "/" : `/${nodeSegments.filter(Boolean).join("/")}`;

  // Path after .meta
  const afterMetaSegments = segments.slice(metaIndex + 1);

  // Check for .kinds path
  if (afterMetaSegments.length > 0 && afterMetaSegments[0] === KINDS_SEGMENT) {
    // It's a kinds path
    const kindName = afterMetaSegments.length > 1 ? afterMetaSegments.slice(1).join("/") : null;
    return {
      nodePath: nodePath === "" ? "/" : nodePath,
      resourcePath: null,
      isKindsPath: true,
      kindName: kindName || null,
    };
  }

  // Regular meta path or resource path
  const resourcePath = afterMetaSegments.length > 0 ? afterMetaSegments.join("/") : null;

  return {
    nodePath: nodePath === "" ? "/" : nodePath,
    resourcePath,
    isKindsPath: false,
    kindName: null,
  };
}

/**
 * Check if a path is a .meta/.kinds path.
 *
 * @param path - Path to check
 * @returns true if the path is a kinds path
 */
export function isKindsPath(path: string): boolean {
  if (!path || !isMetaPath(path)) {
    return false;
  }

  try {
    const info = parseMetaPath(path);
    return info.isKindsPath;
  } catch {
    return false;
  }
}

/**
 * Extract the node path from a meta path.
 *
 * @param metaPath - Meta path
 * @returns Node path (without .meta and after)
 * @throws AFSPathError if path is invalid or not a meta path
 */
export function getNodePathFromMetaPath(metaPath: string): string {
  const info = parseMetaPath(metaPath);
  return info.nodePath;
}
