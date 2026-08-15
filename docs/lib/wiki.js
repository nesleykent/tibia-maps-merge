// Pulling quest coordinates out of a Tibia Wiki article.
//
// Wiki articles hide their coordinates in a map-link template rather than in
// the prose -- a sentence says to go "here" and the template behind that word
// carries the position. This reads the article's *wikitext* through the
// MediaWiki API, which is the only part of these sites reachable from a static
// page: the rendered HTML is cross-origin (and often behind a bot check),
// while `api.php?...&origin=*` is served with CORS headers, so no proxy and no
// server of our own is involved.
//
// Only public article text is requested; nothing about the user is sent.

const COORDINATE = String.raw`(\d{4,6})\s*,\s*(\d{4,6})\s*,\s*(\d{1,2})`;
// {{Mapa|32250,31385,5:2|aqui}} -- tibiawiki.com.br's map-link template.
const MAP_TEMPLATE = new RegExp(String.raw`\{\{\s*mapa\s*\|\s*${COORDINATE}`, 'gi');
// Fallback for articles that write the position inline instead: (32250,31385,5)
const BARE_COORDINATE = new RegExp(String.raw`\(\s*${COORDINATE}`, 'g');
const HEADING = /^(={2,6})\s*(.+?)\s*\1\s*$/gm;

const MAX_LABEL_CHARS = 60;

/**
 * Turn an article URL into the API endpoint and page title to request.
 * Works for any MediaWiki install (`/wiki/Title` or `/index.php?title=Title`),
 * which covers tibiawiki.com.br and tibia.fandom.com alike.
 * Returns null if the URL isn't one we can read.
 */
export function parseWikiUrl(input) {
  let url;
  try {
    url = new URL(String(input ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  let title = url.searchParams.get('title');
  if (!title) {
    const match = url.pathname.match(/\/(?:wiki|index\.php)\/(.+)$/);
    if (!match) return null;
    title = decodeURIComponent(match[1]);
  }
  title = title.replace(/_/g, ' ').trim();
  if (!title) return null;

  return { api: `${url.origin}/api.php`, title, pageUrl: url.href };
}

/** Strip the wiki markup that would otherwise end up inside a marker label. */
const FILE_PREFIX = 'Arquivo|Ficheiro|File|Image|Imagem';

/** Remove templates innermost-first, so nested ones don't leave stray braces. */
function stripTemplates(text) {
  let out = text;
  for (let pass = 0; pass < 4; pass++) {
    const next = out.replace(/\{\{[^{}]*\}\}/g, ' ');
    if (next === out) break;
    out = next;
  }
  return out.replace(/[{}]{2,}/g, ' ');
}

function stripMarkup(text) {
  return stripTemplates(String(text))
    // Galleries and image captions name files, not places. Wiki file names may
    // contain spaces ("Arquivo:Cellar 1.png|Entrada"), so consume through the
    // extension and the caption separator rather than to the first space.
    .replace(new RegExp(String.raw`\[\[(?:${FILE_PREFIX}):[^\]]*\]\]`, 'gi'), ' ')
    .replace(new RegExp(String.raw`(?:${FILE_PREFIX}):[^|\]\n]*(?:\|[^\n]*)?`, 'gi'), ' ')
    .replace(/\S+\.(?:png|jpe?g|gif|svg|webp)(?:\|[^\n]*)?/gi, ' ')
    .replace(/<gallery[^>]*>[\s\S]*?<\/gallery>/gi, ' ')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/[-=~_]{4,}/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\(\s*\)/g, ' ')          // parentheses left empty by a stripped template
    .replace(/\s*[|>»]+\s*/g, ' ')     // table and arrow separators
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a label from the text leading up to a map link -- usually the clause
 * that names the place ("Nas montanhas da ilha Okolnir"). Falls back to the
 * section heading, then to the article title, so every mark gets something.
 */
function labelFor(before, section, title) {
  let clause = stripMarkup(before)
    .split(/(?<=[.;:!?])\s+/).pop() ?? '';
  clause = clause
    .replace(/^=+\s*[^=]*=+\s*/, '')          // a heading fragment that leaked in
    .replace(/^[\s*#:;|>,.\-–—0-9]+/, '')     // list markers, table cruft, step numbers
    .replace(/[\s,(:;\-–—]+$/, '')
    .trim();

  if (clause.length > MAX_LABEL_CHARS) {
    // keep the tail: the place is normally named at the end of the clause
    clause = clause.slice(clause.length - MAX_LABEL_CHARS);
    clause = clause.slice(clause.search(/\s/) + 1).trim();
  }
  return clause || section || title || '';
}

/**
 * Extract every coordinate in an article's wikitext, in document order.
 * Pure and DOM-free so it can be tested against a saved article.
 *
 * @returns {Array<{x: number, y: number, z: number, label: string, section: string}>}
 */
export function extractCoordinates(wikitext, { title = '' } = {}) {
  const text = String(wikitext ?? '');
  const headings = [...text.matchAll(HEADING)]
    .map((m) => ({ at: m.index, title: stripMarkup(m[2]) }));

  const collect = (pattern) => {
    const found = [];
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const section = headings.filter((h) => h.at < match.index).pop()?.title ?? '';
      found.push({
        x: Number(match[1]),
        y: Number(match[2]),
        z: Number(match[3]),
        section,
        label: labelFor(text.slice(Math.max(0, match.index - 300), match.index), section, title),
      });
    }
    return found;
  };

  // Prefer the template: a bare "(x,y,z)" scan also picks up version numbers
  // and other incidental triples, so it only runs when nothing else matched.
  const fromTemplate = collect(MAP_TEMPLATE);
  return fromTemplate.length > 0 ? fromTemplate : collect(BARE_COORDINATE);
}

/**
 * Fetch an article and return its coordinates.
 * Throws with a readable reason -- the caller turns it into a status line.
 */
export async function fetchQuestCoordinates(input, { fetchImpl = fetch } = {}) {
  const target = parseWikiUrl(input);
  if (!target) throw new Error('badUrl');

  const query = new URLSearchParams({
    action: 'parse',
    page: target.title,
    prop: 'wikitext',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    origin: '*', // ask MediaWiki for an anonymous CORS response
  });

  let response;
  try {
    response = await fetchImpl(`${target.api}?${query}`);
  } catch {
    throw new Error('unreachable');
  }
  if (!response.ok) throw new Error('unreachable');

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('unreachable');
  }
  if (payload.error) throw new Error('noArticle');

  const wikitext = payload.parse?.wikitext;
  if (typeof wikitext !== 'string') throw new Error('noArticle');

  const pageTitle = payload.parse?.title ?? target.title;
  return {
    title: pageTitle,
    pageUrl: target.pageUrl,
    coordinates: extractCoordinates(wikitext, { title: pageTitle }),
  };
}
