import {
  readSheetSettingsConfig as readRealSheetSettingsConfig,
  replaceSheetSettingsSection as replaceRealSheetSettingsSection,
  type SheetSettingsReadResult,
  type SheetSettingsSectionReadResult,
} from './googleSettings';
import { isGoogleAuthError } from './googleErrors';
import { IS_DEV_MODE } from './mock';
import {
  readSheetSettingsConfig as readMockSheetSettingsConfig,
  replaceSheetSettingsSection as replaceMockSheetSettingsSection,
} from './mock/mockGoogle';
import {
  reconcileSettings as defaultReconcileSettings,
  type SettingsLocalRepository,
  type SettingsReconciliationResult,
  type SettingsRemoteAdapter,
} from './settingsReconciliation';
import { dexieSettingsLocalRepository } from './settingsLocalRepository';
import {
  withSheetMutationLock as defaultWithSheetMutationLock,
  type SheetMutationGuard,
  type SheetMutationScope,
} from './sheetMutationLock';
import type { SettingsSection, SheetSettingsConfig } from './settingsSync';

export interface SettingsRemoteIo {
  readSettings(
    accessToken: string,
    sheetId: string,
  ): Promise<SheetSettingsReadResult>;
  replaceSection<Section extends SettingsSection>(
    accessToken: string,
    sheetId: string,
    section: Section,
    value: SheetSettingsConfig[Section],
  ): Promise<SheetSettingsSectionReadResult<SheetSettingsConfig[Section]>>;
}

export type SettingsReconciliationLock = <Result>(
  scope: SheetMutationScope,
  operation: (guard: SheetMutationGuard) => Promise<Result>,
) => Promise<Result>;

export interface SettingsReconciliationRunnerDependencies {
  reconcile: typeof defaultReconcileSettings;
  local: SettingsLocalRepository;
  remoteIo: SettingsRemoteIo;
  withLock: SettingsReconciliationLock;
}

export interface RunSettingsReconciliationOptions {
  accessToken: string;
  sheetId: string;
  verifiedUserId: string;
  verifiedWorkspaceCount: number;
  importLegacyQuickNotes?: boolean;
  signOut: (expectedAccessToken: string) => void;
}

const selectedRemoteIo: SettingsRemoteIo = IS_DEV_MODE
  ? {
      readSettings: readMockSheetSettingsConfig,
      replaceSection: replaceMockSheetSettingsSection,
    }
  : {
      readSettings: readRealSheetSettingsConfig,
      replaceSection: replaceRealSheetSettingsSection,
    };

export function createSettingsRemoteAdapter(
  accessToken: string,
  guard: SheetMutationGuard,
  remoteIo: SettingsRemoteIo = selectedRemoteIo,
): SettingsRemoteAdapter {
  return {
    readSettings: (sheetId) => remoteIo.readSettings(accessToken, sheetId),
    readSection: async (sheetId, section) => {
      const aggregate = await remoteIo.readSettings(accessToken, sheetId);
      return aggregate[section] as SheetSettingsSectionReadResult<
        SheetSettingsConfig[typeof section]
      >;
    },
    replaceSection: async (sheetId, section, value) => {
      await guard.assertOwnership();
      return remoteIo.replaceSection(
        accessToken,
        sheetId,
        section,
        value,
      );
    },
  };
}

function needsSafeFollowUp(result: SettingsReconciliationResult): boolean {
  if (
    result.status !== 'pending' ||
    result.migrationDecision === 'prompt' ||
    Object.keys(result.errors).length > 0
  ) {
    return false;
  }
  return (
    result.migrationApplied ||
    result.state.dirty.some((section) => result.changed.includes(section))
  );
}

const defaultDependencies: SettingsReconciliationRunnerDependencies = {
  reconcile: defaultReconcileSettings,
  local: dexieSettingsLocalRepository,
  remoteIo: selectedRemoteIo,
  withLock: defaultWithSheetMutationLock,
};

export async function runSettingsReconciliation(
  options: RunSettingsReconciliationOptions,
  dependencies: SettingsReconciliationRunnerDependencies = defaultDependencies,
): Promise<SettingsReconciliationResult> {
  const requestAccessToken = options.accessToken;
  try {
    return await dependencies.withLock(
      { sheetId: options.sheetId, userId: options.verifiedUserId },
      async (guard) => {
        const remote = createSettingsRemoteAdapter(
          requestAccessToken,
          guard,
          dependencies.remoteIo,
        );
        const runPass = () =>
          dependencies.reconcile({
            sheetId: options.sheetId,
            verifiedUserId: options.verifiedUserId,
            verifiedWorkspaceCount: options.verifiedWorkspaceCount,
            importLegacyQuickNotes: options.importLegacyQuickNotes,
            local: dependencies.local,
            remote,
          });
        const first = await runPass();
        return needsSafeFollowUp(first) ? runPass() : first;
      },
    );
  } catch (error) {
    if (isGoogleAuthError(error)) {
      options.signOut(requestAccessToken);
    }
    throw error;
  }
}
