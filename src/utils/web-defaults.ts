import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const CLAUDE_DENY_TOOLS = ['WebSearch', 'WebFetch'] as const;
const CODEX_WEB_SEARCH_DISABLED = 'web_search = "disabled"';

export interface WebDefaultsOptions {
  undo?: boolean;
}

export interface WebDefaultResult {
  agent: 'Claude Code' | 'Codex';
  path: string;
  changed: boolean;
  skipped?: boolean;
  message: string;
}

async function readText(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

function removeJsonComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

async function configureClaudeDefaults(
  undo: boolean
): Promise<WebDefaultResult> {
  const filePath = path.join(os.homedir(), '.claude', 'settings.json');
  const existing = await readText(filePath);
  let config: Record<string, unknown> = {};

  if (existing && existing.trim()) {
    try {
      config = JSON.parse(removeJsonComments(existing));
    } catch {
      return {
        agent: 'Claude Code',
        path: filePath,
        changed: false,
        skipped: true,
        message:
          'Skipped Claude Code settings because settings.json is not valid JSON',
      };
    }
  }

  const permissions =
    config.permissions && typeof config.permissions === 'object'
      ? (config.permissions as Record<string, unknown>)
      : {};
  const deny = Array.isArray(permissions.deny)
    ? permissions.deny.filter(
        (value): value is string => typeof value === 'string'
      )
    : [];

  let nextDeny: string[];
  const denyTools = new Set<string>(CLAUDE_DENY_TOOLS);
  if (undo) {
    nextDeny = deny.filter((tool) => !denyTools.has(tool));
  } else {
    nextDeny = Array.from(new Set([...deny, ...CLAUDE_DENY_TOOLS]));
  }

  const changed =
    deny.length !== nextDeny.length ||
    deny.some((tool, index) => tool !== nextDeny[index]);

  if (!changed) {
    return {
      agent: 'Claude Code',
      path: filePath,
      changed: false,
      message: undo
        ? 'Claude Code native WebSearch/WebFetch were already enabled'
        : 'Claude Code already denies native WebSearch/WebFetch',
    };
  }

  const nextPermissions = { ...permissions };
  if (nextDeny.length > 0) {
    nextPermissions.deny = nextDeny;
  } else {
    delete nextPermissions.deny;
  }

  const nextConfig = { ...config };
  if (Object.keys(nextPermissions).length > 0) {
    nextConfig.permissions = nextPermissions;
  } else {
    delete nextConfig.permissions;
  }

  await writeText(filePath, `${JSON.stringify(nextConfig, null, 2)}\n`);

  return {
    agent: 'Claude Code',
    path: filePath,
    changed: true,
    message: undo
      ? 'Enabled Claude Code native WebSearch/WebFetch'
      : 'Disabled Claude Code native WebSearch/WebFetch',
  };
}

function setCodexWebSearchDisabled(content: string): {
  content: string;
  changed: boolean;
} {
  const webSearchLine = /^web_search\s*=\s*("[^"]*"|'[^']*'|[^\r\n#]+).*$/m;

  if (webSearchLine.test(content)) {
    const next = content.replace(webSearchLine, CODEX_WEB_SEARCH_DISABLED);
    return { content: next, changed: next !== content };
  }

  const prefix =
    content.trim().length > 0 && !content.endsWith('\n') ? '\n' : '';
  return {
    content: `${content}${prefix}${CODEX_WEB_SEARCH_DISABLED}\n`,
    changed: true,
  };
}

function removeCodexWebSearchDisabled(content: string): {
  content: string;
  changed: boolean;
} {
  const lines = content.split(/\r?\n/);
  const nextLines = lines.filter(
    (line) => !/^web_search\s*=\s*["']disabled["']\s*(#.*)?$/.test(line.trim())
  );
  const next = nextLines.join('\n').replace(/\n{3,}/g, '\n\n');
  return { content: next, changed: next !== content };
}

async function configureCodexDefaults(
  undo: boolean
): Promise<WebDefaultResult> {
  const filePath = path.join(os.homedir(), '.codex', 'config.toml');
  const existing = (await readText(filePath)) ?? '';
  const result = undo
    ? removeCodexWebSearchDisabled(existing)
    : setCodexWebSearchDisabled(existing);

  if (!result.changed) {
    return {
      agent: 'Codex',
      path: filePath,
      changed: false,
      message: undo
        ? 'Codex native web search was already enabled'
        : 'Codex native web search was already disabled',
    };
  }

  await writeText(filePath, result.content);

  return {
    agent: 'Codex',
    path: filePath,
    changed: true,
    message: undo
      ? 'Enabled Codex native web search'
      : 'Disabled Codex native web search',
  };
}

export async function configureWebDefaults(
  options: WebDefaultsOptions = {}
): Promise<WebDefaultResult[]> {
  const undo = Boolean(options.undo);
  return Promise.all([
    configureClaudeDefaults(undo),
    configureCodexDefaults(undo),
  ]);
}
