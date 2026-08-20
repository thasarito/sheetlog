import { describe, expect, it } from 'vitest';
import { QUICK_NOTE_HEADERS } from './quickNoteSheet';
import {
  getCompatibleSettingsHeaderMigration,
  SETTINGS_SHEET_NAMES,
} from './settingsSync';

describe('Quick Note settings header migration', () => {
  it('recognizes the legacy header as a safe append-only Color migration', () => {
    const legacyHeaders = QUICK_NOTE_HEADERS.slice(0, -1);

    expect(
      getCompatibleSettingsHeaderMigration(
        SETTINGS_SHEET_NAMES.quickNotes,
        legacyHeaders,
        QUICK_NOTE_HEADERS,
      ),
    ).toEqual([...QUICK_NOTE_HEADERS]);
  });

  it('does not migrate unrelated or already-current settings headers', () => {
    const legacyHeaders = QUICK_NOTE_HEADERS.slice(0, -1);

    expect(
      getCompatibleSettingsHeaderMigration(
        SETTINGS_SHEET_NAMES.accounts,
        legacyHeaders,
        QUICK_NOTE_HEADERS,
      ),
    ).toBeNull();
    expect(
      getCompatibleSettingsHeaderMigration(
        SETTINGS_SHEET_NAMES.quickNotes,
        QUICK_NOTE_HEADERS,
        QUICK_NOTE_HEADERS,
      ),
    ).toBeNull();
    expect(
      getCompatibleSettingsHeaderMigration(
        SETTINGS_SHEET_NAMES.quickNotes,
        [...legacyHeaders.slice(0, -1), 'Unexpected'],
        QUICK_NOTE_HEADERS,
      ),
    ).toBeNull();
  });
});
