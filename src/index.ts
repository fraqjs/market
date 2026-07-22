import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isFraqPluginPackageName, marketFileFromPlugins, marketPluginFromManifest } from './market';
import { NpmRegistry } from './npm';
import type { CheckpointFile, MarketFile, MarketPlugin } from './types';

interface Arguments {
  outputPath: string;
  checkpointPath: string;
}

function parseArguments(argv: string[]): Arguments {
  const arguments_: Arguments = {
    outputPath: 'plugins.json',
    checkpointPath: 'checkpoint.json',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if ((argument === '--output' || argument === '--checkpoint') && typeof next === 'string') {
      if (argument === '--output') arguments_.outputPath = next;
      else arguments_.checkpointPath = next;
      index += 1;
    } else if (argument === '--help') {
      console.log('Usage: pnpm generate [--output plugins.json] [--checkpoint checkpoint.json]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return arguments_;
}

async function readJsonIfPresent<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function readPreviousPlugins(market: MarketFile | null): Map<string, MarketPlugin> {
  if (market === null) return new Map();
  if (market.version !== 1 || market.plugins === null || typeof market.plugins !== 'object') {
    throw new Error('The existing market file has an unsupported format. Remove it and bootstrap again.');
  }
  return new Map(Object.values(market.plugins).map((plugin) => [plugin.name, plugin]));
}

async function generate(arguments_: Arguments): Promise<void> {
  const outputPath = resolve(arguments_.outputPath);
  const checkpointPath = resolve(arguments_.checkpointPath);
  const previousMarket = await readJsonIfPresent<MarketFile>(outputPath);
  const previousCheckpoint = await readJsonIfPresent<CheckpointFile>(checkpointPath);
  const registry = new NpmRegistry();
  const sequence = await registry.getUpdateSequence();
  const shouldBootstrap = previousMarket === null || previousCheckpoint === null;
  const plugins = shouldBootstrap ? new Map<string, MarketPlugin>() : readPreviousPlugins(previousMarket);

  if (shouldBootstrap) {
    const packageNames = (await registry.searchPluginPackageNames()).filter(isFraqPluginPackageName);
    const manifests = await registry.getLatestManifests(packageNames);
    for (const manifest of manifests) {
      if (typeof manifest.name === 'string' && isFraqPluginPackageName(manifest.name)) {
        plugins.set(manifest.name, marketPluginFromManifest(manifest));
      }
    }
    console.log(`Bootstrapped ${plugins.size} plugin(s) at npm sequence ${sequence}.`);
  } else {
    if (previousCheckpoint.version !== 1 || !Number.isSafeInteger(previousCheckpoint.lastSeq)) {
      throw new Error('The existing checkpoint has an unsupported format. Remove it and bootstrap again.');
    }

    const changes = await registry.getChanges(previousCheckpoint.lastSeq, sequence);
    const changedNames = new Set<string>();
    for (const change of changes.changes) {
      if (typeof change.id === 'string' && isFraqPluginPackageName(change.id)) {
        changedNames.add(change.id);
      }
    }

    const manifests = await registry.getLatestManifests(changedNames);
    const manifestMap = new Map(
      manifests
        .filter((manifest): manifest is typeof manifest & { name: string } => typeof manifest.name === 'string')
        .map((manifest) => [manifest.name, manifest]),
    );
    for (const packageName of changedNames) {
      const manifest = manifestMap.get(packageName);
      if (manifest === undefined) plugins.delete(packageName);
      else plugins.set(packageName, marketPluginFromManifest(manifest));
    }
    console.log(`Applied ${changedNames.size} changed plugin package(s) through npm sequence ${sequence}.`);
  }

  const market = marketFileFromPlugins(plugins.values());
  await writeFile(outputPath, `${JSON.stringify(market, null, 2)}\n`);
  await writeFile(checkpointPath, `${JSON.stringify({ version: 1, lastSeq: sequence }, null, 2)}\n`);
}

await generate(parseArguments(process.argv.slice(2)));
