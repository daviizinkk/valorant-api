/**
 * @file Locate and parse the Riot Client lockfile.
 *
 * The lockfile is a colon-separated file written by the Riot Client process:
 *   `name:pid:port:password:protocol`
 *
 * This module discovers it across common installation paths and running processes.
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import { RiotClientNotRunningError, InvalidLockfileError } from '../errors.js';

/**
 * Common Riot Client lockfile locations for each OS.
 * Order matters — we check the most common first.
 */
const LOCKFILE_CANDIDATES = (() => {
  const home = homedir();

  if (platform() === 'win32') {
    return [
      // Primary: LocalAppData
      join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
      // Fallback: ProgramData
      join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
    ];
  }

  if (platform() === 'darwin') {
    return [
      join(home, 'Library', 'Application Support', 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
      join(home, 'Applications', 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
    ];
  }

  // Linux (Lutris / Wine prefixes)
  return [
    join(home, 'Games', 'valorant', 'drive_c', 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
    join(home, '.local', 'share', 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
    join(home, '.wine', 'drive_c', 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
  ];
})();

/**
 * @typedef {object} LockfileData
 * @property {string}  name     Process name (e.g. "Riot Client")
 * @property {number}  pid      Process ID
 * @property {number}  port     Local HTTPS port
 * @property {string}  password Auth password
 * @property {string}  protocol Protocol (usually "https")
 * @property {string}  path     Filesystem path to the lockfile
 */

/**
 * Attempt to locate the Riot Client lockfile by checking known paths.
 * On Windows, also attempts to discover the running Riot Client process path.
 *
 * @returns {string}  Path to the lockfile
 * @throws {RiotClientNotRunningError}  If the lockfile cannot be found
 */
export function findLockfile() {
  // 1. Check known paths
  for (const candidate of LOCKFILE_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // 2. On Windows, try to infer the path from the running Riot Client process
  if (platform() === 'win32') {
    try {
      const output = execSync(
        'wmic process where "name=\'RiotClientServices.exe\'" get ExecutablePath /format:value 2>nul',
        { encoding: 'utf8', timeout: 3000 }
      );
      const match = output.match(/ExecutablePath=(.+)/);
      if (match) {
        const exePath = match[1].trim();
        const baseDir = exePath.replace(/Riot Client\\RiotClientServices\.exe$/i, 'Riot Client');
        const lockfile = join(baseDir, 'Config', 'lockfile');
        if (existsSync(lockfile)) {
          return lockfile;
        }
      }
    } catch {
      // wmic not available or process not found — continue
    }

    // 3. Try tasklist approach (fallback)
    try {
      const output = execSync(
        'tasklist /fi "imagename eq RiotClientServices.exe" /fo csv /nh 2>nul',
        { encoding: 'utf8', timeout: 3000 }
      );
      if (output.trim()) {
        // Process is running, but we need the path — try wmic again with different syntax
        const pid = output.split(',')[1]?.replace(/"/g, '').trim();
        if (pid) {
          try {
            const wmicPath = execSync(
              `wmic process where "processid=${pid}" get ExecutablePath /format:value 2>nul`,
              { encoding: 'utf8', timeout: 3000 }
            );
            const pathMatch = wmicPath.match(/ExecutablePath=(.+)/);
            if (pathMatch) {
              const exePath = pathMatch[1].trim();
              const baseDir = exePath.replace(/Riot Client\\RiotClientServices\.exe$/i, 'Riot Client');
              const lockfile = join(baseDir, 'Config', 'lockfile');
              if (existsSync(lockfile)) {
                return lockfile;
              }
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // tasklist not available
    }
  }

  // 4. On macOS, try pgrep + lsof
  if (platform() === 'darwin') {
    try {
      const output = execSync('pgrep -x "Riot Client" 2>/dev/null || pgrep -x "RiotClient" 2>/dev/null', {
        encoding: 'utf8', timeout: 3000,
      });
      if (output.trim()) {
        const pid = output.trim().split('\n')[0];
        const pathOutput = execSync(`lsof -p ${pid} 2>/dev/null | grep lockfile | head -1`, {
          encoding: 'utf8', timeout: 3000,
        });
        const filePath = pathOutput.trim().split(/\s+/).pop();
        if (filePath && existsSync(filePath)) {
          return filePath;
        }
      }
    } catch {
      // ignore
    }
  }

  throw new RiotClientNotRunningError();
}

/**
 * Parse a raw lockfile string into structured data.
 *
 * @param {string}  raw     Raw lockfile contents
 * @param {string}  [path]  Filesystem path (for error reporting)
 * @returns {LockfileData}
 * @throws {InvalidLockfileError}
 */
export function parseLockfile(raw, path) {
  const parts = raw.trim().split(':');

  if (parts.length < 5 || !parts[0] || !parts[2] || !parts[3]) {
    throw new InvalidLockfileError(
      `Lockfile at "${path}" is malformed. Expected "name:pid:port:password:protocol".`
    );
  }

  const port = Number(parts[2]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new InvalidLockfileError(
      `Lockfile contains an invalid port: "${parts[2]}".`
    );
  }

  return {
    name: parts[0],
    pid: Number(parts[1]),
    port,
    password: parts[3],
    protocol: parts[4] || 'https',
    path: path ?? null,
  };
}

/**
 * Convenience: find + parse the lockfile in one call.
 *
 * @returns {LockfileData}
 */
export function readLockfile() {
  const lockfilePath = findLockfile();
  const raw = readFileSync(lockfilePath, 'utf8');
  return parseLockfile(raw, lockfilePath);
}
