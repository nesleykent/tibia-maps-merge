import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const promptSourceUrl = new URL(
  '../docs/prompts/tibia-wiki-quest-coordinate-agent-system-prompt.md',
  import.meta.url,
);

globalThis.fetch = async (url) => ({
  ok: true,
  text: () => readFile(url, 'utf8'),
});

const { buildQuestPrompt, loadQuestPromptTemplate } = await import(
  '../docs/lib/prompt.js'
);

test('assistant prompt is built from the canonical Markdown file', async () => {
  const questUrl = 'https://www.tibiawiki.com.br/wiki/Threatened_Dreams_Quest?$&';
  const source = (await readFile(promptSourceUrl, 'utf8')).trim();
  const prompt = await buildQuestPrompt(questUrl);

  assert.equal(prompt, source.replaceAll('{{QUEST_URL}}', () => questUrl));
  assert.ok(prompt.includes(`QUEST_URL: ${questUrl}`));
  assert.doesNotMatch(prompt, /\{\{QUEST_URL\}\}/);
});

test('prompt source is cached after its first load', async () => {
  assert.strictEqual(
    await loadQuestPromptTemplate(),
    await loadQuestPromptTemplate(),
  );
});
