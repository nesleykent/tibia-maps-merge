// Load the assistant instructions from their Markdown source instead of
// maintaining a second, escaped copy in JavaScript.

const QUEST_URL_PLACEHOLDER = '{{QUEST_URL}}';
const SOURCE_TITLE_PLACEHOLDER = '{{SOURCE_TITLE}}';
const WIKITEXT_SOURCE_PLACEHOLDER = '{{WIKITEXT_SOURCE}}';
const WIKI_SOURCE_ACCESS_PLACEHOLDER = '{{WIKI_SOURCE_ACCESS}}';
const WIKI_COORDINATE_RULES_PLACEHOLDER = '{{WIKI_COORDINATE_RULES}}';
const PROMPT_CORE_URL = new URL(
  '../prompts/tibia-wiki-quest-coordinate-agent-system-prompt.md',
  import.meta.url,
);
const PROMPT_VARIANTS = {
  tibiawikibr: {
    sourceUrl: new URL('../prompts/tibiawikibr-source-access.md', import.meta.url),
    rulesUrl: new URL('../prompts/tibiawikibr-coordinate-rules.md', import.meta.url),
  },
  fandom: {
    sourceUrl: new URL('../prompts/fandom-source-access.md', import.meta.url),
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

/**
 * Keep every Fandom coordinate-bearing line verbatim, together with headings
 * and one line of surrounding context. This removes galleries and unrelated
 * walkthrough prose without removing any supported coordinate encoding.
 */
export function compactFandomWikitext(wikitext) {
  const lines = String(wikitext ?? '').split('\n');
  const keep = new Set();
  const coordinateBearing = /\{\{\s*(?:Mapper[ _]Coords|Minimap)\b|[?&](?:coords|mark\d+)=|\(\s*\d{4,6}\s*,\s*\d{4,6}\s*,\s*\d{1,2}\s*\)/i;
  const heading = /^={2,6}\s*[^=]/;

  lines.forEach((line, index) => {
    if (heading.test(line)) keep.add(index);
    if (!coordinateBearing.test(line)) return;
    for (let nearby = Math.max(0, index - 1); nearby <= Math.min(lines.length - 1, index + 1); nearby++) {
      keep.add(nearby);
    }
  });

  const selected = [...keep].sort((a, b) => a - b);
  const output = [];
  let previous = -1;
  for (const index of selected) {
    if (previous >= 0 && index > previous + 1) output.push('<!-- unrelated non-coordinate source omitted -->');
    output.push(lines[index]);
    previous = index;
  }
  return output.join('\n').trim();
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
      read(config.sourceUrl),
      read(config.rulesUrl),
    ]).then(([template, sourceAccess, coordinateRules]) => {
      const missing = [
        QUEST_URL_PLACEHOLDER,
        WIKI_SOURCE_ACCESS_PLACEHOLDER,
        WIKI_COORDINATE_RULES_PLACEHOLDER,
      ].filter((placeholder) => !template.includes(placeholder));
      if (missing.length > 0) {
        throw new Error(`The quest prompt is missing placeholders: ${missing.join(', ')}`);
      }
      return template
        .replace(WIKI_SOURCE_ACCESS_PLACEHOLDER, () => sourceAccess.trim())
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
  const source = variant === 'fandom'
    ? compactFandomWikitext(wikitext)
    : String(wikitext ?? '').trim();
  if (variant === 'fandom' && (!title || !source)) throw new Error('missingWikiSource');
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
