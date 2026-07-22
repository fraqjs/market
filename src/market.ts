import { type Category, categories, type MarketFile, type MarketPlugin, type NpmPackageManifest } from './types';

const categorySet = new Set<string>(categories);

export function isFraqPluginPackageName(packageName: string): boolean {
  return /^(?:fraq-plugin-[^/]+|@fraqjs\/plugin-[^/]+|@(?!fraqjs\/)[^/]+\/fraq-plugin-[^/]+)$/.test(packageName);
}

export function marketPluginName(packageName: string): string {
  if (!isFraqPluginPackageName(packageName)) {
    throw new Error(`Invalid Fraq plugin package name: ${packageName}`);
  }

  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.split('/');
    if (scope === '@fraqjs') {
      return `fraqjs/${name.slice('plugin-'.length)}`;
    }
    return `${scope.slice(1)}/${name.slice('fraq-plugin-'.length)}`;
  }

  return packageName.slice('fraq-plugin-'.length);
}

function normalizeRepositoryUrl(repository: string): string | null {
  let url = repository.trim();
  if (url.length === 0) {
    return null;
  }

  if (url.startsWith('git+')) {
    url = url.slice('git+'.length);
  } else if (url.startsWith('git@github.com:')) {
    url = `https://github.com/${url.slice('git@github.com:'.length)}`;
  } else if (url.startsWith('ssh://git@github.com/')) {
    url = `https://github.com/${url.slice('ssh://git@github.com/'.length)}`;
  } else if (url.startsWith('git://github.com/')) {
    url = `https://github.com/${url.slice('git://github.com/'.length)}`;
  }

  return url.replace(/\.git$/, '');
}

export function packageRepository(repository: unknown): string | null {
  if (typeof repository === 'string') {
    return normalizeRepositoryUrl(repository);
  }

  if (repository !== null && typeof repository === 'object' && 'url' in repository) {
    const url = repository.url;
    return typeof url === 'string' ? normalizeRepositoryUrl(url) : null;
  }

  return null;
}

export function packageCategory(fraq: unknown): Category | null {
  if (fraq === null || typeof fraq !== 'object' || !('category' in fraq)) {
    return null;
  }

  const category = fraq.category;
  return typeof category === 'string' && categorySet.has(category) ? (category as Category) : null;
}

export function marketPluginFromManifest(manifest: NpmPackageManifest): MarketPlugin {
  const packageName = typeof manifest.name === 'string' ? manifest.name : '';
  const category = packageCategory(manifest.fraq);
  const description = typeof manifest.description === 'string' ? manifest.description : '';

  return {
    name: packageName,
    version: typeof manifest.version === 'string' ? manifest.version : '',
    description,
    category,
    repository: packageRepository(manifest.repository),
    market: {
      unlisted: category === null,
    },
  };
}

export function marketFileFromPlugins(plugins: Iterable<MarketPlugin>): MarketFile {
  const sortedPlugins = Object.fromEntries(
    [...plugins]
      .map((plugin) => [marketPluginName(plugin.name), plugin] as const)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    categories,
    plugins: sortedPlugins,
  };
}
