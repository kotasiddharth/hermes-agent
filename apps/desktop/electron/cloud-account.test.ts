import assert from 'node:assert/strict'

import { test } from 'vitest'

import { trimCloudAccountIdentity } from './cloud-account'

test('projects only the Portal user identity fields', () => {
  const identity = trimCloudAccountIdentity({
    billing: { balance: 42 },
    user: { display_name: 'Ada Lovelace', email: 'ada@example.test', token: 'never-expose-me' }
  })

  assert.deepEqual(identity, { displayName: 'Ada Lovelace', email: 'ada@example.test' })
  assert.deepEqual(Object.keys(identity).sort(), ['displayName', 'email'])
})

test('supports legacy profile shapes and whitespace-only fields', () => {
  assert.deepEqual(
    trimCloudAccountIdentity({
      profile: { fullName: '  Grace Hopper  ', emailAddress: ' grace@example.test ' },
      user: { display_name: ' ' }
    }),
    { displayName: 'Grace Hopper', email: 'grace@example.test' }
  )
})

test('returns null identity fields for an unknown account payload', () => {
  assert.deepEqual(trimCloudAccountIdentity({ user: { id: 'user_123' } }), { displayName: null, email: null })
  assert.deepEqual(trimCloudAccountIdentity(null), { displayName: null, email: null })
})
