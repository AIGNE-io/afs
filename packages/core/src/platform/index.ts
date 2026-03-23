// Platform abstraction layer

export { getPlatform, resetPlatform, setPlatform } from "./global.js";
export { createMemoryAdapter, MemoryFS, memoryCrypto, memoryPath } from "./memory.js";
export { createNodeAdapter } from "./node.js";
export type {
  PlatformAdapter,
  PlatformCapability,
  PlatformCrypto,
  PlatformFS,
  PlatformModule,
  PlatformPath,
  PlatformProcess,
} from "./types.js";
export {
  AFSFileNotFoundError,
  AFSIOError,
  AFSPermissionError,
  AFSPlatformError,
} from "./types.js";
