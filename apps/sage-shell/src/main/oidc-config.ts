/** Real Logto deployment inputs (non-secret, spec §1). Public client + PKCE only — no secret by architecture. */
export const OIDC_ISSUER = 'https://dk7z03.logto.app/oidc'
export const OIDC_CLIENT_ID = 'cmg2ty121m1tlsd0fgiuv'
export const OIDC_REDIRECT_URI = 'http://127.0.0.1:3000/callback'
export const OIDC_SCOPES = 'openid profile offline_access urn:logto:scope:organizations'
export const OIDC_DISCOVERY_URL = `${OIDC_ISSUER}/.well-known/openid-configuration`
export const OIDC_LOOPBACK_PORT = 3000
export const OIDC_LOGIN_TIMEOUT_MS = 5 * 60_000
