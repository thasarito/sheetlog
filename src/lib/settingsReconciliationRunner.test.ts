import { describe, expect, it, vi } from 'vitest';
import { GoogleApiError } from './google';
import type { SheetMutationGuard } from './sheetMutationLock';
import {
  createDefaultSettingsSyncState,
  markSettingsSectionDirty,
} from './settingsSync';
import type {
  SettingsLocalRepository,
  SettingsReconciliationResult,
} from './settingsReconciliation';
import {
  createSettingsRemoteAdapter,
  runSettingsReconciliation,
  type SettingsReconciliationRunnerDependencies,
} from './settingsReconciliationRunner';

function result(
  overrides: Partial<SettingsReconciliationResult> = {},
): SettingsReconciliationResult {
  return {
    state: createDefaultSettingsSyncState('user-a'),
    changed: [],
    pushed: [],
    conflicts: [],
    errors: {},
    migrationDecision: 'none',
    migrationApplied: false,
    status: 'synced',
    ...overrides,
  };
}

function runnerDependencies(
  reconcile: SettingsReconciliationRunnerDependencies['reconcile'],
): SettingsReconciliationRunnerDependencies {
  const guard: SheetMutationGuard = { assertOwnership: vi.fn() };
  return {
    reconcile,
    local: {} as SettingsLocalRepository,
    remoteIo: {
      readSettings: vi.fn(),
      replaceSection: vi.fn(),
    },
    withLock: vi.fn(async (_scope, operation) => operation(guard)),
  };
}

function deferred<Value>() {
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((_resolve, nextReject) => {
    reject = nextReject;
  });
  return { promise, reject };
}

describe('settings reconciliation query runner', () => {
  it('holds one Sheet lock and performs at most one safe sanitation follow-up pass', async () => {
    const pendingState = markSettingsSectionDirty(
      createDefaultSettingsSyncState('user-a'),
      'quickNotes',
    );
    const reconcile = vi
      .fn()
      .mockResolvedValueOnce(
        result({
          state: pendingState,
          changed: ['quickNotes'],
          status: 'pending',
        }),
      )
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result());
    const dependencies = runnerDependencies(reconcile);

    const final = await runSettingsReconciliation(
      {
        accessToken: 'token-a',
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        verifiedWorkspaceCount: 1,
        signOut: vi.fn(),
      },
      dependencies,
    );

    expect(dependencies.withLock).toHaveBeenCalledTimes(1);
    expect(dependencies.withLock).toHaveBeenCalledWith(
      { sheetId: 'sheet-a', userId: 'user-a' },
      expect.any(Function),
    );
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(final.status).toBe('synced');
  });

  it('follows up any safe dirty state left by a concurrent CAS loss', async () => {
    const pendingState = markSettingsSectionDirty(
      createDefaultSettingsSyncState('user-a'),
      'accounts',
    );
    const reconcile = vi
      .fn()
      .mockResolvedValueOnce(
        result({ state: pendingState, changed: [], status: 'pending' }),
      )
      .mockResolvedValueOnce(result());
    const dependencies = runnerDependencies(reconcile);

    await runSettingsReconciliation(
      {
        accessToken: 'token-a',
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        verifiedWorkspaceCount: 1,
        signOut: vi.fn(),
      },
      dependencies,
    );

    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it('preserves first-pass changed, pushed, and conflict facts in the final result', async () => {
    const pendingState = markSettingsSectionDirty(
      createDefaultSettingsSyncState('user-a'),
      'accounts',
    );
    const reconcile = vi
      .fn()
      .mockResolvedValueOnce(
        result({
          state: pendingState,
          changed: ['accounts'],
          pushed: ['accounts'],
          conflicts: ['categories'],
          status: 'pending',
        }),
      )
      .mockResolvedValueOnce(result());

    const final = await runSettingsReconciliation(
      {
        accessToken: 'token-a',
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        verifiedWorkspaceCount: 1,
        signOut: vi.fn(),
      },
      runnerDependencies(reconcile),
    );

    expect(final.status).toBe('synced');
    expect(final.changed).toEqual(['accounts']);
    expect(final.pushed).toEqual(['accounts']);
    expect(final.conflicts).toEqual(['categories']);
  });

  it('preserves a first-pass migration decision and applied fact', async () => {
    const pendingState = markSettingsSectionDirty(
      createDefaultSettingsSyncState('user-a'),
      'quickNotes',
    );
    const reconcile = vi
      .fn()
      .mockResolvedValueOnce(
        result({
          state: pendingState,
          migrationDecision: 'auto-import',
          migrationApplied: true,
          status: 'pending',
        }),
      )
      .mockResolvedValueOnce(result());

    const final = await runSettingsReconciliation(
      {
        accessToken: 'token-a',
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        verifiedWorkspaceCount: 1,
        signOut: vi.fn(),
      },
      runnerDependencies(reconcile),
    );

    expect(final.status).toBe('synced');
    expect(final.migrationDecision).toBe('auto-import');
    expect(final.migrationApplied).toBe(true);
  });

  it('uses a fresh aggregate for targeted reads and asserts lock ownership immediately before replace', async () => {
    const events: string[] = [];
    const aggregate = {
      accounts: { status: 'ok' as const, present: true, value: [] },
      categories: {
        status: 'ok' as const,
        present: false,
        value: { expense: [], income: [], transfer: [] },
      },
      quickNotes: { status: 'ok' as const, present: false, value: {} },
    };
    const remoteIo = {
      readSettings: vi.fn(async () => {
        events.push('read');
        return aggregate;
      }),
      replaceSection: vi.fn(async (...args: unknown[]) => {
        const beforeMutation = args[4] as (() => void | Promise<void>) | undefined;
        await beforeMutation?.();
        events.push('replace');
        return aggregate.accounts;
      }),
    };
    const adapter = createSettingsRemoteAdapter(
      'token-a',
      {
        assertOwnership: vi.fn(async () => {
          events.push('assert');
        }),
      },
      remoteIo as unknown as SettingsReconciliationRunnerDependencies['remoteIo'],
    );

    await expect(adapter.readSection('sheet-a', 'accounts')).resolves.toEqual(
      aggregate.accounts,
    );
    await adapter.replaceSection('sheet-a', 'accounts', []);

    expect(remoteIo.readSettings).toHaveBeenCalledWith('token-a', 'sheet-a');
    expect(events).toEqual(['read', 'assert', 'replace']);
  });

  it('binds an authentication failure to the request token that started reconciliation', async () => {
    const request = deferred<SettingsReconciliationResult>();
    const reconcile = vi.fn(() => request.promise);
    const dependencies = runnerDependencies(reconcile);
    const signOut = vi.fn();
    let currentAccessToken = 'token-a';
    const reconciliation = runSettingsReconciliation(
      {
        accessToken: currentAccessToken,
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        verifiedWorkspaceCount: 1,
        signOut,
      },
      dependencies,
    );

    currentAccessToken = 'token-b';
    request.reject(
      new GoogleApiError({ status: 401, message: 'Token A expired' }),
    );

    await expect(reconciliation).rejects.toThrow('Token A expired');
    expect(currentAccessToken).toBe('token-b');
    expect(signOut).toHaveBeenCalledWith('token-a');
  });

  it.each([
    {
      name: 'migration prompt',
      first: result({
        state: markSettingsSectionDirty(
          createDefaultSettingsSyncState('user-a'),
          'quickNotes',
        ),
        changed: ['quickNotes'],
        migrationDecision: 'prompt',
        status: 'pending',
      }),
    },
    {
      name: 'section error',
      first: result({
        state: {
          ...markSettingsSectionDirty(
            createDefaultSettingsSyncState('user-a'),
            'accounts',
          ),
          errors: { accounts: 'Remote failed' },
        },
        changed: ['accounts'],
        errors: { accounts: 'Remote failed' },
        status: 'error',
      }),
    },
  ])('does not follow up a $name', async ({ first }) => {
    const reconcile = vi.fn().mockResolvedValue(first);
    const dependencies = runnerDependencies(reconcile);

    await runSettingsReconciliation(
      {
        accessToken: 'token-a',
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        verifiedWorkspaceCount: 1,
        signOut: vi.fn(),
      },
      dependencies,
    );

    expect(reconcile).toHaveBeenCalledTimes(1);
  });
});
