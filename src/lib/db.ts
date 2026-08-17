import Dexie, { type Table } from 'dexie';
import type {
  CachedTransactionRecord,
  ExchangeRateRecord,
  SettingRecord,
  TransactionHistoryMeta,
  TransactionRecord,
} from './types';

export class SheetLogDB extends Dexie {
  transactions!: Table<TransactionRecord, string>;
  settings!: Table<SettingRecord, string>;
  transactionHistory!: Table<CachedTransactionRecord, [string, string]>;
  transactionHistoryMeta!: Table<TransactionHistoryMeta, string>;
  exchangeRates!: Table<ExchangeRateRecord, string>;

  constructor(name = 'SheetLogDB') {
    super(name);
    this.version(1).stores({
      transactions: 'id, status, createdAt',
      settings: 'key',
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
    this.version(3).stores({
      transactions:
        'id, status, createdAt, sheetId, targetSheetId, targetUserId, [targetSheetId+targetUserId+status]',
      settings: 'key',
      transactionHistory:
        '[sheetId+id], sheetId, sheetRow, cachedAt, [sheetId+date]',
      transactionHistoryMeta: 'sheetId',
    });
    this.version(4).stores({
      transactions:
        'id, status, createdAt, sheetId, targetSheetId, targetUserId, [targetSheetId+targetUserId+status]',
      settings: 'key',
      transactionHistory:
        '[sheetId+id], sheetId, sheetRow, cachedAt, [sheetId+date]',
      transactionHistoryMeta: 'sheetId',
      exchangeRates: 'id, [base+quote+date], date, fetchedAt',
    });
  }
}

export const db = new SheetLogDB();
