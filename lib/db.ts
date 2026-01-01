import Dexie, { type Table } from 'dexie';
import type { SettingRecord, TransactionRecord } from './types';

class SheetLogDB extends Dexie {
  transactions!: Table<TransactionRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super('SheetLogDB');
    this.version(1).stores({
      transactions: 'id, status, createdAt',
      settings: 'key'
    });
  }
}

export const db = new SheetLogDB();
