// Load the assistant instructions from their Markdown source instead of
// maintaining a second, escaped copy in JavaScript.

const QUEST_URL_PLACEHOLDER = '{{QUEST_URL}}';
const SOURCE_TITLE_PLACEHOLDER = '{{SOURCE_TITLE}}';
const WIKITEXT_SOURCE_PLACEHOLDER = '{{WIKITEXT_SOURCE}}';
const PROMPT_SOURCE_URL = new URL(
  '../prompts/tibia-wiki-quest-coordinate-agent-system-prompt.md',
  import.meta.url,
);

let promptTemplatePromise;

/** Fetch and cache the prompt source used by every assistant action. */
export function loadQuestPromptTemplate() {
  if (!promptTemplatePromise) {
    promptTemplatePromise = fetch(PROMPT_SOURCE_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load the quest prompt (HTTP ${response.status}).`);
        }
        return response.text();
      })
      .then((template) => {
        const missing = [
          QUEST_URL_PLACEHOLDER,
          SOURCE_TITLE_PLACEHOLDER,
          WIKITEXT_SOURCE_PLACEHOLDER,
        ].filter((placeholder) => !template.includes(placeholder));
        if (missing.length > 0) {
          throw new Error(`The quest prompt is missing placeholders: ${missing.join(', ')}`);
        }
        return template.trim();
      });
  }
  return promptTemplatePromise;
}

/** Build the exact Markdown prompt with the already-fetched wiki source. */
export async function buildQuestPrompt(url, { sourceTitle, wikitext } = {}) {
  const template = await loadQuestPromptTemplate();
  const questUrl = String(url ?? '').trim();
  const title = String(sourceTitle ?? '').trim();
  const source = String(wikitext ?? '').trim();
  if (!title || !source) throw new Error('missingWikiSource');
  const replacements = new Map([
    [QUEST_URL_PLACEHOLDER, questUrl],
    [SOURCE_TITLE_PLACEHOLDER, title],
    [WIKITEXT_SOURCE_PLACEHOLDER, source],
  ]);
  return template.replace(
    /\{\{(?:QUEST_URL|SOURCE_TITLE|WIKITEXT_SOURCE)\}\}/g,
    (placeholder) => replacements.get(placeholder),
  );
}

// Begin loading before a user clicks an assistant action. Besides making the
// buttons feel immediate, this keeps the subsequent assistant tab opening
// inside the browser's user-activation window.
void loadQuestPromptTemplate().catch(() => {});
