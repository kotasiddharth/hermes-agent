import assert from 'node:assert/strict'

import { test } from 'vitest'

import { fetchLatestReleaseTag, isUsableReleaseTag, latestReleaseApiUrl } from './update-release'

test('latestReleaseApiUrl derives the release feed from GitHub SSH and HTTPS origins', () => {
  assert.equal(
    latestReleaseApiUrl('git@github.com:kotasiddharth/hermes-agent.git'),
    'https://api.github.com/repos/kotasiddharth/hermes-agent/releases/latest'
  )
  assert.equal(
    latestReleaseApiUrl('https://github.com/kotasiddharth/hermes-agent.git'),
    'https://api.github.com/repos/kotasiddharth/hermes-agent/releases/latest'
  )
  assert.equal(latestReleaseApiUrl('https://gitlab.com/kotasiddharth/hermes-agent.git'), null)
})

test('fetchLatestReleaseTag returns the GitHub release tag', async () => {
  const tag = await fetchLatestReleaseTag(
    'https://example.test/releases/latest',
    async () => new Response(JSON.stringify({ tag_name: 'v0.17.4' }), { status: 200 })
  )

  assert.equal(tag, 'v0.17.4')
})

test('fetchLatestReleaseTag rejects failed and malformed release responses', async () => {
  await assert.rejects(
    () => fetchLatestReleaseTag('https://example.test/releases/latest', async () => new Response('', { status: 404 })),
    /GitHub release check failed/
  )
  await assert.rejects(
    () =>
      fetchLatestReleaseTag(
        'https://example.test/releases/latest',
        async () => new Response(JSON.stringify({ tag_name: 'not a tag' }), { status: 200 })
      ),
    /valid tag/
  )
  assert.equal(isUsableReleaseTag('v0.17.4'), true)
  assert.equal(isUsableReleaseTag(''), false)
})
