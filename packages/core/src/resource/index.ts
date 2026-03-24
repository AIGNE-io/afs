/**
 * Multi-tenant resource context — domain → resourceId → mount tree.
 *
 * Pure types and functions, zero platform dependencies.
 * Workers uses KV for AliasResolver + ConfigStore.
 * Node uses JSON file / in-memory map.
 */

export { createResourceAFS, resolveResourceContext } from "./factory.js";
export type {
  AliasResolver,
  ConfigStore,
  ResourceConfig,
  ResourceContext,
  ResourceProviderFactory,
} from "./types.js";
