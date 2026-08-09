import { canonicalGitHubRemote } from './update-remote'

const GITHUB_RELEASE_API = 'https://api.github.com/repos'

/**
 * Turn a GitHub origin URL into its stable-release API endpoint. Non-GitHub
 * remotes deliberately return null: a release channel must never guess an
 * unrelated download source.
 */
export function latestReleaseApiUrl(originUrl: string | null | undefined): string | null {
  const canonical = canonicalGitHubRemote(originUrl)
  const match = /^github\.com\/([^/]+)\/([^/]+)$/i.exec(canonical)

  return match ? `${GITHUB_RELEASE_API}/${match[1]}/${match[2]}/releases/latest` : null
}

/** Git accepts broad ref names, but reject empty/whitespace values returned by
 * a malformed API response before handing one to the updater. */
export function isUsableReleaseTag(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && !/[\s\0]/.test(value)
}

export async function fetchLatestReleaseTag(apiUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(apiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Hermes-Desktop-Updater'
    },
    signal: AbortSignal.timeout(10_000)
  })

  if (!response.ok) {
    throw new Error(`GitHub release check failed (${response.status}).`)
  }

  const payload = (await response.json()) as { tag_name?: unknown }

  if (!isUsableReleaseTag(payload.tag_name)) {
    throw new Error('GitHub returned a release without a valid tag.')
  }

  return payload.tag_name
}
