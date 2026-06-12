interface OAuthClient {
  client_type: number
  client_id: string
}

interface GoogleServicesJson {
  client?: Array<{ client_info?: unknown; oauth_client?: OAuthClient[] }>
}

export function extractWebClientId(googleServicesJson: string): string | undefined {
  try {
    const parsed = JSON.parse(googleServicesJson) as GoogleServicesJson
    for (const client of parsed.client ?? []) {
      for (const oauthClient of client.oauth_client ?? []) {
        // client_type 3 = web client
        if (oauthClient.client_type === 3) {
          return oauthClient.client_id
        }
      }
    }
  } catch {
    // ignore parse errors
  }
  return undefined
}
