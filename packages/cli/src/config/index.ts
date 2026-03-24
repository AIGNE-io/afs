// Config module exports

export { type ProviderFactory, ProviderRegistry } from "@aigne/afs";
export {
  type CreateAFSOptions,
  type CreateAFSResult,
  createAFS,
  loadAFS,
  type MountFailure,
  type MountProgressEvent,
  resetAFSCache,
} from "./afs-loader.js";
export { type ResolveEnvOptions, resolveEnvVars, resolveEnvVarsInObject } from "./env.js";
export {
  AFS_USER_CONFIG_DIR_ENV,
  ConfigLoader,
  type ConfigLoaderOptions,
  configLoader,
} from "./loader.js";
export { type AFSConfig, ConfigSchema, type MountConfig, MountSchema } from "./schema.js";
export { type ParsedURI, parseURI } from "./uri-parser.js";
