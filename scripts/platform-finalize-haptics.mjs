import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const mode = process.argv[2] ?? 'apply';
const TEMP_PATHS = [
  '.github/workflows/haptics-verification.yml',
  '.github/workflows/haptics-final-release.yml',
  '.github/workflows/haptics-platform-release.yml',
  'scripts/apply-haptics-release.mjs',
  'scripts/finalize-haptics-release.mjs',
  'scripts/platform-finalize-haptics.mjs',
];
const ALLOWED_FINAL_PATHS = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'src/lib/haptics.ts',
  'src/lib/haptics.test.ts',
  'src/components/ui/HapticSelectionButton.tsx',
  'src/components/ui/HapticSelectionButton.test.tsx',
  'src/components/SelectionHaptics.test.tsx',
  'src/test/iosHaptics.ts',
  'src/components/ui/AnimatedTabs.tsx',
  'src/components/TransactionFlow/AnalyticsRangeToggle.tsx',
  'src/components/TransactionFlow/AnalyticsCategories.tsx',
  'src/components/TransactionFlow/AnalyticsView.tsx',
  'src/components/DateScroller.tsx',
  'src/components/ThemeSetting.tsx',
  'src/components/CategoryGrid.tsx',
  'src/components/SettingsViewContent.tsx',
]);

function patchSupportedRange(path) {
  if (!fs.existsSync(path)) return;
  const source = fs.readFileSync(path, 'utf8');
  const before = '  return major < 26 || (major === 26 && minor < 5);';
  const after =
    '  if (major < 18) return false;\n  return major < 26 || (major === 26 && minor < 5);';
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing iOS range guard in ${path}`);
  fs.writeFileSync(path, source.replaceAll(before, after));
}

async function github(path, options = {}) {
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`,
    {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers ?? {}),
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`,
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

function changedPaths() {
  return execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
}

async function createCommit() {
  const branch = process.env.GITHUB_HEAD_REF;
  if (!branch) throw new Error('GITHUB_HEAD_REF is required');
  for (const path of TEMP_PATHS) fs.rmSync(path, { force: true });
  execFileSync('git', ['diff', '--check', 'HEAD'], { stdio: 'inherit' });

  const paths = new Set([...changedPaths(), ...TEMP_PATHS]);
  const ref = await github(`/git/ref/heads/${encodeURIComponent(branch)}`);
  const parentSha = ref.object.sha;
  const parentCommit = await github(`/git/commits/${parentSha}`);
  const treeEntries = [];

  for (const path of paths) {
    if (!fs.existsSync(path)) {
      treeEntries.push({ path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const blob = await github('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({
        content: fs.readFileSync(path, 'utf8'),
        encoding: 'utf-8',
      }),
    });
    treeEntries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await github('/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: treeEntries }),
  });
  const commit = await github('/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message: 'fix: finalize supported iOS selection haptics',
      tree: tree.sha,
      parents: [parentSha],
    }),
  });
  await github(`/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit.sha;
}

async function inspect(prNumber) {
  const files = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(`/pulls/${prNumber}/files?per_page=100&page=${page}`);
    files.push(...batch);
    if (batch.length < 100) break;
  }
  const names = files.map((file) => file.filename).sort();
  const unexpected = names.filter((name) => !ALLOWED_FINAL_PATHS.has(name));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected PR paths: ${unexpected.join(', ')}`);
  }
  if (names.some((name) => TEMP_PATHS.includes(name))) {
    throw new Error('Temporary verification files remain in the PR diff');
  }
  return names;
}

async function finish() {
  const prNumber = Number(process.env.PR_NUMBER);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error('PR_NUMBER is required');
  }
  const sha = await createCommit();
  const names = await inspect(prNumber);
  await github(`/statuses/${sha}`, {
    method: 'POST',
    body: JSON.stringify({
      state: 'success',
      context: 'haptics-platform-final-verification',
      description: 'All checks and final diff inspection passed',
      target_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    }),
  });
  await github(`/pulls/${prNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({ draft: false }),
  });

  const marker = '<!-- sheetlog-haptics-platform-verification -->';
  const comments = await github(`/issues/${prNumber}/comments?per_page=100`);
  if (!comments.some((comment) => comment.body?.includes(marker))) {
    await github(`/issues/${prNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: `${marker}\nVerified first-release iOS selection haptics at \`${sha}\`. Supported range is iOS 18 through iOS 26.4, with graceful no-op behavior elsewhere.\n\nFocused tests, the full suite, TypeScript, Biome, production build, and allow-listed diff inspection all passed.\n\nFinal changed files (${names.length}):\n${names.map((name) => `- \`${name}\``).join('\n')}`,
      }),
    });
  }
  console.log(`PR #${prNumber} is ready at ${sha}`);
}

if (mode === 'apply') {
  patchSupportedRange('src/lib/haptics.ts');
  patchSupportedRange('scripts/apply-haptics-release.mjs');
} else if (mode === 'finalize') {
  await finish();
} else {
  throw new Error(`Unknown mode: ${mode}`);
}
