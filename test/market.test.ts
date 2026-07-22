import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isFraqPluginPackageName,
  marketFileFromPlugins,
  marketPluginFromManifest,
  marketPluginName,
  packageRepository,
} from '../src/market';

describe('market package mapping', () => {
  it('accepts the three documented plugin package forms', () => {
    assert.equal(isFraqPluginPackageName('fraq-plugin-echo'), true);
    assert.equal(isFraqPluginPackageName('@example/fraq-plugin-echo'), true);
    assert.equal(isFraqPluginPackageName('@fraqjs/plugin-echo'), true);
    assert.equal(isFraqPluginPackageName('fraq-plugin'), false);
    assert.equal(isFraqPluginPackageName('@example/plugin-echo'), false);
    assert.equal(isFraqPluginPackageName('@fraqjs/fraq-plugin-echo'), false);
  });

  it('maps package names to Fraq CLI names', () => {
    assert.equal(marketPluginName('fraq-plugin-echo'), 'echo');
    assert.equal(marketPluginName('@example/fraq-plugin-echo'), 'example/echo');
    assert.equal(marketPluginName('@fraqjs/plugin-echo'), 'fraqjs/echo');
  });

  it('normalizes npm repository metadata and marks uncategorized packages unlisted', () => {
    const plugin = marketPluginFromManifest({
      name: 'fraq-plugin-echo',
      version: '1.2.3',
      description: 'Echo',
      repository: { type: 'git', url: 'git+https://github.com/example/echo.git' },
      fraq: { category: 'utilities' },
    });
    assert.deepEqual(plugin, {
      name: 'fraq-plugin-echo',
      version: '1.2.3',
      description: 'Echo',
      category: 'utilities',
      repository: 'https://github.com/example/echo',
      market: { unlisted: false },
    });
    assert.equal(packageRepository('git@github.com:example/echo.git'), 'https://github.com/example/echo');
    assert.equal(marketPluginFromManifest({ name: 'fraq-plugin-other', version: '1.0.0' }).market.unlisted, true);
  });

  it('sorts output by the market name while retaining the schema', () => {
    const first = marketPluginFromManifest({ name: 'fraq-plugin-z', version: '1.0.0' });
    const second = marketPluginFromManifest({ name: '@fraqjs/plugin-a', version: '1.0.0' });
    const third = marketPluginFromManifest({ name: 'fraq-plugin-b', version: '1.0.0' });
    const market = marketFileFromPlugins([first, second, third]);
    assert.deepEqual(Object.keys(market.plugins), ['b', 'fraqjs/a', 'z']);
    assert.deepEqual(market.categories, [
      'infrastructure',
      'development',
      'management',
      'information',
      'media',
      'ai',
      'social',
      'entertainment',
      'game-tools',
      'utilities',
    ]);
  });
});
