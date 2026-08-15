// Load the assistant instructions from their Markdown source instead of
// maintaining a second, escaped copy in JavaScript.

const QUEST_URL_PLACEHOLDER = '{{QUEST_URL}}';
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
        if (!template.includes(QUEST_URL_PLACEHOLDER)) {
          throw new Error('The quest prompt is missing its URL placeholder.');
        }
        return template.trim();
      });
  }
  return promptTemplatePromise;
}

/** Build the exact Markdown prompt with the current article URL inserted. */
export async function buildQuestPrompt(url) {
  const template = await loadQuestPromptTemplate();
  const questUrl = String(url ?? '').trim();
  return template.replaceAll(QUEST_URL_PLACEHOLDER, () => questUrl);
}

// Begin loading before a user clicks an assistant action. Besides making the
// buttons feel immediate, this keeps the subsequent assistant tab opening
// inside the browser's user-activation window.
void loadQuestPromptTemplate().catch(() => {});
