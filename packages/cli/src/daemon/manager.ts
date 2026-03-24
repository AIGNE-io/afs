/**
 * Daemon Process Manager
 *
 * Manages PID/port files in ~/.afs/ and provides daemon lifecycle operations.
 */

import { type SpawnOptions, spawn } from "node:child_process";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DaemonInfo {
  pid: number;
  port: number;
  url: string;
  mcpUrl: string;
}

const DAEMON_DIR = join(homedir(), ".afs");
const PID_FILE = join(DAEMON_DIR, "daemon.pid");
const PORT_FILE = join(DAEMON_DIR, "daemon.port");
const LOG_FILE = join(DAEMON_DIR, "daemon.log");

export function getDaemonDir(): string {
  return DAEMON_DIR;
}

export function getLogFile(): string {
  return LOG_FILE;
}

export async function ensureDaemonDir(): Promise<void> {
  await mkdir(DAEMON_DIR, { recursive: true });
}

export async function writePidFile(pid: number): Promise<void> {
  await ensureDaemonDir();
  await writeFile(PID_FILE, String(pid), "utf-8");
}

export async function writePortFile(port: number): Promise<void> {
  await ensureDaemonDir();
  await writeFile(PORT_FILE, String(port), "utf-8");
}

export async function readPidFile(): Promise<number | null> {
  try {
    const content = await readFile(PID_FILE, "utf-8");
    const pid = Number.parseInt(content.trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export async function readPortFile(): Promise<number | null> {
  try {
    const content = await readFile(PORT_FILE, "utf-8");
    const port = Number.parseInt(content.trim(), 10);
    return Number.isNaN(port) ? null : port;
  } catch {
    return null;
  }
}

export async function cleanPidFiles(): Promise<void> {
  try {
    await rm(PID_FILE, { force: true });
  } catch {
    // ignore
  }
  try {
    await rm(PORT_FILE, { force: true });
  } catch {
    // ignore
  }
}

/**
 * Check if a process is alive by sending signal 0.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if daemon is currently running.
 * Returns DaemonInfo if alive, null if not running (cleans stale PID files).
 */
export async function getDaemonStatus(): Promise<DaemonInfo | null> {
  const pid = await readPidFile();
  if (pid === null) return null;

  if (!isProcessAlive(pid)) {
    // Stale PID file — clean up
    await cleanPidFiles();
    return null;
  }

  const port = await readPortFile();
  if (port === null) return null;

  return {
    pid,
    port,
    url: `http://localhost:${port}`,
    mcpUrl: `http://localhost:${port}/mcp`,
  };
}

/**
 * Stop the daemon by sending SIGTERM to the PID.
 */
export async function stopDaemon(): Promise<boolean> {
  const pid = await readPidFile();
  if (pid === null) return false;

  if (!isProcessAlive(pid)) {
    await cleanPidFiles();
    return false;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may have already exited
  }

  // Wait for process to exit (up to 5 seconds)
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (!isProcessAlive(pid)) {
      await cleanPidFiles();
      return true;
    }
  }

  // Force kill if still alive
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ignore
  }
  await cleanPidFiles();
  return true;
}

/**
 * Spawn a detached daemon child process (`afs daemon _run`).
 *
 * The parent opens a log file, spawns the child detached, then polls for
 * the port file the child writes on successful startup.
 *
 * Returns DaemonInfo once the child is confirmed running, or throws on timeout.
 */
export async function spawnDaemon(port: number): Promise<DaemonInfo> {
  await ensureDaemonDir();

  // Truncate / create log file
  const logFd = await open(LOG_FILE, "w");
  const fd = logFd.fd;

  // No --cwd: _run defaults to homedir() for config discovery.
  // The daemon serves a global AFS instance, independent of caller's cwd.
  const args = [...process.execArgv, process.argv[1]!, "service", "_run", "--port", String(port)];
  const opts: SpawnOptions = {
    detached: true,
    stdio: ["ignore", fd, fd],
    env: {
      ...process.env,
      // Pass caller's working directory so daemon can resolve local blocklets
      AFS_PROJECT_DIR: process.env.AFS_PROJECT_DIR ?? process.cwd(),
    },
  };

  const child = spawn(process.execPath, args, opts);
  child.unref();

  // Close our handle — the child inherited the fd
  await logFd.close();

  // Poll for port file (child writes it on successful startup)
  const maxWait = 15_000;
  const interval = 100;
  const deadline = Date.now() + maxWait;

  while (Date.now() < deadline) {
    const info = await getDaemonStatus();
    if (info) return info;
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Daemon did not start within ${maxWait / 1000}s — check ${LOG_FILE}`);
}
