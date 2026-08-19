import { readFileSync, writeFileSync } from 'node:fs';

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Could not find ${label}`);
  }
  return source.replace(before, after);
}

const settingsViewPath = 'src/components/SettingsView.tsx';
let settingsView = readFileSync(settingsViewPath, 'utf8');
settingsView = settingsView.replace('  BarChart3,\n', '');
settingsView = settingsView.replace('  AccountItem,\n  CategoryItem,\n', '');
settingsView = settingsView.replace(
  "analyticsSync.status === 'error'",
  "analyticsSync.status === 'incomplete'",
);
settingsView = replaceRequired(
  settingsView,
  `  const toggleSection = useCallback(\n    (id: ControlSectionId) => {\n      let opening = false;\n      setExpandedSections((current) => {\n        const next = new Set(current);\n        if (next.has(id)) next.delete(id);\n        else {\n          next.add(id);\n          opening = true;\n        }\n        return next;\n      });\n      if (opening) positionSection(id);\n    },\n    [positionSection],\n  );`,
  `  const toggleSection = useCallback(\n    (id: ControlSectionId) => {\n      const opening = !expandedSections.has(id);\n      setExpandedSections((current) => {\n        const next = new Set(current);\n        if (next.has(id)) next.delete(id);\n        else next.add(id);\n        return next;\n      });\n      if (opening) positionSection(id);\n    },\n    [expandedSections, positionSection],\n  );`,
  'Control Center section toggle',
);
writeFileSync(settingsViewPath, settingsView);

const helperPath = 'src/lib/settingsControlCenter.ts';
let helper = readFileSync(helperPath, 'utf8');
helper = helper.replace(
  "const account = note.account === previousName ? nextName : note.account;",
  "const account = note.account === previousName ? nextName || undefined : note.account;",
);
helper = helper.replace(
  "const forValue = note.forValue === previousName ? nextName : note.forValue;",
  "const forValue = note.forValue === previousName ? nextName || undefined : note.forValue;",
);
writeFileSync(helperPath, helper);
