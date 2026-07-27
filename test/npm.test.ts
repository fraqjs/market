import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NpmRegistry } from '../src/npm';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('npm registry client', () => {
  it('reads changes in pages and stops at the captured sequence', async () => {
    const requested: string[] = [];
    const registry = new NpmRegistry({
      replicateUrl: 'https://replicate.test',
      fetch: async (input) => {
        const url = String(input);
        requested.push(url);
        if (url.includes('since=10')) {
          return jsonResponse({ results: [{ seq: 11, id: 'fraq-plugin-a' }], last_seq: 11 });
        }
        if (url.includes('since=11')) {
          return jsonResponse({ results: [{ seq: 12, id: 'fraq-plugin-b' }], last_seq: 12 });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    const changes = await registry.getChanges(10, 12);
    assert.deepEqual(
      changes.changes.map((change) => change.id),
      ['fraq-plugin-a', 'fraq-plugin-b'],
    );
    assert.equal(changes.lastSeq, 12);
    assert.equal(requested.length, 2);
  });

  it('deduplicates search results and returns the latest manifest', async () => {
    const registry = new NpmRegistry({
      registryUrl: 'https://registry.test',
      fetch: async (input) => {
        const url = String(input);
        if (url.includes('/-/v1/search')) {
          return jsonResponse({
            objects: [
              { package: { name: 'fraq-plugin-a' } },
              { package: { name: '@fraqjs/plugin-a' } },
              { package: { name: 'fraq-plugin-a' } },
            ],
          });
        }
        if (url.endsWith('/fraq-plugin-a')) {
          return jsonResponse({
            'dist-tags': { latest: '1.2.3' },
            time: { '1.2.3': '2026-07-26T12:34:56.000Z' },
            versions: {
              '1.2.3': { name: 'fraq-plugin-a', version: '1.2.3', fraq: { category: 'utilities' } },
            },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });

    assert.deepEqual(await registry.searchPluginPackageNames(), ['fraq-plugin-a', '@fraqjs/plugin-a']);
    assert.deepEqual(await registry.getLatestManifest('fraq-plugin-a'), {
      name: 'fraq-plugin-a',
      version: '1.2.3',
      updatedAt: '2026-07-26T12:34:56.000Z',
      fraq: { category: 'utilities' },
    });
  });

  it('uses null when npm has no publication time for the latest version', async () => {
    const registry = new NpmRegistry({
      registryUrl: 'https://registry.test',
      fetch: async () =>
        jsonResponse({
          'dist-tags': { latest: '1.2.3' },
          versions: { '1.2.3': { name: 'fraq-plugin-a', version: '1.2.3' } },
        }),
    });

    assert.deepEqual(await registry.getLatestManifest('fraq-plugin-a'), {
      name: 'fraq-plugin-a',
      version: '1.2.3',
      updatedAt: null,
    });
  });

  it('treats a missing package as deleted', async () => {
    const registry = new NpmRegistry({
      registryUrl: 'https://registry.test',
      fetch: async () => jsonResponse({}, 404),
    });
    assert.equal(await registry.getLatestManifest('fraq-plugin-deleted'), null);
  });
});
