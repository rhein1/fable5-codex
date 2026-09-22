#!/usr/bin/env node
// Read-only bridge to the EXISTING recipe selector; no model or Codex invocation.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadCatalog, searchRecipes } from './development-prompts.mjs';

export function baseline(task, catalog = loadCatalog()) {
  // The old selector ranks recipes, not playbooks. Do not invent numeric scores.
  // Map its first ranked recipe only; a recipe shared by playbooks is ambiguous.
  const first = searchRecipes(catalog, { query: task, limit: 1 })[0];
  const candidates = first
    ? catalog.playbooks.filter((p) => p.steps.includes(first.id)).map((p) => p.id).sort()
    : [];
  return {
    playbook: candidates.length === 1 ? candidates[0] : null,
    recipe: first?.id ?? null,
    candidates,
    reason: !first ? 'no_matching_recipe' : candidates.length === 1 ? 'unique_recipe_membership' : 'ambiguous_recipe_membership',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 32768) throw new Error('input_too_large');
      chunks.push(chunk);
    }
    const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!request || Object.keys(request).join(',') !== 'task' || typeof request.task !== 'string'
        || !request.task.trim() || Buffer.byteLength(request.task) > 4096) throw new Error('invalid_task');
    process.stdout.write(`${JSON.stringify(baseline(request.task))}\n`);
  } catch {
    process.stderr.write('baseline_unavailable\n');
    process.exitCode = 1;
  }
}
