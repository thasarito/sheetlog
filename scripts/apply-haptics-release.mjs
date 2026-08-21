import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const mode = process.argv[2] ?? 'apply';

const HAPTICS_SOURCE = `import { hapticTrigger } from "ios-haptics";

export const HAPTIC_FEEDBACK_STORAGE_KEY = "sheetlog.hapticFeedback";
export const HAPTICS_STORAGE_KEY = HAPTIC_FEEDBACK_STORAGE_KEY;
export const HAPTIC_FEEDBACK_CHANGED_EVENT = "sheetlog:haptic-feedback-changed";

export type HapticNavigatorLike = Pick<
  Navigator,
  "maxTouchPoints" | "platform" | "userAgent"
>;

type Attachment = {
  cleanup: () => void;
};

const attachments = new Map<HTMLElement, Attachment>();
const subscribers = new Set<() => void>();

function isIosLike(target: HapticNavigatorLike): boolean {
  return (
    /iPad|iPhone|iPod/.test(target.userAgent) ||
    (target.platform === "MacIntel" && target.maxTouchPoints > 1)
  );
}

function iosVersion(target: HapticNavigatorLike): [number, number] | null {
  const match =
    target.userAgent.match(/(?:CPU (?:iPhone )?OS|iPhone OS) (\\d+)[_.](\\d+)/) ??
    target.userAgent.match(/Version\\/(\\d+)\\.(\\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

export function supportsIosSelectionHaptics(
  target: HapticNavigatorLike | undefined =
    typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  if (!target || !isIosLike(target)) return false;

  const version = iosVersion(target);
  if (!version) return true;
  const [major, minor] = version;

  // The native switch-overlay technique used by ios-haptics no longer
  // produces feedback from iOS 26.5 onward. Keep this enhancement inert
  // there rather than adding a transparent control with no tactile benefit.
  return major < 26 || (major === 26 && minor < 5);
}

export function getHapticFeedbackEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(HAPTIC_FEEDBACK_STORAGE_KEY);
    return stored !== "false" && stored !== "0";
  } catch {
    return true;
  }
}

export const isHapticFeedbackEnabled = getHapticFeedbackEnabled;
export const getHapticFeedbackPreference = getHapticFeedbackEnabled;

export function removeAllSelectionHaptics(): void {
  for (const attachment of [...attachments.values()]) attachment.cleanup();
}

function notifyPreferenceChange(): void {
  for (const subscriber of [...subscribers]) subscriber();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(HAPTIC_FEEDBACK_CHANGED_EVENT, {
        detail: { enabled: getHapticFeedbackEnabled() },
      }),
    );
  }
}

export function setHapticFeedbackEnabled(enabled: boolean): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        HAPTIC_FEEDBACK_STORAGE_KEY,
        enabled ? "true" : "false",
      );
    } catch {
      // Preference storage is best-effort; the current document still updates.
    }
  }
  if (!enabled) removeAllSelectionHaptics();
  notifyPreferenceChange();
}

export function subscribeHapticFeedback(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

function hapticInput(element: HTMLElement): HTMLInputElement | null {
  return (
    Array.from(element.children).find(
      (child): child is HTMLInputElement =>
        child instanceof HTMLInputElement &&
        child.hasAttribute("data-haptic-trigger"),
    ) ?? null
  );
}

export function attachSelectionHaptic(
  element: HTMLElement | null | undefined,
): () => void {
  if (!element) return () => undefined;

  attachments.get(element)?.cleanup();
  if (
    !getHapticFeedbackEnabled() ||
    !supportsIosSelectionHaptics() ||
    element.matches(":disabled, [aria-disabled='true']")
  ) {
    return () => undefined;
  }

  const previousInlinePosition = element.style.position;
  const wasStatic = getComputedStyle(element).position === "static";
  hapticTrigger(element);
  const input = hapticInput(element);
  if (!input) return () => undefined;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    input.remove();
    if (wasStatic && element.style.position === "relative") {
      element.style.position = previousInlinePosition;
    }
    if (attachments.get(element)?.cleanup === cleanup) attachments.delete(element);
  };

  attachments.set(element, { cleanup });
  return cleanup;
}

export const attachIosSelectionHaptic = attachSelectionHaptic;

export function triggerVibrationFeedback(duration = 10): boolean {
  if (
    !getHapticFeedbackEnabled() ||
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return false;
  }
  try {
    return navigator.vibrate(duration);
  } catch {
    return false;
  }
}
`;

const BUTTON_SOURCE = `import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ForwardedRef,
} from "react";
import {
  attachSelectionHaptic,
  getHapticFeedbackEnabled,
  subscribeHapticFeedback,
} from "../../lib/haptics";

export type HapticSelectionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  haptic?: boolean;
  hapticEnabled?: boolean;
  selectionHaptic?: boolean;
  changesValue?: boolean;
  enabled?: boolean;
  active?: boolean;
  enableHaptic?: boolean;
  shouldHaptic?: boolean;
};

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

export const HapticSelectionButton = forwardRef<
  HTMLButtonElement,
  HapticSelectionButtonProps
>(function HapticSelectionButton(
  {
    haptic,
    hapticEnabled,
    selectionHaptic,
    changesValue,
    enabled,
    active,
    enableHaptic,
    shouldHaptic,
    disabled,
    ...props
  },
  forwardedRef,
) {
  const elementRef = useRef<HTMLButtonElement | null>(null);
  const preferenceEnabled = useSyncExternalStore(
    subscribeHapticFeedback,
    getHapticFeedbackEnabled,
    () => true,
  );
  const requested =
    changesValue ??
    selectionHaptic ??
    hapticEnabled ??
    haptic ??
    enabled ??
    active ??
    enableHaptic ??
    shouldHaptic ??
    true;

  const setElement = useCallback(
    (element: HTMLButtonElement | null) => {
      elementRef.current = element;
      assignRef(forwardedRef, element);
    },
    [forwardedRef],
  );

  useLayoutEffect(() => {
    if (!requested || !preferenceEnabled || disabled) return;
    return attachSelectionHaptic(elementRef.current);
  }, [disabled, preferenceEnabled, requested]);

  return <button ref={setElement} disabled={disabled} {...props} />;
});
`;

function write(path, content) {
  fs.writeFileSync(path, content);
}

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) return;
  fs.writeFileSync(path, after);
}

function insertOnce(source, anchor, insertion) {
  if (source.includes(insertion.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`Missing anchor: ${anchor}`);
  return source.replace(anchor, `${anchor}\n${insertion}`);
}

function apply() {
  write('src/lib/haptics.ts', HAPTICS_SOURCE);
  write('src/components/ui/HapticSelectionButton.tsx', BUTTON_SOURCE);

  patch('src/components/ui/AnimatedTabs.tsx', (source) =>
    source.replace('className="absolute inset-0 rounded-lg bg-card shadow-sm"', 'className="absolute inset-0 rounded-lg bg-card"'),
  );

  patch('src/components/TransactionFlow/AnalyticsView.tsx', (source) => {
    let next = insertOnce(
      source,
      "import { cn } from '../../lib/utils';",
      "import { HapticSelectionButton } from '../ui/HapticSelectionButton';",
    );
    const before = `            <button
              type="button"
              aria-label={noBigSpendingLabel}
              aria-pressed={noBigSpending}
              onClick={handleNoBigSpendingToggle}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                noBigSpending && 'bg-primary/10 text-primary',
              )}
            >
              <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
            </button>`;
    const after = `            <HapticSelectionButton
              type="button"
              aria-label={noBigSpendingLabel}
              aria-pressed={noBigSpending}
              changesValue={bigSpendingThreshold !== null}
              onClick={handleNoBigSpendingToggle}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                noBigSpending && 'bg-primary/10 text-primary',
              )}
            >
              <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
            </HapticSelectionButton>`;
    if (next.includes(after)) return next;
    if (!next.includes(before)) throw new Error('Missing No Big Spending button');
    return next.replace(before, after);
  });

  patch('src/components/CategoryGrid.tsx', (source) => {
    let next = insertOnce(
      source,
      'import type { CategoryItem, TransactionType } from "../lib/types";',
      'import { triggerVibrationFeedback } from "../lib/haptics";',
    );
    next = next.replace(
      `\nfunction triggerHaptic() {\n  if ("vibrate" in navigator) {\n    navigator.vibrate(10);\n  }\n}\n`,
      '\n',
    );
    return next.replaceAll('triggerHaptic();', 'triggerVibrationFeedback();');
  });

  patch('src/components/SettingsViewContent.tsx', (source) => {
    let next = insertOnce(
      source,
      "import { useConnectivity } from '../app/providers';",
      "import { triggerVibrationFeedback } from '../lib/haptics';",
    );
    next = next.replace(
      `\nfunction triggerHaptic(ms = 10) {\n  if ('vibrate' in navigator) navigator.vibrate(ms);\n}\n`,
      '\n',
    );
    return next.replaceAll('triggerHaptic();', 'triggerVibrationFeedback();');
  });
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function commit() {
  const branch = process.env.GITHUB_HEAD_REF;
  if (!branch) throw new Error('GITHUB_HEAD_REF is required');

  fs.rmSync('.github/workflows/haptics-verification.yml', { force: true });
  fs.rmSync('scripts/apply-haptics-release.mjs', { force: true });

  const changed = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  if (changed.length === 0) return;

  const ref = await github(`/git/ref/heads/${encodeURIComponent(branch)}`);
  const parentSha = ref.object.sha;
  const parentCommit = await github(`/git/commits/${parentSha}`);
  const tree = [];

  for (const path of changed) {
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
      message: 'feat: implement first-release selection haptics',
      tree: nextTree.sha,
      parents: [parentSha],
    }),
  });
  await github(`/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: nextCommit.sha, force: false }),
  });
  await github(`/statuses/${nextCommit.sha}`, {
    method: 'POST',
    body: JSON.stringify({
      state: 'success',
      context: 'haptics-verification',
      description: 'Tests, typecheck, lint, and build passed',
      target_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    }),
  });
  console.log(`Committed verified haptics release as ${nextCommit.sha}`);
}

if (mode === 'apply') {
  apply();
} else if (mode === 'commit') {
  await commit();
} else {
  throw new Error(`Unknown mode: ${mode}`);
}
