import type { NpmChange, NpmChangesPage, NpmPackageDocument, NpmPackageManifest, NpmSearchResult } from './types';

const defaultRegistryUrl = 'https://registry.npmjs.org';
const defaultReplicateUrl = 'https://replicate.npmjs.com';
const changesPageSize = 1_000;

function asNumber(value: unknown, field: string): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`npm returned an invalid ${field}: ${String(value)}`);
  }
  return number;
}

async function readJson<T>(response: Response, url: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error(`Request failed (${response.status}) for ${url}: ${body}`);
  }
  return (await response.json()) as T;
}

export interface NpmRegistryOptions {
  fetch?: typeof fetch;
  registryUrl?: string;
  replicateUrl?: string;
}

export interface NpmChanges {
  changes: NpmChange[];
  lastSeq: number;
}

export class NpmRegistry {
  readonly #fetch: typeof fetch;
  readonly #registryUrl: string;
  readonly #replicateUrl: string;

  constructor(options: NpmRegistryOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#registryUrl = (options.registryUrl ?? defaultRegistryUrl).replace(/\/$/, '');
    this.#replicateUrl = (options.replicateUrl ?? defaultReplicateUrl).replace(/\/$/, '');
  }

  async getUpdateSequence(): Promise<number> {
    const response = await this.#fetch(`${this.#replicateUrl}/`);
    const database = await readJson<{ update_seq?: unknown }>(response, `${this.#replicateUrl}/`);
    return asNumber(database.update_seq, 'update_seq');
  }

  async getChanges(since: number, until: number): Promise<NpmChanges> {
    if (since > until) {
      throw new Error(`Checkpoint sequence ${since} is ahead of registry sequence ${until}`);
    }

    const changes: NpmChange[] = [];
    let cursor = since;

    while (cursor < until) {
      const url = `${this.#replicateUrl}/_changes?since=${cursor}&limit=${changesPageSize}`;
      const response = await this.#fetch(url);
      const page = await readJson<NpmChangesPage>(response, url);
      const results = Array.isArray(page.results) ? page.results : [];
      const pageLastSeq = asNumber(page.last_seq, 'last_seq');

      for (const result of results) {
        if (result !== null && typeof result === 'object') {
          const change = result as NpmChange;
          const sequence = asNumber(change.seq, 'change.seq');
          if (sequence > since && sequence <= until) {
            changes.push(change);
          }
        }
      }

      if (results.length === 0 || pageLastSeq <= cursor || pageLastSeq >= until) {
        break;
      }
      cursor = pageLastSeq;
    }

    return { changes, lastSeq: until };
  }

  async searchPluginPackageNames(): Promise<string[]> {
    const names = new Set<string>();
    for (const query of ['fraq-plugin-', '@fraqjs/plugin-']) {
      const url = `${this.#registryUrl}/-/v1/search?text=${encodeURIComponent(query)}&size=250`;
      const response = await this.#fetch(url);
      const search = await readJson<NpmSearchResult>(response, url);
      for (const result of search.objects ?? []) {
        const name = result.package?.name;
        if (typeof name === 'string') {
          names.add(name);
        }
      }
    }
    return [...names];
  }

  async getLatestManifest(packageName: string): Promise<NpmPackageManifest | null> {
    const url = `${this.#registryUrl}/${encodeURIComponent(packageName)}`;
    const response = await this.#fetch(url);
    if (response.status === 404) {
      return null;
    }
    const document = await readJson<NpmPackageDocument>(response, url);
    const distTags = document['dist-tags'];
    const latest = distTags !== null && typeof distTags === 'object' && 'latest' in distTags ? distTags.latest : null;
    if (typeof latest !== 'string' || document.versions === null || typeof document.versions !== 'object') {
      return null;
    }

    const manifest = (document.versions as Record<string, unknown>)[latest];
    return manifest !== null && typeof manifest === 'object' ? (manifest as NpmPackageManifest) : null;
  }

  async getLatestManifests(packageNames: Iterable<string>): Promise<NpmPackageManifest[]> {
    const manifests = await Promise.all([...packageNames].map((name) => this.getLatestManifest(name)));
    return manifests.filter((manifest): manifest is NpmPackageManifest => manifest !== null);
  }
}
