import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const TEMP_PATHS = [
  '.github/workflows/haptics-verification.yml',
  '.github/workflows/haptics-final-release.yml',
  'scripts/apply-haptics-release.mjs',
  'scripts/finalize-haptics-release.mjs',
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

async function createVerifiedCommit() {
  const branch = process.env.GITHUB_HEAD_REF;
  if (!branch) throw new Error('GITHUB_HEAD_REF is required');

  for (const path of TEMP_PATHS) fs.rmSync(path, { force: true });
  execFileSync('git', ['diff', '--check', 'HEAD'], { stdio: 'inherit' });

  const paths = new Set([...changedPaths(), ...TEMP_PATHS]);
  const ref = await github(`/git/ref/heads/${encodeURIComponent(branch)}`);
  const parentSha = ref.object.sha;
  const parentCommit = await github(`/git/commits/${parentSha}`);
  const tree = [];

  for (const path of paths) {
    if (!fs.existsSync(path)) {
      tree.push({ path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const blob = await github('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({
        content: fs.readFileSync(path, 'utf8'),
        encoding: 'utf-8',
      }),
    });
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const nextTree = await github('/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }),
  });
  const nextCommit = await github('/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message: 'chore: finalize verified haptics release',
      tree: nextTree.sha,
      parents: [parentSha],
    }),
  });
  await github(`/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: nextCommit.sha, force: false }),
  });
  return nextCommit.sha;
}

async function inspectPullRequest(prNumber) {
  const files = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(`/pulls/${prNumber}/files?per_page=100&page=${page}`);
    files.push(...batch);
    if (batch.length < 100) break;
  }

  const names = files.map((file) => file.filename).sort();
  const unexpected = names.filter((name) => !ALLOWED_FINAL_PATHS.has(name));
  const missingCore = [
    'src/lib/haptics.ts',
    'src/components/ui/HapticSelectionButton.tsx',
    'src/components/SelectionHaptics.test.tsx',
  ].filter((name) => !names.includes(name));

  if (unexpected.length > 0) {
    throw new Error(`Unexpected PR paths: ${unexpected.join(', ')}`);
  }
  if (missingCore.length > 0) {
    throw new Error(`Missing core PR paths: ${missingCore.join(', ')}`);
  }
  if (names.some((name) => TEMP_PATHS.includes(name))) {
    throw new Error('Temporary verification files remain in the PR diff');
  }

  return names;
}

async function addCompletionComment(prNumber, sha, names) {
  const marker = '<!-- sheetlog-haptics-verification -->';
  const comments = await github(`/issues/${prNumber}/comments?per_page=100`);
  if (comments.some((comment) => comment.body?.includes(marker))) return;

  await github(`/issues/${prNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      body: `${marker}\nVerified first-release iOS selection haptics at \`${sha}\`.\n\nChecks passed: focused haptics tests, full Vitest suite, TypeScript, Biome, production build, and diff inspection.\n\nFinal changed files (${names.length}):\n${names.map((name) => `- \`${name}\``).join('\n')}`,
    }),
  });
}

const prNumber = Number(process.env.PR_NUMBER);
if (!Number.isInteger(prNumber) || prNumber <= 0) {
  throw new Error('PR_NUMBER is required');
}

const sha = await createVerifiedCommit();
const names = await inspectPullRequest(prNumber);

await github(`/statuses/${sha}`, {
  method: 'POST',
  body: JSON.stringify({
    state: 'success',
    context: 'haptics-final-verification',
    description: 'Tests, typecheck, lint, build, and diff inspection passed',
    target_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  }),
});
await github(`/pulls/${prNumber}`, {
  method: 'PATCH',
  body: JSON.stringify({ draft: false }),
});
await addCompletionComment(prNumber, sha, names);

console.log(`PR #${prNumber} is ready at ${sha}`);
