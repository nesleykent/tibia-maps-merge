import assert from 'node:assert/strict';
import test from 'node:test';
import { extractCoordinates, fetchQuestCoordinates } from '../docs/lib/wiki.js';

test('Fandom Mapper Coords converts sector.offset positions to Tibia coordinates', () => {
  const wikitext = [
    '== Mission ==',
    'Meet the boss {{Mapper Coords|text=here|128.1|127.109|10|4|1|0.250.25}}.',
  ].join('\n');

  const [coordinate] = extractCoordinates(wikitext, { title: 'Example Quest/Spoiler' });

  assert.deepEqual(
    { x: coordinate.x, y: coordinate.y, z: coordinate.z },
    { x: 32769, y: 32621, z: 10 },
  );
});

test('Fandom Minimap marks use mark positions and the template floor', () => {
  const wikitext = [
    '== Route ==',
    'Use both switches {{Minimap|x=130.1|y=123.236|z=7|mark1=126.169,122.45,19,|mark2=126.170,122.46,4,}}.',
  ].join('\n');

  const coordinates = extractCoordinates(wikitext, { title: 'Example Quest/Spoiler' });

  assert.deepEqual(
    coordinates.map(({ x, y, z }) => ({ x, y, z })),
    [
      { x: 32425, y: 31277, z: 7 },
      { x: 32426, y: 31278, z: 7 },
    ],
  );
});

test('Fandom fetch uses raw parse.wikitext and follows the Spoiler subpage', async () => {
  const requests = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    requests.push(url);
    const page = url.searchParams.get('page');
    const isSpoiler = page.endsWith('/Spoiler');
    return {
      ok: true,
      json: async () => ({
        parse: {
          title: page,
          wikitext: isSpoiler
            ? 'Go here {{Mapper Coords|text=here|128.1|127.109|10|4|1|0.250.25}}.'
            : 'Quest summary without coordinates.',
        },
      }),
    };
  };

  const article = await fetchQuestCoordinates(
    'https://tibia.fandom.com/wiki/Measuring_Tibia_Quest',
    { fetchImpl },
  );

  assert.equal(requests.length, 2);
  assert.equal(requests[0].origin, 'https://tibia.fandom.com');
  assert.equal(requests[0].pathname, '/api.php');
  assert.deepEqual(
    Object.fromEntries(['action', 'prop', 'format', 'formatversion', 'redirects', 'origin']
      .map((key) => [key, requests[0].searchParams.get(key)])),
    {
      action: 'parse',
      prop: 'wikitext',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      origin: '*',
    },
  );
  assert.equal(requests[0].searchParams.get('page'), 'Measuring Tibia Quest');
  assert.equal(requests[1].searchParams.get('page'), 'Measuring Tibia Quest/Spoiler');
  assert.equal(article.title, 'Measuring Tibia Quest/Spoiler');
  assert.match(article.wikitext, /\{\{Mapper Coords/);
  assert.deepEqual(
    article.coordinates.map(({ x, y, z }) => ({ x, y, z })),
    [{ x: 32769, y: 32621, z: 10 }],
  );
});
