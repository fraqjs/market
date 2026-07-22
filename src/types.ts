export const categories = [
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
] as const;

export type Category = (typeof categories)[number];

export interface MarketPlugin {
  name: string;
  version: string;
  description: string;
  category: Category | null;
  repository: string | null;
  market: {
    unlisted: boolean;
  };
}

export interface MarketFile {
  version: 1;
  categories: readonly Category[];
  plugins: Record<string, MarketPlugin>;
}

export interface CheckpointFile {
  version: 1;
  lastSeq: number;
}

export interface NpmPackageManifest {
  name?: unknown;
  version?: unknown;
  description?: unknown;
  repository?: unknown;
  fraq?: unknown;
}

export interface NpmPackageDocument {
  name?: unknown;
  versions?: unknown;
  'dist-tags'?: unknown;
}

export interface NpmSearchResult {
  objects?: Array<{ package?: { name?: unknown } }>;
}

export interface NpmChange {
  seq?: unknown;
  id?: unknown;
  deleted?: unknown;
}

export interface NpmChangesPage {
  results?: unknown;
  last_seq?: unknown;
}
