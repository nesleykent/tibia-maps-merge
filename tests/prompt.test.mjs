import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseMarkerLines } from '../docs/lib/marker-input.js';

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

test('boss destinations are not mislabeled as the teleport used to reach them', async () => {
  const prompt = await loadQuestPromptTemplate();

  assert.match(prompt, /Sugar Daddy` becomes `Sugar Daddy, sword`/);
  assert.match(prompt, /Timira the Many-Headed` becomes `Timira the Many-Headed, sword`/);
  assert.match(prompt, /Do not use `flag` for a named boss encounter merely because the player teleports there/);
  assert.match(prompt, /provides only one coordinate.*collapse the access and encounter.*boss mark/);
  assert.match(prompt, /even if the prose calls that lone coordinate a teleport or portal/);
  assert.match(prompt, /when separate coordinates exist.*Teleport to Sugar Daddy.*flag.*Sugar Daddy, sword/);
  assert.match(prompt, /Do not add `Teleport`.*unless the coordinate itself is evidenced as that feature/);
});

test('routine vertical transitions use native blank descriptions', async () => {
  const prompt = await loadQuestPromptTemplate();

  assert.match(prompt, /routine staircase.*leave the label empty/);
  assert.match(prompt, /Do not emit redundant generic labels such as `Stairs Up`/);
  assert.match(prompt, /routine unlabeled upward transition is `x, y, z, , up`/);
  assert.match(prompt, /Do not borrow the identity of the next NPC, item, boss, or objective/);

  const parsed = parseMarkerLines([
    '33425, 32145, 6, , up',
    '33430, 32142, 5, , up',
  ].join('\n'));

  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.markers.map(({ description, icon }) => ({ description, icon })), [
    { description: '', icon: 'up' },
    { description: '', icon: 'up' },
  ]);
});
