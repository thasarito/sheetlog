import { readFile } from 'node:fs/promises';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const headSha = process.env.HEAD_SHA;
const branch = process.env.HEAD_BRANCH;

if (!repository || !token || !headSha || !branch) {
  throw new Error('Missing GitHub repository, token, branch, or head SHA.');
}

const [owner, repo] = repository.split('/');
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function request(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} failed (${response.status}): ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

function encodedRefPath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

const refPath = `/git/ref/heads/${encodedRefPath(branch)}`;
const branchRef = await request(refPath);
if (branchRef.object.sha !== headSha) {
  throw new Error(
    `Branch moved during verification: expected ${headSha}, found ${branchRef.object.sha}.`,
  );
}

const headCommit = await request(`/git/commits/${headSha}`);
const changedPaths = [
  'src/components/SettingsViewContent.tsx',
  'src/components/SettingsView.test.tsx',
  'e2e/home-carousel.spec.ts',
];

const tree = [];
for (const path of changedPaths) {
  const content = await readFile(path, 'utf8');
  const blob = await request('/git/blobs', {
    method: 'POST',
    body: JSON.stringify({ content, encoding: 'utf-8' }),
  });
  tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
}

for (const path of [
  '.github/workflows/agent-bootstrap.yml',
  '.github/agent/settings-scroll.patch',
  '.github/agent/commit-settings-scroll.mjs',
]) {
  tree.push({ path, mode: '100644', type: 'blob', sha: null });
}

const nextTree = await request('/git/trees', {
  method: 'POST',
  body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
});
const commit = await request('/git/commits', {
  method: 'POST',
  body: JSON.stringify({
    message: 'fix: keep Settings section scrolling contained',
    tree: nextTree.sha,
    parents: [headSha],
  }),
});
await request(`/git/refs/heads/${encodedRefPath(branch)}`, {
  method: 'PATCH',
  body: JSON.stringify({ sha: commit.sha, force: false }),
});

console.log(`Committed verified Settings scroll fix as ${commit.sha}.`);
