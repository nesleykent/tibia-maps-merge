// Load the assistant instructions from their Markdown source instead of
// maintaining a second, escaped copy in JavaScript.

const QUEST_URL_PLACEHOLDER = '{{QUEST_URL}}';
const SOURCE_TITLE_PLACEHOLDER = '{{SOURCE_TITLE}}';
const WIKITEXT_SOURCE_PLACEHOLDER = '{{WIKITEXT_SOURCE}}';
const WIKI_SITE_PLACEHOLDER = '{{WIKI_SITE}}';
const WIKI_COORDINATE_RULES_PLACEHOLDER = '{{WIKI_COORDINATE_RULES}}';
const PROMPT_CORE_URL = new URL(
  '../prompts/tibia-wiki-quest-coordinate-agent-system-prompt.md',
  import.meta.url,
);
const PROMPT_VARIANTS = {
  tibiawikibr: {
    site: 'TibiaWikiBR (tibiawiki.com.br)',
    rulesUrl: new URL('../prompts/tibiawikibr-coordinate-rules.md', import.meta.url),
  },
  fandom: {
    site: 'Tibia Wiki on Fandom (tibia.fandom.com)',
    rulesUrl: new URL('../prompts/fandom-coordinate-rules.md', import.meta.url),
  },
};

const promptTemplatePromises = new Map();

/** Select the only coordinate decoder relevant to this article URL. */
export function questPromptVariant(input) {
  let hostname;
  try {
    hostname = new URL(String(input ?? '').trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (hostname === 'tibiawiki.com.br' || hostname === 'www.tibiawiki.com.br') return 'tibiawikibr';
  if (hostname === 'tibia.fandom.com') return 'fandom';
  return null;
}

/** Fetch and cache the shared core plus one wiki-specific decoder. */
export function loadQuestPromptTemplate(variant = 'tibiawikibr') {
  const config = PROMPT_VARIANTS[variant];
  if (!config) return Promise.reject(new Error('badUrl'));
  if (!promptTemplatePromises.has(variant)) {
    const read = async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Could not load the quest prompt (HTTP ${response.status}).`);
      }
      return response.text();
    };
    promptTemplatePromises.set(variant, Promise.all([
      read(PROMPT_CORE_URL),
      read(config.rulesUrl),
    ]).then(([template, coordinateRules]) => {
      const missing = [
        QUEST_URL_PLACEHOLDER,
        SOURCE_TITLE_PLACEHOLDER,
        WIKITEXT_SOURCE_PLACEHOLDER,
        WIKI_SITE_PLACEHOLDER,
        WIKI_COORDINATE_RULES_PLACEHOLDER,
      ].filter((placeholder) => !template.includes(placeholder));
      if (missing.length > 0) {
        throw new Error(`The quest prompt is missing placeholders: ${missing.join(', ')}`);
      }
      return template
        .replace(WIKI_SITE_PLACEHOLDER, () => config.site)
        .replace(WIKI_COORDINATE_RULES_PLACEHOLDER, () => coordinateRules.trim())
        .trim();
    }));
  }
  return promptTemplatePromises.get(variant);
}

/** Build the exact Markdown prompt with the already-fetched wiki source. */
export async function buildQuestPrompt(url, { sourceTitle, wikitext } = {}) {
  const questUrl = String(url ?? '').trim();
  const variant = questPromptVariant(questUrl);
  if (!variant) throw new Error('badUrl');
  const template = await loadQuestPromptTemplate(variant);
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

// Begin loading both small variants before a user clicks an assistant action.
// The raw article source is still fetched only after the user requests it.
void loadQuestPromptTemplate('tibiawikibr').catch(() => {});
void loadQuestPromptTemplate('fandom').catch(() => {});
