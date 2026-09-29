# 37 — security-auditor — re-review of fix commits 990441d, 4d578b6 (saved by coordinator)

FINDINGS: 0 blocker, 0 major, 2 minor (new). SEC-1..7 closed; SEC-8 accepted; SEC-9 open → S7.

| id | status | note |
|---|---|---|
| SEC-1..7 | closed | target check on every edit/deactivate/QR (under lock), audit rows without secrets, refresh tokens revoked on password/method change + deactivation, last-admin check in tx with FOR UPDATE |
| SEC-8 | accepted | 2 s cache, invalidate after commit |
| SEC-9 | open → S7 | legacy /pages*, /permissions* routes |
| SEC-10 | minor, new | authService.refresh runs outside the revocation tx → ms window where a refresh racing a password reset keeps a session. Accept, or re-check active + password-version before storeRefreshToken |
| SEC-11 | minor, new | employeeService.regenerateQr gives a password-method employee a QR credential. QR login route doesn't exist yet (BL-017). Fix: 400 unless login method is qr |

Also verified: refresh rotation atomic (DELETE … RETURNING); role guards under row lock, consistent lock order; actor.email from DB. Frontend 4d578b6: no security impact.
