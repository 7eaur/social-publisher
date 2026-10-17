# Sensitive configuration via administrator UI

No user should need to put Telegram sessions, Telegram API hash or Meta page token in a git repository, CI variable or chat.

## Installation-bound secrets
The deployment must still provision `DATABASE_URL`, `APP_ORIGIN`, `LOGIN_THROTTLE_PEPPER` and `SECRETS_ENCRYPTION_KEY` through an external secret manager. The encryption key MUST NOT be saved in the database it decrypts. A one-time administrator bootstrap is still required; live deployment is not approved.

## Admin setup workflow
- Create a source/destination as an inactive draft.
- Use the account/Telegram credential form under the logged-in dashboard. Submit over HTTPS only in production with HttpOnly session cookie, same-origin validation, fresh CSRF and ADMIN RBAC.
- Telegram form accepts API ID, API hash and an already-authorized session value for the approved account. Real interactive MTProto authorization/OTP is NOT implemented here.
- Meta form accepts an existing authorized account access token. OAuth acquisition, refresh, permission checks, app review and expiry handling are NOT yet implemented.
- Each secret is bound to its database entity with AES-256-GCM and encrypted with the installation key; all metadata GET endpoints expose booleans ONLY, never raw values or ciphertext.
- Replacing or revoking credentials disables the affected source/destination and its routes. Saving a token is **not** proof of a valid connection.
- Show missing/secured-but-unverified status separately. No live publishes without tested account ownership, permissions, media and external outcome reconciliation.

## Security caveats
- The GitHub repository currently appears PUBLIC, so ensure it is private before any real deployment operational details; never commit any secrets even in a private repository.
- Admin login, TLS proxy settings, distributed throttling, encryption key rotation, logout revocation, audit and access controls require full staging/security review before publishing.
- Do not expose sessions in logs, errors, page HTML, browser localStorage or API responses.
