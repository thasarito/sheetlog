#!/usr/bin/env bash
set -euo pipefail

branch="${1:-}"

if [[ -z "${branch}" ]]; then
  echo "Usage: npm run worktree -- <branch-name>" >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
worktrees_dir="$(cd "${repo_root}/.." && pwd)/worktrees"
worktree_path="${worktrees_dir}/${branch}"

mkdir -p "${worktrees_dir}"

if [[ -e "${worktree_path}" ]]; then
  echo "Worktree already exists: ${worktree_path}" >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/${branch}"; then
  git worktree add "${worktree_path}" "${branch}"
else
  git worktree add -b "${branch}" "${worktree_path}"
fi

echo "Created worktree: ${worktree_path}"

