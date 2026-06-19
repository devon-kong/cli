import { spawnSync } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleLaunchCommand } from '../../commands/launch';
import { installMcp } from '../../commands/setup';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../commands/setup', () => ({
  installMcp: vi.fn(async () => undefined),
}));

describe('handleLaunchCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as never);
  });

  it('installs Claude Code MCP without launching in install mode', async () => {
    await handleLaunchCommand('claude', { install: true });

    expect(installMcp).toHaveBeenCalledWith({
      agent: 'claude-code',
      global: true,
      yes: true,
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('supports setup and config as install-mode aliases', async () => {
    await handleLaunchCommand('claude', { setup: true });
    await handleLaunchCommand('codex', { config: true });

    expect(installMcp).toHaveBeenCalledTimes(2);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('configures VS Code MCP and launches code with the current workspace', async () => {
    await handleLaunchCommand('code');

    expect(installMcp).toHaveBeenCalledWith({
      agent: 'vscode',
      global: true,
      yes: true,
    });
    expect(spawnSync).toHaveBeenNthCalledWith(1, 'code', ['--version'], {
      stdio: 'ignore',
    });
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'code',
      ['.'],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('passes extra arguments through to Codex', async () => {
    await handleLaunchCommand('codex', {}, ['--sandbox', 'workspace-write']);

    expect(installMcp).toHaveBeenCalledWith({
      agent: 'codex',
      global: true,
      yes: true,
    });
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'codex',
      ['--sandbox', 'workspace-write'],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('can launch without touching MCP', async () => {
    await handleLaunchCommand('opencode', { skipMcp: true });

    expect(installMcp).not.toHaveBeenCalled();
    expect(spawnSync).toHaveBeenNthCalledWith(1, 'opencode', ['--version'], {
      stdio: 'ignore',
    });
  });

  it('requires an explicit target in non-interactive mode', async () => {
    const originalIsTty = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: false,
    });

    try {
      await expect(handleLaunchCommand()).rejects.toThrow(
        'Launch target is required in non-interactive mode'
      );
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', {
        configurable: true,
        value: originalIsTty,
      });
    }
  });
});
