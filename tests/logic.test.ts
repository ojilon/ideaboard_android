import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clamp,
  domainOf,
  extractUrl,
  guessTitle,
  normalizeUrl,
  parseBulkLinks,
  parseTags,
  relativeTime,
  textWithoutUrl,
} from '../src/lib/parse.ts';

test('normalizeUrl adds https and rejects junk', () => {
  assert.equal(normalizeUrl('x.com/someone/status/1'), 'https://x.com/someone/status/1');
  assert.equal(normalizeUrl('  https://example.com/a?b=1  '), 'https://example.com/a?b=1');
  assert.equal(normalizeUrl('ftp://example.com/file'), null);
  assert.equal(normalizeUrl('not a link'), null);
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl('"https://example.com/x"'), 'https://example.com/x');
});

test('domainOf strips www', () => {
  assert.equal(domainOf('https://www.example.com/a'), 'example.com');
  assert.equal(domainOf('https://x.com/a'), 'x.com');
  assert.equal(domainOf('nonsense'), '');
});

test('extractUrl finds a link inside shared text', () => {
  assert.equal(
    extractUrl('Maya on X: "start small" https://x.com/maya/status/123?s=20'),
    'https://x.com/maya/status/123?s=20',
  );
  assert.equal(extractUrl(undefined, 'example.com/post', ''), 'https://example.com/post');
  assert.equal(extractUrl('no link here'), null);
});

test('textWithoutUrl keeps the human words', () => {
  assert.equal(textWithoutUrl('Maya on X: "start small" https://t.co/abc'), 'Maya on X: "start small"');
  assert.equal(textWithoutUrl(''), '');
});

test('parseBulkLinks reads one URL per line, de-duplicates, keeps order', () => {
  const parsed = parseBulkLinks(`
    https://a.example.com/1
    b.example.com/2

    https://A.example.com/1/
    not a url
    https://c.example.com/3
  `);
  assert.deepEqual(
    parsed.map((entry) => entry.url),
    ['https://a.example.com/1', 'https://b.example.com/2', 'https://c.example.com/3'],
  );
  assert.equal(parsed[1].domain, 'b.example.com');
});

test('guessTitle turns a slug into something readable', () => {
  assert.equal(guessTitle('https://example.com/notes/a-guide-to-slow-walks'), 'A guide to slow walks');
  assert.equal(guessTitle('https://example.com/'), '');
  assert.equal(guessTitle('https://example.com/12345'), '');
});

test('parseTags trims, caps and de-duplicates case-insensitively', () => {
  assert.deepEqual(parseTags(' Outdoors, ideas ,#outdoors,  '), ['Outdoors', 'ideas']);
  assert.deepEqual(parseTags(''), []);
});

test('relativeTime is human', () => {
  const now = Date.UTC(2026, 10, 7, 12, 0, 0);
  assert.equal(relativeTime(now - 1000, now), 'just now');
  assert.equal(relativeTime(now - 5 * 60_000, now), '5 min ago');
  assert.equal(relativeTime(now - 3 * 3_600_000, now), '3 hours ago');
  assert.equal(relativeTime(now - 24 * 3_600_000, now), '1 day ago');
  assert.equal(relativeTime(now - 8 * 86_400_000, now), '1 week ago');
});

test('clamp', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

import { parseBoardFile } from '../src/lib/format.ts';

test('parseBoardFile refuses anything but a supported Ideaboard backup', () => {
  assert.throws(() => parseBoardFile('not json'), /valid JSON/);
  assert.throws(() => parseBoardFile('{"hello":1}'), /not an Ideaboard backup/);
  assert.throws(
    () => parseBoardFile('{"format":"ideaboard","version":99,"boards":[]}'),
    /version 99/,
  );
  const minimal = JSON.stringify({
    format: 'ideaboard',
    version: 1,
    boards: [{ id: 'b1', name: 'Board', createdAt: 1, updatedAt: 1 }],
    items: [],
    connectors: [],
    strokes: [],
    links: [],
    blobs: [],
  });
  const parsed = parseBoardFile(minimal);
  assert.equal(parsed.boards[0].name, 'Board');
});
