import { afterEach, describe, expect, it, vi } from 'vitest';
import { replaceSheetSettingsSection } from './googleSettings';
import { QUICK_NOTE_HEADERS } from './quickNoteSheet';

const ACCESS_TOKEN = 'access-token';
const SHEET_ID = 'sheet-id';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(fetchMock: ReturnType<typeof vi.fn>, index: number): string {
  return String(fetchMock.mock.calls[index]?.[0]);
}

describe('Google Quick Note color synchronization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('upgrades a 13-column tab and reads colored Quick Notes back through column N', async () => {
    const quickNotes = {
      'expense:Food': [
        {
          id: 'coffee',
          icon: 'Coffee',
          label: 'Coffee',
          color: '#123456',
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          sheets: [
            {
              properties: {
                sheetId: 13,
                title: 'Quick Note',
                sheetType: 'GRID',
                gridProperties: { rowCount: 20, columnCount: 13 },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            [...QUICK_NOTE_HEADERS],
            [
              'category',
              'expense',
              'Food',
              'note',
              '1',
              'coffee',
              'Coffee',
              'Coffee',
              '',
              '',
              '',
              '',
              '',
              '#123456',
            ],
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await replaceSheetSettingsSection(
      ACCESS_TOKEN,
      SHEET_ID,
      'quickNotes',
      quickNotes,
    );

    expect(result).toEqual({ status: 'ok', present: true, value: quickNotes });
    expect(requestUrl(fetchMock, 2)).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/'Quick%20Note'!A1%3AN",
    );

    const batchBody = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body),
    ) as {
      requests: Array<{
        appendDimension?: {
          sheetId?: number;
          dimension?: string;
          length?: number;
        };
        updateCells?: { range?: { endColumnIndex?: number } };
      }>;
    };
    expect(batchBody.requests).toContainEqual({
      appendDimension: {
        sheetId: 13,
        dimension: 'COLUMNS',
        length: 1,
      },
    });
    expect(
      batchBody.requests.find(({ updateCells }) => updateCells)?.updateCells
        ?.range?.endColumnIndex,
    ).toBe(QUICK_NOTE_HEADERS.length);
  });
});
