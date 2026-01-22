export type SheetlogAppId = 'money' | 'weight' | 'food' | 'bowel';

export type SheetlogAppStatus = 'available' | 'coming-soon';

export type SheetlogAppDefinition = {
  id: SheetlogAppId;
  name: string;
  description: string;
  status: SheetlogAppStatus;
};

export const SHEETLOG_APPS: SheetlogAppDefinition[] = [
  {
    id: 'money',
    name: 'Money',
    description: 'Log expenses, income, and transfers to your Google Sheet.',
    status: 'available',
  },
  {
    id: 'weight',
    name: 'Weight',
    description: 'Quick weigh-ins into a sheet (coming soon).',
    status: 'coming-soon',
  },
  {
    id: 'food',
    name: 'Food',
    description: 'Meals, calories, and notes to a sheet (coming soon).',
    status: 'coming-soon',
  },
  {
    id: 'bowel',
    name: 'Bowel movement',
    description: 'Fast symptom-style logs to a sheet (coming soon).',
    status: 'coming-soon',
  },
];

export const DEFAULT_SHEETLOG_APP_ID: SheetlogAppId = 'money';

export function isSheetlogAppId(value: unknown): value is SheetlogAppId {
  return typeof value === 'string' && SHEETLOG_APPS.some((app) => app.id === value);
}

export function getSheetlogApp(appId: SheetlogAppId): SheetlogAppDefinition {
  const match = SHEETLOG_APPS.find((app) => app.id === appId);
  if (!match) {
    return (
      SHEETLOG_APPS[0] ?? {
        id: DEFAULT_SHEETLOG_APP_ID,
        name: 'Money',
        description: 'Log to Google Sheets.',
        status: 'available',
      }
    );
  }
  return match;
}
