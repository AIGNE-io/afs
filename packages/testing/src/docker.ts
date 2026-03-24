/**
 * Docker compose lifecycle utilities for integration tests.
 */

import { execSync } from "node:child_process";

/**
 * Check if Docker is available on the system.
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    execSync("docker info", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Start Docker Compose services and wait for health checks.
 */
export async function startDocker(composePath: string): Promise<void> {
  execSync(`docker compose -f ${composePath} up -d --wait`, {
    stdio: "inherit",
    timeout: 120000,
  });
}

/**
 * Stop Docker Compose services.
 */
export async function stopDocker(composePath: string): Promise<void> {
  execSync(`docker compose -f ${composePath} down -v`, {
    stdio: "inherit",
    timeout: 30000,
  });
}
