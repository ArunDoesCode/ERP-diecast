# Auth & roles — assumptions

> Every choice an agent made without the owner, during spec **and** build. Append-only, never renumber.
> Rule for choosing: do what ERPNext / Odoo / SAP do; if they disagree, the stricter one. No option surveys.
> Tag `confirm` = touches money, stock, tax, permissions or what a factory user sees → the owner answers
> yes / no. Rows from the spec phase are listed by name in `OWNER.md` → "Decided for you — please confirm";
> rows from the build are listed in the hand-over. Tag `info` = technical, no answer needed.
> A "no" becomes a card (before freeze) or a normal change request (after).
> Column definitions: `docs/specs/_template/assumptions.md`. Phase = `spec` or `build`.

| Id | Date | Phase | Question | Choice | Source | Tag | Owner answer |
|---|---|---|---|---|---|---|---|
| A-01 | 2026-11-19 | spec | BR-AUTH-27 (#46): what does refresh re-check? | Active flag and "password / login method unchanged since the token was issued", inside the rotation transaction. OWASP: a password change must end every other session | OWASP Session Management Cheat Sheet <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html> | info | — |
| A-02 | 2026-11-19 | spec | BR-AUTH-28 (#47): QR regenerate for a password-method employee? | 400: a credential the employee can't use is not issued. Odoo issues a badge only to employees using kiosk/badge sign-in | benchmark: Odoo employee badge ID <https://www.odoo.com/documentation/17.0/applications/hr/attendances.html> | info | — |
| A-03 | 2026-11-19 | spec | BR-AUTH-29 (#18): what does QR login return and refuse? | The same tokens and body as password login; every failure the same 401 (no hint whether the badge exists); same rate limit. Odoo attendance kiosk signs in by badge scan only for that employee | benchmark: Odoo attendance kiosk <https://www.odoo.com/documentation/17.0/applications/hr/attendances/kiosks.html> | confirm | yes — Arun in chat 2026-11-19 (fix all open issues) |
| A-04 | 2026-11-19 | spec | BR-AUTH-30 (#24): where does the browser keep the access token? | Memory only; the httpOnly refresh cookie restores the session on reload (silent refresh). This is what mature single-page apps do: Auth0 and OWASP advise against localStorage for tokens | Auth0 token storage <https://auth0.com/docs/secure/security-guidance/data-security/token-storage>, OWASP HTML5 Security Cheat Sheet <https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html> | info | — |
| A-05 | 2026-11-19 | build | BR-AUTH-29 (#18): how is the QR token stored? | SHA-256 of a 256-bit random token (one indexed lookup at scan), like the refresh-token hash; QR tokens issued before this change must be regenerated (none in use) | OWASP Password Storage Cheat Sheet (high-entropy tokens need no slow hash) <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html> | info | — |
| A-06 | 2026-11-19 | build | BR-AUTH-27 (#46): how does refresh detect a password / login-method change? | The refresh token carries a `cv` fingerprint (password hash fingerprint, or "qr"); a mismatch → 401. Tokens issued before this release have none, so everyone signs in once after deploy | OWASP Session Management Cheat Sheet | info | — |
| A-07 | 2026-11-19 | spec | BR-AUTH-31 (#49): access-log list payload | Summary line in the list, full before/after on a per-row read; ERPNext Version list shows the doc and time, the diff opens per version | ERPNext Version doctype <https://docs.erpnext.com/docs/user/manual/en/version> | info | — |
