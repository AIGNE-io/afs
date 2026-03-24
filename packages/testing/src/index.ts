/**
 * Provider testing framework for AFS.
 *
 * This module provides a unified testing framework for validating
 * AFS provider implementations, ensuring consistent behavior across
 * all providers.
 *
 * @example
 * ```typescript
 * import { runProviderTests } from "@aigne/afs/testing";
 *
 * describe("MyProvider Conformance", () => {
 *   runProviderTests({
 *     name: "MyProvider",
 *     createProvider: () => new MyProvider({ ... }),
 *     structure: {
 *       root: {
 *         name: "",
 *         children: [
 *           { name: "file.txt", content: "Hello" },
 *           {
 *             name: "docs",
 *             children: [
 *               { name: "readme.md", content: "# Readme" },
 *             ],
 *           },
 *         ],
 *       },
 *     },
 *   });
 * });
 * ```
 *
 * @module
 */

export {
  validateEntry,
  validateListResult,
  validateReadResult,
  validateSearchResult,
  validateStatResult,
} from "./assertions.js";
export { isDockerAvailable, startDocker, stopDocker } from "./docker.js";
export { runProviderTests } from "./runner.js";
export type {
  ActionExpectedOutput,
  ActionOutputValidator,
  ActionTestCase,
  DeleteTestCase,
  ExecuteExpectedOutput,
  ExecuteOutputValidator,
  ExecuteTestCase,
  FlattenedNode,
  PlaygroundSetup,
  ProviderTestFixture,
  TestActionDeclaration,
  TestConfig,
  TestDataStructure,
  TestTreeNode,
  WriteExpectedOutput,
  WriteOutputValidator,
  WriteTestCase,
} from "./types.js";
export {
  computePath,
  findFirstDirectory,
  findFirstFile,
  findNestedDirectory,
  findNode,
  flattenTree,
  getAllDirectories,
  getAllFiles,
  isDirectory,
  isFile,
} from "./types.js";
