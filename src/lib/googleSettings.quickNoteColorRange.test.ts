import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSheetSettingsConfig, replaceSheetSettingsSection } from './googleSettings';
import { QUICK_NOTE_HEADERS } from './quickNoteSheet';

const ACCESS_TOKEN = 'access-token';
const SHEET_ID = 'sheet-id';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function metadata(...sheets: Array<{ sheetId: number; title: string }>) {
  return {
    sheets: sheets.map(({ sheetId, title }) => ({
      properties: {
        sheetId,
        title,
        sheetType: 'GRID',
        gridProperties: { rowCount: 20, columnCount: 14 },
      },
    })),
  };
}

function requestAt(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  return fetchMock.mock.calls[index] as [string, RequestInit];
}

describe('Google Quick Note color column', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads the Color column from the Quick Note tab', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(metadata({ sheetId: 13, title: 'Quick Note' })),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            [
              'default',
              'expense',
              '',
              'note',
              '1',
              'coffee',
              'Coffee',
              'Coffee run',
              '',
              '120',
              'THB',
              'Cash',
              'Me',
              '#123456',
            ],
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await readSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID);

    expect(result.quickNotes).toEqual({
      status: 'ok',
      present: true,
      value: {
        'default:expense': [
          {
            id: 'coffee',
            icon: 'Coffee',
            label: 'Coffee run',
            amount: '120',
            currency: 'THB',
            account: 'Cash',
            forValue: 'Me',
            color: '#123456',
          },
        ],
      },
    });
    expect(requestAt(fetchMock, 1)[0]).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/'Quick%20Note'!A2%3AN",
    );
  });

  it('verifies a Quick Note replacement through column N', async () => {
    const quickNotes = {
      'default:expense': [
        {
          id: 'coffee',
          icon: 'Coffee',
          label: 'Coffee run',
          color: '#123456',
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(metadata()))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            [...QUICK_NOTE_HEADERS],
            [
              'default',
              'expense',
              '',
              'note',
              '1',
              'coffee',
              'Coffee',
              'Coffee run',
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

    await expect(
      replaceSheetSettingsSection(
        ACCESS_TOKEN,
        SHEET_ID,
        'quickNotes',
        quickNotes,
      ),
    ).resolves.toEqual({ status: 'ok', present: true, value: quickNotes });

    const replacement = JSON.parse(String(requestAt(fetchMock, 1)[1].body));
    expect(replacement.requests[0].addSheet.properties.gridProperties).toMatchObject({
      columnCount: 14,
    });
    expect(replacement.requests[1].updateCells.range.endColumnIndex).toBe(14);
    expect(requestAt(fetchMock, 2)[0]).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/'Quick%20Note'!A1%3AN",
    );
  });
});
