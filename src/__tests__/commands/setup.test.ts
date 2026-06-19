import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execSync } from 'child_process';
import { handleSetupCommand } from '../../commands/setup';
import { configureWebDefaults } from '../../utils/web-defaults';
import { getApiKey, getConfig } from '../../utils/config';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../utils/web-defaults', () => ({
  configureWebDefaults: vi.fn(async () => []),
}));

vi.mock('../../utils/config', () => ({
  getApiKey: vi.fn(() => 'fc-test-key'),
  getConfig: vi.fn(() => ({})),
}));

describe('handleSetupCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiKey).mockReturnValue('fc-test-key');
    vi.mocked(getConfig).mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs core and build skills globally across all detected agents by default', async () => {
    await handleSetupCommand('skills', {});

    expect(execSync).toHaveBeenCalledWith(
      'npx -y skills add firecrawl/cli --full-depth --global --all',
      expect.objectContaining({ stdio: 'inherit' })
    );
    expect(execSync).toHaveBeenCalledWith(
      'npx -y skills add firecrawl/skills --full-depth --global --all',
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('installs core and build skills globally for a specific agent without using --all', async () => {
    await handleSetupCommand('skills', { agent: 'cursor' });

    expect(execSync).toHaveBeenCalledWith(
      'npx -y skills add firecrawl/cli --full-depth --global --agent cursor',
      expect.objectContaining({ stdio: 'inherit' })
    );
    expect(execSync).toHaveBeenCalledWith(
      'npx -y skills add firecrawl/skills --full-depth --global --agent cursor',
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('installs workflow skills as a separate setup option', async () => {
    await handleSetupCommand('workflows', {});

    expect(execSync).toHaveBeenCalledWith(
      'npx -y skills add firecrawl/firecrawl-workflows --full-depth --global --all',
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('installs the default setup bundle with --yes', async () => {
    await handleSetupCommand(undefined, { yes: true });

    expect(execSync).toHaveBeenCalledWith(
      'npx -y skills add firecrawl/cli --full-depth --global --all',
      expect.objectContaining({ stdio: 'inherit' })
    );
    expect(execSync).toHaveBeenCalledWith(
      'npx -y skills add firecrawl/skills --full-depth --global --all',
      expect.objectContaining({ stdio: 'inherit' })
    );
    expect(execSync).toHaveBeenCalledWith(
      'npx -y add-mcp "npx -y firecrawl-mcp" --name firecrawl --env "FIRECRAWL_API_KEY=fc-test-key" --global --yes',
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({
          FIRECRAWL_API_KEY: 'fc-test-key',
        }),
      })
    );
  });

  it('requires a subcommand for bare setup in non-interactive mode', async () => {
    const originalIsTty = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: false,
    });

    try {
      await expect(handleSetupCommand()).rejects.toThrow(
        'Setup subcommand is required in non-interactive mode'
      );
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', {
        configurable: true,
        value: originalIsTty,
      });
    }
  });

  it('configures Firecrawl as the default web provider', async () => {
    await handleSetupCommand('defaults', { yes: true });

    expect(configureWebDefaults).toHaveBeenCalledWith({
      undo: false,
      agents: undefined,
    });
  });

  it('undoes default web provider config', async () => {
    await handleSetupCommand('defaults', { undo: true, yes: true });

    expect(configureWebDefaults).toHaveBeenCalledWith({
      undo: true,
      agents: undefined,
    });
  });

  it('limits defaults config to a single agent', async () => {
    await handleSetupCommand('defaults', { undo: true, agent: 'codex' });

    expect(configureWebDefaults).toHaveBeenCalledWith({
      undo: true,
      agents: ['Codex'],
    });
  });

  it('installs MCP with Firecrawl credentials in the server environment', async () => {
    vi.mocked(getConfig).mockReturnValue({
      apiKey: 'fc-test-key',
      apiUrl: 'https://api.example.com',
    });

    await handleSetupCommand('mcp', {
      agent: 'claude-code',
      global: true,
      yes: true,
    });

    expect(execSync).toHaveBeenCalledWith(
      'npx -y add-mcp "npx -y firecrawl-mcp" --name firecrawl --env "FIRECRAWL_API_KEY=fc-test-key" --env "FIRECRAWL_API_URL=https://api.example.com" --global --agent claude-code --yes',
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({
          FIRECRAWL_API_KEY: 'fc-test-key',
        }),
      })
    );
  });

  it('strips inherited npm_* env vars before nested npx calls', async () => {
    // Reproduces the bug where running this CLI under `npx -y firecrawl-cli@VERSION`
    // leaks npm_command/npm_lifecycle_event/npm_execpath into nested
    // `npx -y skills add` calls and causes the second iteration to silently
    // not run. Without stripping, only the first repo gets installed.
    const restore = {
      npm_command: process.env.npm_command,
      npm_lifecycle_event: process.env.npm_lifecycle_event,
      npm_execpath: process.env.npm_execpath,
      INIT_CWD: process.env.INIT_CWD,
    };
    process.env.npm_command = 'exec';
    process.env.npm_lifecycle_event = 'npx';
    process.env.npm_execpath = '/fake/npm-cli.js';
    process.env.INIT_CWD = '/fake/init-cwd';

    try {
      await handleSetupCommand('skills', {});

      const allCalls = (
        execSync as unknown as {
          mock: { calls: [string, { env?: NodeJS.ProcessEnv }][] };
        }
      ).mock.calls;
      const installCalls = allCalls.filter(([cmd]) =>
        cmd.includes('skills add')
      );
      expect(installCalls.length).toBe(2);
      for (const [, opts] of installCalls) {
        expect(opts.env).toBeDefined();
        expect(opts.env!.npm_command).toBeUndefined();
        expect(opts.env!.npm_lifecycle_event).toBeUndefined();
        expect(opts.env!.npm_execpath).toBeUndefined();
        expect(opts.env!.INIT_CWD).toBeUndefined();
      }
    } finally {
      for (const [k, v] of Object.entries(restore)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
