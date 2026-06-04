import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import packageJson from '../../package.json';
import { compareVersions, getLatestVersion } from './npm-registry';

const CACHE_FILENAME = 'update-check.json';
const CACHE_TTL_MS = 20 * 60 * 60 * 1000;
const RELEASE_NOTES_URL = 'https://github.com/firecrawl/cli/releases/latest';
const INSTALL_COMMAND = 'npm install -g firecrawl-cli';

interface UpdateCache {
  latestVersion: string;
  checkedAt: string;
}

export interface UpdateNoticeOptions {
  cacheDir?: string;
  now?: Date;
  stderr?: Pick<NodeJS.WriteStream, 'write' | 'isTTY'>;
}

function getCachePath(cacheDir?: string): string {
  return path.join(
    cacheDir ?? path.join(os.homedir(), '.firecrawl'),
    CACHE_FILENAME
  );
}

function updateCheckDisabled(): boolean {
  const value = process.env.FIRECRAWL_NO_UPDATE_CHECK;
  return value === '1' || value === 'true';
}

function supportsColor(stderr: Pick<NodeJS.WriteStream, 'isTTY'>): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined)
    return process.env.FORCE_COLOR !== '0';
  return Boolean(stderr.isTTY);
}

async function readCachedLatest(
  cachePath: string,
  now: Date
): Promise<{ latestVersion?: string; stale: boolean }> {
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UpdateCache>;
    if (
      typeof parsed.latestVersion !== 'string' ||
      typeof parsed.checkedAt !== 'string'
    ) {
      return { stale: true };
    }

    const checkedAt = new Date(parsed.checkedAt).getTime();
    const stale =
      !Number.isFinite(checkedAt) || now.getTime() - checkedAt > CACHE_TTL_MS;
    return { latestVersion: parsed.latestVersion, stale };
  } catch {
    return { stale: true };
  }
}

async function writeCachedLatest(
  cachePath: string,
  latestVersion: string,
  now: Date
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(
      cachePath,
      `${JSON.stringify({ latestVersion, checkedAt: now.toISOString() })}\n`,
      'utf-8'
    );
  } catch {
    // Update checks should never make a real command fail.
  }
}

function colorize(message: string, stderr: Pick<NodeJS.WriteStream, 'isTTY'>) {
  if (!supportsColor(stderr)) return message;
  return message
    .replace('Update available!', '\x1b[1;36mUpdate available!\x1b[0m')
    .replace(INSTALL_COMMAND, `\x1b[36m${INSTALL_COMMAND}\x1b[0m`)
    .replace(RELEASE_NOTES_URL, `\x1b[36;4m${RELEASE_NOTES_URL}\x1b[0m`);
}

export function formatUpdateNotice(latestVersion: string): string {
  const currentVersion = packageJson.version;
  const lines = [
    `✨ Update available! ${currentVersion} -> ${latestVersion}`,
    `Run ${INSTALL_COMMAND} to update.`,
    '',
    'See full release notes:',
    RELEASE_NOTES_URL,
  ];
  const width = Math.max(...lines.map((line) => line.length));
  const top = `╭${'─'.repeat(width + 2)}╮`;
  const bottom = `╰${'─'.repeat(width + 2)}╯`;
  const body = lines.map((line) => `│ ${line.padEnd(width)} │`);
  return [top, ...body, bottom].join('\n');
}

function shouldShowNotice(latestVersion: string | undefined): boolean {
  return (
    typeof latestVersion === 'string' &&
    compareVersions(packageJson.version, latestVersion) < 0
  );
}

export async function maybeShowUpdateNotice(
  options: UpdateNoticeOptions = {}
): Promise<void> {
  const stderr = options.stderr ?? process.stderr;
  if (!stderr.isTTY || updateCheckDisabled()) return;

  const now = options.now ?? new Date();
  const cachePath = getCachePath(options.cacheDir);
  const cached = await readCachedLatest(cachePath, now);

  let latestVersion = cached.latestVersion;
  if (cached.stale) {
    const latest = await getLatestVersion(packageJson.name, 750);
    if (!latest.unreachable && latest.version) {
      latestVersion = latest.version;
      await writeCachedLatest(cachePath, latest.version, now);
    }
  }

  if (!shouldShowNotice(latestVersion) || latestVersion === undefined) return;

  stderr.write(`${colorize(formatUpdateNotice(latestVersion), stderr)}\n\n`);
}
