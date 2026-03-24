/**
 * Resource AFS factory — creates an isolated AFS per tenant.
 */

import { AFS } from "../afs.js";
import type {
  AliasResolver,
  ConfigStore,
  ResourceContext,
  ResourceProviderFactory,
} from "./types.js";

/**
 * Resolve a request domain to a full ResourceContext.
 * Returns null if the domain is unknown or has no config.
 */
export async function resolveResourceContext(
  host: string,
  aliases: AliasResolver,
  configs: ConfigStore,
): Promise<ResourceContext | null> {
  const resourceId = await aliases.resolve(host);
  if (!resourceId) return null;

  const config = await configs.get(resourceId);
  if (!config) return null;

  return { resourceId, domain: host, config };
}

/**
 * Create an isolated AFS instance for a ResourceContext.
 *
 * Each mount in the config is created via the ProviderFactory and mounted
 * at its declared path. The storagePrefix from the config is injected as
 * `options.prefix` so providers scope their storage to this resource.
 */
export async function createResourceAFS(
  ctx: ResourceContext,
  factory: ResourceProviderFactory,
): Promise<AFS> {
  const afs = new AFS();

  for (const mount of ctx.config.mounts) {
    const options: Record<string, unknown> = {
      ...mount.options,
      prefix: ctx.config.storagePrefix,
    };
    const provider = factory(mount.provider, options);
    await afs.mount(provider, mount.path);
  }

  return afs;
}
