import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Could not find ${label}`);
  return source.replace(before, after);
}

const testPath = 'src/components/SettingsView.test.tsx';
let test = readFileSync(testPath, 'utf8');

test = replaceOnce(
  test,
  `  SettingsItemEditorDrawer: ({\n    open,\n    target,\n    onDismiss,\n  }: {\n    open: boolean;\n    target: { name: string; kind: string };\n    onDismiss: () => void;\n  }) =>`,
  `  SettingsItemEditorDrawer: ({\n    open,\n    target,\n    onCommitName,\n    onDismiss,\n  }: {\n    open: boolean;\n    target: { name: string; kind: string };\n    onCommitName: (name: string) => Promise<void>;\n    onDismiss: () => void;\n  }) =>`,
  'Settings item editor mock signature',
);

test = replaceOnce(
  test,
  `        <span>{target.name || \`New \${target.kind}\`}</span>\n        <button type="button" onClick={onDismiss}>`,
  `        <span>{target.name || \`New \${target.kind}\`}</span>\n        <button\n          type="button"\n          onClick={() => void onCommitName('Travel Wallet').catch(() => undefined)}\n        >\n          Rename mock item\n        </button>\n        <button type="button" onClick={onDismiss}>`,
  'mock rename action',
);

test = replaceOnce(
  test,
  `    mocks.onToast.mockReset();\n    vi.mocked(analyticsSync.resync).mockReset();`,
  `    mocks.onToast.mockReset();\n    mocks.quickNotesConfig = {\n      'default:expense': [\n        { id: 'coffee', icon: 'Coffee', label: 'Coffee', note: 'Morning coffee' },\n      ],\n    };\n    vi.mocked(analyticsSync.resync).mockReset();`,
  'Quick Notes test reset',
);

const regressionTests = `\n  it('blocks a referenced account rename until legacy Quick Notes are imported', async () => {\n    const user = userEvent.setup();\n    mocks.sync.hasLegacyQuickNotesMigrationPrompt = true;\n    mocks.quickNotesConfig = {\n      'default:expense': [\n        {\n          id: 'wallet-note',\n          icon: 'Wallet',\n          label: 'Wallet note',\n          account: 'Wallet',\n        },\n      ],\n    };\n    renderView();\n\n    await user.click(screen.getByRole('button', { name: /Accounts/ }));\n    await user.click(screen.getByRole('button', { name: 'Wallet' }));\n    await user.click(screen.getByRole('button', { name: 'Rename mock item' }));\n\n    await waitFor(() =>\n      expect(mocks.onToast).toHaveBeenCalledWith(\n        'Import legacy Quick Notes before renaming an item they reference.',\n      ),\n    );\n    expect(mocks.account.update.mutateAsync).not.toHaveBeenCalled();\n    expect(mocks.quickNotes.replace.mutateAsync).not.toHaveBeenCalled();\n  });\n\n  it('rolls back an account rename when Quick Note reference persistence fails', async () => {\n    const user = userEvent.setup();\n    const originalConfig: QuickNotesConfig = {\n      'default:expense': [\n        {\n          id: 'wallet-note',\n          icon: 'Wallet',\n          label: 'Wallet note',\n          account: 'Wallet',\n        },\n      ],\n    };\n    mocks.quickNotesConfig = originalConfig;\n    mocks.quickNotes.replace.mutateAsync\n      .mockRejectedValueOnce(new Error('Quick Notes write failed'))\n      .mockResolvedValueOnce(undefined);\n    renderView();\n\n    await user.click(screen.getByRole('button', { name: /Accounts/ }));\n    await user.click(screen.getByRole('button', { name: 'Wallet' }));\n    await user.click(screen.getByRole('button', { name: 'Rename mock item' }));\n\n    await waitFor(() =>\n      expect(mocks.account.update.mutateAsync).toHaveBeenCalledTimes(2),\n    );\n    expect(mocks.account.update.mutateAsync).toHaveBeenNthCalledWith(1, {\n      previousName: 'Wallet',\n      name: 'Travel Wallet',\n    });\n    expect(mocks.account.update.mutateAsync).toHaveBeenNthCalledWith(2, {\n      previousName: 'Travel Wallet',\n      name: 'Wallet',\n    });\n    expect(mocks.quickNotes.replace.mutateAsync).toHaveBeenNthCalledWith(1, {\n      config: {\n        'default:expense': [\n          expect.objectContaining({ account: 'Travel Wallet' }),\n        ],\n      },\n    });\n    expect(mocks.quickNotes.replace.mutateAsync).toHaveBeenNthCalledWith(2, {\n      config: originalConfig,\n    });\n  });\n`;

if (!test.includes("blocks a referenced account rename until legacy Quick Notes are imported")) {
  test = test.replace(
    `\n  it('keeps technical sync details collapsed until Data & sync is opened', async () => {`,
    `${regressionTests}\n  it('keeps technical sync details collapsed until Data & sync is opened', async () => {`,
  );
}

writeFileSync(testPath, test);
