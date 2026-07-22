#!/usr/bin/env node

const {
  GITHUB_PAT,
  GITHUB_REPOSITORY = 'fraqjs/market',
  GITHUB_WORKFLOW = 'refresh.yml',
  GITHUB_REF = 'main',
  GITHUB_API_URL = 'https://api.github.com',
} = process.env;

const DISPATCH_INTERVAL_MS = 3 * 60 * 60 * 1000;

if (!GITHUB_PAT) {
  console.error('GITHUB_PAT is required.');
  process.exit(1);
}

if (!/^[^/\s]+\/[^/\s]+$/.test(GITHUB_REPOSITORY)) {
  console.error('GITHUB_REPOSITORY must use the "owner/repository" format.');
  process.exit(1);
}

const [owner, repository] = GITHUB_REPOSITORY.split('/');
const endpoint = new URL(
  `${GITHUB_API_URL.replace(/\/+$/, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(GITHUB_WORKFLOW)}/dispatches`,
);

async function dispatchRefresh() {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${GITHUB_PAT}`,
        'Content-Type': 'application/json',
        'User-Agent': 'fraq-market-refresh-dispatcher',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: GITHUB_REF }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `GitHub API returned ${response.status} ${response.statusText}${responseBody ? `: ${responseBody}` : ''}`,
      );
    }

    console.log(`Dispatched ${GITHUB_WORKFLOW} on ${GITHUB_REPOSITORY}@${GITHUB_REF}.`);
  } catch (error) {
    console.error(`Failed to dispatch workflow: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await dispatchRefresh();
console.log('Refresh workflow will be dispatched every 3 hours.');

setInterval(() => {
  void dispatchRefresh();
}, DISPATCH_INTERVAL_MS);

export {};
