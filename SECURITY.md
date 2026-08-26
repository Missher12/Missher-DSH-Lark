# Security

Please report vulnerabilities privately through GitHub Security Advisories for `Missher12/dsh-lark`. Do not include App Secrets, pairing codes, access tokens, private chat IDs, project paths, or unredacted logs in a public issue.

The supported security boundary is one explicitly paired owner and one exact private chat. Group messages, unpaired identities, unsigned or stale actions, and replayed nonces are rejected before project data is read. App Secrets are write-only to Harness Credentials and are not returned to the browser, plugin state, logs, or cards.

Security reports should include the plugin version, Harness version, operating system, a minimal redacted reproduction, and whether the issue requires a paired owner. Replace every credential or identity value with `[REDACTED_SECRET]` or a one-way digest.
