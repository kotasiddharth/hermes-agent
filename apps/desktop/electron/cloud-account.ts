/**
 * Safe, renderer-facing account projection for the Nous Portal response.
 *
 * The Portal owns the account schema and has evolved it over time. Keep its
 * raw response in the main process and expose only the two fields the desktop
 * needs to identify the signed-in person. This also means an unexpected Portal
 * field can never become renderer-visible by accident.
 */

export interface CloudAccountIdentity {
  displayName: null | string
  email: null | string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function firstText(records: Array<Record<string, unknown> | null>, keys: string[]): null | string {
  for (const record of records) {
    if (!record) {
      continue
    }

    for (const key of keys) {
      const value = record[key]

      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return null
}

/**
 * Normalise the Portal's account response without leaking the complete
 * account/billing payload across the Electron bridge. The canonical response
 * currently nests identity in `user`, while the fallbacks keep this compatible
 * with the Portal's earlier profile/account response shapes.
 */
export function trimCloudAccountIdentity(payload: unknown): CloudAccountIdentity {
  const root = asRecord(payload)
  const user = asRecord(root?.user)
  const profile = asRecord(root?.profile)
  const account = asRecord(root?.account)
  const records = [user, profile, account, root]

  return {
    displayName: firstText(records, ['display_name', 'displayName', 'full_name', 'fullName', 'name', 'username']),
    email: firstText(records, ['email', 'email_address', 'emailAddress'])
  }
}
