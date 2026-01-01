import { ensureSheet, getSheetTabId } from "./google";

export async function ensureSheetReady(
  accessToken: string,
  folderId?: string | null
): Promise<{ sheetId: string; sheetTabId: number | null }> {
  const sheetId = await ensureSheet(accessToken, folderId);
  const sheetTabId = await getSheetTabId(accessToken, sheetId);
  return { sheetId, sheetTabId };
}
