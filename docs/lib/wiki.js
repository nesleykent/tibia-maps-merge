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

// tibia.fandom.com writes positions in Mapper's "sector.offset" form instead:
// {{Minimap|x=130.1|y=123.236|z=7|...|mark1=126.169,122.45,19,}} and
// {{Mapper Coords|text=here|128.1|127.109|10|4|1|0.250.25}}.
// A sector is one 256x256 minimap tile -- the same grid this project's own
// Minimap_Color_<x>_<y>_<z>.png files are named after -- so the game
// coordinate is simply sector * 256 + offset. Verified against the Mapper
// page's own town links and against the same quest on tibiawiki.com.br.
const SECTOR_SIZE = 256;
const SECTOR = String.raw`(\d{1,3})\.(\d{1,3})`;
const MINIMAP_TEMPLATE = /\{\{\s*Minimap\s*\|([^{}]*)\}\}/gi;
const MINIMAP_CENTER = new RegExp(String.raw`x\s*=\s*${SECTOR}[\s\S]*?y\s*=\s*${SECTOR}[\s\S]*?z\s*=\s*(\d{1,2})`, 'i');
const MINIMAP_MARK = new RegExp(String.raw`mark\d*\s*=\s*${SECTOR}\s*,\s*${SECTOR}\s*,\s*(\d{1,2})`, 'gi');
const MAPPER_COORDS = /\{\{\s*Mapper[ _]Coords\s*\|([^{}]*)\}\}/gi;

function fromSector(sector, offset) {
  return Number(sector) * SECTOR_SIZE + Number(offset);
}

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
  // The context window can start inside a template, leaving an unclosed "{{"
  // whose parameters would otherwise read as prose. Cut back to it.
  const opened = before.lastIndexOf('{{');
  const context = opened >= 0 && before.indexOf('}}', opened) === -1
    ? before.slice(0, opened)
    : before;

  let clause = stripMarkup(context)
    .split(/(?<=[.;:!?])\s+/).pop() ?? '';
  clause = clause
    .replace(/^=+\s*[^=]*=+\s*/, '')          // a heading fragment that leaked in
    .replace(/\b[\w-]+\s*=\s*\S+/g, ' ')      // stray template parameters
    .replace(/^[\s*#:;|>,.\-–—0-9]+/, '')     // list markers, table cruft, step numbers
    .replace(/\s+/g, ' ')
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
        at: match.index,
        x: Number(match[1]),
        y: Number(match[2]),
        z: Number(match[3]),
        section,
        label: labelFor(text.slice(Math.max(0, match.index - 300), match.index), section, title),
      });
    }
    return found;
  };

  // Mapper templates (tibia.fandom.com). A {{Minimap}} that carries a mark
  // uses the mark's exact position; without one, its centre is the position.
  const fromMapper = [];
  const addMapper = (at, x, y, z) => {
    const section = headings.filter((h) => h.at < at).pop()?.title ?? '';
    fromMapper.push({
      at, x, y, z, section,
      label: labelFor(text.slice(Math.max(0, at - 300), at), section, title),
    });
  };

  MINIMAP_TEMPLATE.lastIndex = 0;
  let block;
  while ((block = MINIMAP_TEMPLATE.exec(text))) {
    const body = block[1];
    const marks = [...body.matchAll(MINIMAP_MARK)];
    if (marks.length > 0) {
      for (const mark of marks) {
        const z = body.match(/z\s*=\s*(\d{1,2})/i);
        addMapper(block.index, fromSector(mark[1], mark[2]), fromSector(mark[3], mark[4]), Number(z?.[1] ?? 7));
      }
      continue;
    }
    const centre = body.match(MINIMAP_CENTER);
    if (centre) {
      addMapper(block.index, fromSector(centre[1], centre[2]), fromSector(centre[3], centre[4]), Number(centre[5]));
    }
  }

  MAPPER_COORDS.lastIndex = 0;
  while ((block = MAPPER_COORDS.exec(text))) {
    // positional arguments only -- named ones like `text=here` are not coordinates
    const parts = block[1].split('|').map((p) => p.trim()).filter((p) => !p.includes('='));
    const [rawX, rawY, rawZ] = parts;
    const x = /^\d{1,3}\.\d{1,3}$/.test(rawX ?? '') ? rawX.split('.') : null;
    const y = /^\d{1,3}\.\d{1,3}$/.test(rawY ?? '') ? rawY.split('.') : null;
    if (!x || !y || !/^\d{1,2}$/.test(rawZ ?? '')) continue;
    addMapper(block.index, fromSector(x[0], x[1]), fromSector(y[0], y[1]), Number(rawZ));
  }

  // Prefer the template: a bare "(x,y,z)" scan also picks up version numbers
  // and other incidental triples, so it only runs when nothing else matched.
  const fromTemplate = collect(MAP_TEMPLATE);
  const combined = [...fromTemplate, ...fromMapper];
  const ordered = combined.length > 0 ? combined : collect(BARE_COORDINATE);
  return ordered
    .sort((a, b) => a.at - b.at)
    .map(({ at, ...mark }) => mark);
}

/**
 * Fetch an article and return its coordinates.
 * Throws with a readable reason -- the caller turns it into a status line.
 */
export async function fetchQuestCoordinates(input, { fetchImpl = fetch } = {}) {
  const target = parseWikiUrl(input);
  if (!target) throw new Error('badUrl');

  async function readWikitext(pageTitle) {
    const query = new URLSearchParams({
      action: 'parse',
      page: pageTitle,
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
    if (payload.error) return null;
    const wikitext = payload.parse?.wikitext;
    return typeof wikitext === 'string'
      ? { wikitext, title: payload.parse?.title ?? pageTitle }
      : null;
  }

  const article = await readWikitext(target.title);
  if (!article) throw new Error('noArticle');

  let best = { ...article, coordinates: extractCoordinates(article.wikitext, { title: article.title }) };

  // tibia.fandom.com keeps the walkthrough on a "/Spoiler" subpage, so the
  // quest article itself is just an infobox with no positions in it. Follow
  // the subpage when the page the user pasted has nothing to offer.
  if (best.coordinates.length === 0 && !/\/Spoiler$/i.test(target.title)) {
    const spoiler = await readWikitext(`${target.title}/Spoiler`);
    if (spoiler) {
      const coordinates = extractCoordinates(spoiler.wikitext, { title: spoiler.title });
      if (coordinates.length > 0) best = { ...spoiler, coordinates };
    }
  }

  return {
    title: best.title,
    pageUrl: target.pageUrl,
    coordinates: best.coordinates,
  };
}
