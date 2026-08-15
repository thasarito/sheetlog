import Dexie, { type Table } from 'dexie';
import type { SettingRecord, TransactionRecord } from './types';

export class SheetLogDB extends Dexie {
  transactions!: Table<TransactionRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor(name = 'SheetLogDB') {
    super(name);
    this.version(1).stores({
      transactions: 'id, status, createdAt',
      settings: 'key'
    });
    this.version(2)
      .stores({
        transactions:
          'id, status, createdAt, targetSheetId, targetUserId, [targetSheetId+targetUserId+status]',
        settings: 'key',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<TransactionRecord, string>('transactions')
          .toCollection()
          .modify((record) => {
            // A stored sheetId is authoritative provenance for old synced rows
            // and queued edits of those rows. User identity cannot be inferred.
            if (!record.targetSheetId && record.sheetId) {
              record.targetSheetId = record.sheetId;
            }
          });
      });
  }
}

export const db = new SheetLogDB();
