import { spawnSync } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleLaunchCommand } from '../../commands/launch';
import {
  installHermesMcp,
  installMcp,
  installOpenClawMcp,
  installSkillsForAgent,
} from '../../commands/setup';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../commands/setup', () => ({
  installHermesMcp: vi.fn(async () => undefined),
  installMcp: vi.fn(async () => undefined),
  installOpenClawMcp: vi.fn(async () => undefined),
  installSkillsForAgent: vi.fn(async () => undefined),
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
    expect(installSkillsForAgent).toHaveBeenCalledWith('claude-code', {
      global: true,
      yes: true,
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('supports setup and config as install-mode aliases', async () => {
    await handleLaunchCommand('claude', { setup: true });
    await handleLaunchCommand('codex', { config: true });

    expect(installMcp).toHaveBeenCalledTimes(2);
    expect(installSkillsForAgent).toHaveBeenCalledTimes(2);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('configures VS Code MCP and launches code with the current workspace', async () => {
    await handleLaunchCommand('code');

    expect(installMcp).toHaveBeenCalledWith({
      agent: 'vscode',
      global: true,
      yes: true,
    });
    expect(installSkillsForAgent).not.toHaveBeenCalled();
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
    expect(installSkillsForAgent).toHaveBeenCalledWith('codex', {
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

  it('configures Codex MCP and opens Codex App separately from the CLI', async () => {
    await handleLaunchCommand('codex-app');

    expect(installMcp).toHaveBeenCalledWith({
      agent: 'codex',
      global: true,
      yes: true,
    });
    expect(installSkillsForAgent).toHaveBeenCalledWith('codex', {
      global: true,
      yes: true,
    });
    expect(spawnSync).toHaveBeenNthCalledWith(1, 'open', ['--version'], {
      stdio: 'ignore',
    });
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'open',
      ['-b', 'com.openai.codex'],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('does not pass extra arguments to Codex App', async () => {
    await expect(
      handleLaunchCommand('codex-app', {}, ['--foo'])
    ).rejects.toThrow('Codex App does not accept extra arguments');
  });

  it('can launch without touching MCP', async () => {
    await handleLaunchCommand('opencode', { skipMcp: true });

    expect(installMcp).not.toHaveBeenCalled();
    expect(installSkillsForAgent).toHaveBeenCalledWith('opencode', {
      global: true,
      yes: true,
    });
    expect(spawnSync).toHaveBeenNthCalledWith(1, 'opencode', ['--version'], {
      stdio: 'ignore',
    });
  });

  it('can skip skills for a launch target that normally supports them', async () => {
    await handleLaunchCommand('opencode', { skipMcp: true, skipSkills: true });

    expect(installMcp).not.toHaveBeenCalled();
    expect(installSkillsForAgent).not.toHaveBeenCalled();
  });

  it('configures Hermes MCP and skills, then launches Hermes Agent', async () => {
    await handleLaunchCommand('hermes');

    expect(installHermesMcp).toHaveBeenCalled();
    expect(installSkillsForAgent).toHaveBeenCalledWith('hermes-agent', {
      global: true,
      yes: true,
    });
    expect(spawnSync).toHaveBeenNthCalledWith(1, 'hermes', ['--version'], {
      stdio: 'ignore',
    });
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'hermes',
      [],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('configures OpenClaw MCP and skills, then launches the TUI', async () => {
    await handleLaunchCommand('openclaw');

    expect(installOpenClawMcp).toHaveBeenCalled();
    expect(installSkillsForAgent).toHaveBeenCalledWith('openclaw', {
      global: true,
      yes: true,
    });
    expect(spawnSync).toHaveBeenNthCalledWith(1, 'openclaw', ['--version'], {
      stdio: 'ignore',
    });
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'openclaw',
      ['tui'],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('can skip skills for Hermes and OpenClaw launch targets', async () => {
    await handleLaunchCommand('hermes', { skipSkills: true });

    expect(installHermesMcp).toHaveBeenCalled();
    expect(installSkillsForAgent).not.toHaveBeenCalled();
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
