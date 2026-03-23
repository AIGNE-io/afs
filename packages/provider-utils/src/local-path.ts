import { getPlatform } from "@aigne/afs";

export interface ResolveLocalPathOptions {
  cwd?: string;
}

export function resolveLocalPath(rawPath: string, options?: ResolveLocalPathOptions): string {
  const { path } = getPlatform();

  if (rawPath === ".") {
    return process.cwd();
  }

  let resolved = rawPath.replaceAll("${CWD}", process.cwd());

  if (resolved.startsWith("~/")) {
    const home = process.env.HOME;
    if (!home) {
      throw new Error("Cannot resolve '~/' path: HOME environment variable is not set");
    }
    resolved = path.join(home, resolved.slice(2));
  }

  if (!path.isAbsolute(resolved)) {
    resolved = path.join(options?.cwd || process.cwd(), resolved);
  }

  return resolved;
}
