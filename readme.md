# Money OS — Personal Money Management App

Master prompt / product & architecture spec for this project. This document is the source of truth for scope, architecture, and constraints when implementing the app.

## Stack

- MongoDB, Express.js, React.js, Node.js
- Capacitor (Android/iOS/Web from one React codebase)
- TypeScript
- REST API
- JWT/session-based authentication
- Secure local storage
- Offline-first architecture

Personal-use app, but built to production quality — no artificial premium gating, no fake features.

## 1. Main Objective

Manage bank accounts, UPI/payment accounts, Google Pay–related info where officially accessible, cash, credit cards, investments, loans, income, expenses, transfers, budgets, savings goals, bills, subscriptions, net worth, and financial analytics.

**Core requirement: automatic transaction/data fetching** wherever technically and legally possible via an official API, banking integration, Account Aggregator framework, open-banking provider, or other authorized integration.

Hard rules:
- No fake banking integration, no scraping banking websites, no reverse-engineered private APIs.
- Never request or store: UPI PIN, ATM PIN, CVV, internet banking password, OTP, card PIN, banking login password.
- Never store sensitive authentication credentials in MongoDB.
- If a provider requires auth, redirect to the provider's official secure authorization flow.

## 2. Google Pay / UPI Integration

Verify what's officially supported before promising it — do not claim direct GPay transaction sync unless a real public API provides it. If it doesn't, implement legitimate alternatives instead:

1. Supported UPI/banking integration
2. Account Aggregator integration
3. Open-banking provider
4. Bank transaction API
5. Statement import
6. Notification-based transaction detection (only if platform-permitted and secure)
7. Manual/CSV/PDF fallback

Provider abstraction: `FinancialDataProvider` interface implemented by `GooglePayProvider`, `BankProvider`, `AccountAggregatorProvider`, `CSVProvider`, `PDFStatementProvider`, etc.

## 3. Bank Account Auto-Sync

```
User → Money Management App → Financial Provider → Official bank/AA authorization
     → Bank → Transactions/accounts → Financial Provider → Backend → MongoDB
```

Never ask for bank passwords in-app. Use OAuth/token-based auth. Store minimum necessary data. Encrypt provider tokens.

## 4. Account Management

Types: savings, current, salary, credit card, cash wallet, UPI, investment, loan, FD, RD, custom.

Fields: account ID, user ID, name, institution, type, masked account number, IFSC, currency, balance, available balance, credit limit, last synced, provider, sync status, created/updated dates. Never expose full account numbers unnecessarily.

## 5. Automatic Synchronization

Initial/manual/automatic/background sync, sync status, last-synced time, sync errors, duplicate detection, transaction reconciliation, balance reconciliation. Idempotent sync using provider transaction IDs — no duplicates on repeated sync.

## 6. Transaction Management

Types: expense, income, transfer, refund, investment, loan payment, credit card payment, interest, cashback, fee, adjustment.

Fields: amount, currency, date/time, description, merchant, category, subcategory, account, type, provider, provider transaction ID, notes, tags, optional location, recurring status, imported/automatic/manual status.

## 7. Automatic Categorization

Rule engine: merchant → normalization → category rules → user rules → optional ML/AI categorization → final category. User can override; overrides become remembered rules.

## 8. Duplicate Detection

Compare provider transaction ID, account ID, amount, date, merchant, reference number, transaction hash.

## 9. Dashboard

Net worth, total balance/assets/liabilities, monthly income/expense, savings & savings rate, credit card outstanding, loan outstanding, investments, upcoming bills, recent transactions. Charts: income vs expense, spending by category, monthly cash flow, net worth history, account balances, investment allocation, budget utilization.

## 10. Net Worth

Net Worth = Total Assets − Total Liabilities. Assets: bank accounts, cash, investments, FDs, other. Liabilities: credit cards, loans, other debts. Historical graph.

## 11. Budget System

Category budgets (period-based), spent/remaining/% used, alerts at 50/75/90/100%, rollover budgets.

## 12. Savings Goals

Target amount, current amount, remaining, target date, required monthly savings, progress %.

## 13. Bills & Subscriptions

Recurring schedule, due dates, notifications, auto-detection where possible, upcoming payment calendar, monthly/yearly cost totals.

## 14. Credit Card Management

Credit limit, available credit, outstanding, statement date, due date, minimum due, total due, utilization %, payments, rewards/cashback. Alert on high utilization.

## 15. Loan Management

Amount, interest rate, EMI, tenure, remaining principal, next payment, start/end date. Amortization schedule with principal/interest/total paid/remaining breakdown.

## 16. Investment Management

Stocks, mutual funds, ETFs, gold, FDs, other. Track invested value, current value, P/L, return %, allocation. Extensible market-data provider architecture — no hardcoded fake prices.

## 17. Financial Analytics

Daily/weekly/monthly/yearly spending, category trends, merchant trends, income trends, savings rate, cash flow, net worth, account/credit utilization, investment allocation. Ranges: 7d/30d/3m/6m/1y/all-time.

## 18. Financial Insights

Intelligent insights engine (e.g. "food spending up 23% vs last month"). Clearly distinguish analytics from financial advice — never present as guaranteed investment advice.

## 19–20. Search & Filters

Global search across merchant, amount, category, account, date, notes, tags, transaction ID. Multi-filter support: date, account, category, type, amount, merchant, income/expense, automatic/manual.

## 21. Import System

CSV / Excel / bank statement PDF pipeline: upload → parse → normalize → detect transactions → categorize → detect duplicates → preview → confirm → save. Never insert imported data without validation.

## 22. Export

CSV, Excel, PDF. Reports: monthly/yearly financial report, expense report, income report, net-worth report, tax-related transaction report.

## 23. Mobile App

Capacitor-based, single React codebase for Web/Android/iOS. Plugins: secure storage, biometrics, notifications, camera, file picker, share, network status, app lifecycle, local database.

## 24. Biometric Security

Fingerprint/Face ID/device biometrics with PIN fallback. Auto app-lock after configurable inactivity.

## 25. Offline-First

Core functionality works offline: view/add/edit accounts, transactions, budgets, goals. On reconnect: local changes → sync queue → backend → MongoDB, with conflict resolution.

## 26. Notifications

Upcoming bills, budget limits, credit card due date, loan EMI, savings goals, sync errors/completion, unusual spending. Configurable settings.

## 27. Security

HTTPS, secure auth, password hashing, JWT/refresh token rotation, rate limiting, Helmet, CORS, input validation, MongoDB sanitization, XSS/CSRF protection, encryption for sensitive data, secure cookies, audit logging.

Never log: passwords, OTP, UPI PIN, CVV, access/refresh tokens, banking credentials.

## 28. Database (MongoDB collections)

users, accounts, transactions, categories, budgets, budgetItems, goals, recurringTransactions, subscriptions, creditCards, loans, investments, investmentTransactions, financialConnections, syncJobs, syncTransactions, notifications, imports, auditLogs, userRules.

Index: userId, accountId, transactionDate, providerTransactionId, merchant, category.

## 29. API Architecture (REST)

```
POST /api/auth/register|login|refresh|logout
GET  /api/dashboard
GET/POST/PUT/DELETE /api/accounts[/:id]
GET/POST/PUT/DELETE /api/transactions[/:id]
POST /api/sync
GET  /api/sync/status
GET/POST /api/budgets
GET/POST /api/goals
GET  /api/analytics
GET  /api/net-worth
GET  /api/bills
GET  /api/subscriptions
GET  /api/credit-cards
GET  /api/loans
GET  /api/investments
POST /api/import
GET  /api/export
```

## 30–31. Provider Abstraction & Config

`FinancialDataProvider`: `connect()`, `authorize()`, `getAccounts()`, `getBalances()`, `getTransactions()`, `refresh()`, `disconnect()`, `getConnectionStatus()`. Adapters: `AccountAggregatorProvider`, `BankProvider`, `UPIProvider`, `StatementProvider`. App must not be hardcoded to one provider.

Env vars: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `PROVIDER_CLIENT_ID`, `PROVIDER_CLIENT_SECRET`, `PROVIDER_REDIRECT_URI`. Never commit secrets — ship `.env.example` only.

## 32–33. UI/UX

Clean, minimal, professional, fast, responsive, mobile-first. Screens: splash, onboarding, login/register, dashboard, accounts (+details), transactions (+details/add), budgets (+details), goals, bills, subscriptions, credit cards, loans, investments, analytics, net worth, reports, import, settings, security, connected accounts. Reusable components, consistent design system. Light/dark/system theme, persisted.

## 34. Performance

Optimized queries/indexes, efficient React rendering, chart performance, paginated/virtualized large lists, caching, lazy loading.

## 35. Error Handling

Centralized backend error handling, useful frontend messages, no stack traces or secrets exposed to users, safe logging practices for a financial app.

## 36. Testing

Unit, API, integration tests covering auth, transactions, sync, deduplication, budgets, and financial calculations (e.g. income ₹50,000 − expenses ₹30,000 = savings ₹20,000, 40% savings rate). Careful rounding/currency handling.

## 37. DevOps

`Dockerfile`, `docker-compose.yml` (frontend/backend/mongodb services), `.env.example`, `README.md`, dev and prod configs.

## 38. Project Output Rules

Build a functioning app, not a mockup. Architect first, then implement module-by-module, keeping it runnable after each stage. Every feature needs frontend + backend + DB + API + validation + error handling + loading/empty states + security. No fake buttons for core features. If a real provider's credentials aren't available, implement the interface plus a clearly-labeled development-only mock adapter — never claim mock data is real banking data.

## 39. Banking Rule (hard constraint)

Never obtain bank/Google Pay credentials via browser automation, password scraping, reverse engineering, unofficial private APIs, credential harvesting, accessibility abuse, or OTP interception. Only authorized mechanisms. If automatic Google Pay transaction retrieval isn't available via an official API, say so plainly and implement the strongest legitimate alternative instead.

## 40. Personal Use Mode

Toggle that enables: no unnecessary public profile, minimal data collection, local-first operation, strong app lock, encrypted sensitive data, easy backup/restore, full data export, full account deletion.

## 41. Data Backup

Encrypted backup/export/import/restore so financial data survives a reinstall.

## 42. Final Quality Bar

Feel like a polished premium personal-finance product. Prioritize security, correct financial math, reliable sync, UX, offline capability, performance, maintainability, scalability. No fabricated integrations, financial data, or API capabilities. For every external provider, document: what API/provider is required, what data it provides, what credentials it needs, what's stored, what's never stored, how authorization works, and the fallback if the provider is unavailable.

Build so a real supported financial provider can be connected without rewriting the core app.

## Build Order

1. Folder structure, DB schema, API architecture, provider abstraction, auth architecture, UI design system.
2. Implement module-by-module, keeping the project runnable after every major stage.

## Mobile / Capacitor — current status

Native projects are already scaffolded (`frontend/android/`, `frontend/ios/`, gitignored — regenerate anytime with `npm run cap:sync` after `npx cap add android`/`ios`). What's been verified on this machine, and what's genuinely blocked:

**Android — ✅ VERIFIED, real build succeeds.** A JDK 17 (Eclipse Temurin, via `winget install EclipseAdoptium.Temurin.17.JDK`) and the Android SDK (command-line tools + `platform-tools` + `platforms;android-34` + `build-tools;34.0.0`, via `sdkmanager`) were installed on this machine, and `cd frontend/android && ./gradlew.bat assembleDebug` produces a real, valid, correctly-signed `app-debug.apk` (`com.moneyos.app`, "Money OS", compileSdk/targetSdk 34, minSdk 22 — verified with `aapt dump badging`). To reproduce:
1. Install a JDK 17 and point `JAVA_HOME` at it.
2. Install the Android SDK (Android Studio, or standalone `sdkmanager`) with `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`; point `frontend/android/local.properties`'s `sdk.dir` at it (this file is machine-specific and gitignored).
3. `npm run cap:android` (builds the web app, syncs, opens Android Studio) or `cd frontend/android && ./gradlew.bat assembleDebug` directly for a CLI build.

**Android emulator — ✅ VERIFIED, real device-level runtime testing done.** With the user's explicit permission (a system-level, restart-required change), Windows Hypervisor Platform was enabled and an AVD (`system-images;android-34;google_apis;x86_64`, Pixel 6) was created and booted headless (`emulator -avd moneyos_test -no-window -no-audio -gpu swiftshader_indirect`). The real `app-debug.apk` was installed via `adb install`, launched, driven through actual UI taps (`adb shell input`), and inspected via real screenshots (`adb shell screencap` + `adb pull`) — not simulated. This surfaced and led to fixing three genuine runtime bugs that no amount of unit/integration testing could have caught, since they only manifest inside an actual native WebView:

1. **Mixed-content blocking silently broke every API call.** The WebView loads the app over `https://localhost` (Capacitor's scheme); any `fetch()` to a plain `http://` API (e.g. a local dev backend) was blocked by the WebView's own Chromium mixed-content policy — a separate, stricter check than the OS-level cleartext-traffic policy (`network_security_config.xml` alone does not fix this). Fixed in `MainActivity.java`: `WebSettings.setMixedContentMode(MIXED_CONTENT_ALWAYS_ALLOW)`, gated behind `BuildConfig.DEBUG` so a release build (which must point at a real `https://` API) stays fully blocked. Required enabling `buildFeatures.buildConfig true` in `app/build.gradle` since AGP no longer generates `BuildConfig` by default.
2. **CORS blocked the native origin.** The backend's `CORS_ORIGIN` was a single hardcoded value (`http://localhost:5173`, the web dev server) — every native request (origin `https://localhost` on Android, `capacitor://localhost` on iOS) was rejected before reaching a route. Fixed: `CORS_ORIGIN` is now comma-separated (`backend/src/config/env.ts`, `backend/src/app.ts` now does a real origin-allowlist check instead of a single string compare), defaulting to include both native origins alongside the web one.
3. **A false "you're offline" banner, verified via real device testing.** `@capacitor/network`'s `connected` field requires Android's `NET_CAPABILITY_VALIDATED` — a successful OS-level ping to a generic external endpoint (e.g. Google's) — which can be false even when the app's own API is fully reachable (a captive portal, a restrictive/firewalled network, a LAN-only backend — exactly what happened on this emulator). Fixed in `useOnlineStatus.ts`: now keys off `connectionType !== "none"` (interface presence, set independently of validation), matching the same semantics `navigator.onLine` already uses on web.

A fourth issue found the same way — the permanent 220px-wide left-rail sidebar overlapping/clipping on a phone-width viewport (flexbox compressing a fixed-width sidebar with no `flexShrink: 0`) — was fixed by making the sidebar a proper collapsible drawer below 768px (`hooks/useIsMobile.ts`, `Sidebar.tsx`, `AppShell.tsx`), with a hamburger toggle and backdrop, verified via screenshot: full nav renders correctly, backdrop-tap-to-close works, and real navigation between pages (confirmed via a login → Dashboard → Reports round trip with live data) works end to end.

All four fixes are covered by new/updated tests (`useOnlineStatus.test.ts`, `AppShell.test.tsx`) — 41/41 frontend, 65/65 backend passing after the changes — and by the real emulator screenshots above, not just green tests.

**Release signing — ✅ done, with your explicit go-ahead.** A real release keystore was generated (`keytool -genkeypair`, RSA 2048, valid until 2056) at `frontend/android/moneyos-release-key.jks`, with credentials in `frontend/android/keystore.properties` — both gitignored (the whole `android/` directory is excluded repo-wide). `app/build.gradle` loads them into a `signingConfigs.release` block, applied to the `release` build type only if `keystore.properties` exists, so a machine without the key still builds a plain (unsigned) release/debug APK instead of failing. `./gradlew.bat assembleRelease bundleRelease` produces a real signed `app-release.apk` and `app-release.aab`; both verified independently — `apksigner verify --print-certs` on the APK and `jarsigner -verify` on the AAB ("jar verified.") — confirming the actual release key's certificate, not a placeholder.

> ⚠️ **`moneyos-release-key.jks` and `keystore.properties` are the only copy of this signing key, and they are gitignored — nothing backs them up.** Losing this file means losing the ability to ever publish another update to this app's Play Store listing under the same package; the passwords are also plaintext in `keystore.properties`. Back both up somewhere secure (a password manager, an encrypted archive) immediately, outside this machine/session, and do not commit them.

What hasn't been done: registering/creating the actual Play Console app listing and uploading the AAB (a Google Play Console account + one-time developer registration fee, and store-listing assets — screenshots, description, privacy policy — that only you can provide), and pointing the release build at a real deployed production API (it still defaults to `http://localhost:4000/api`, since no production backend has been deployed — the release build/signing itself is real and independently verified, but the packaged app has nothing live to talk to until a real API is hosted somewhere with a real domain/HTTPS certificate).

**iOS** — `npx cap add ios` scaffolded a real Xcode project (`frontend/ios/App/`), but `pod install` and `xcodebuild` were both skipped because neither CocoaPods nor Xcode exist on Windows. iOS builds require an actual Mac with Xcode + CocoaPods — there is no workaround for this on Windows; it is an Apple platform requirement, not a missing package, and no engineering effort inside this repository can change that.

**Native plugins wired so far**: `@capacitor/preferences` for token storage — real, compiled, build-verified (see `frontend/src/native/tokenStorage.ts`). On native platforms, the JWT access/refresh tokens are stored via `@capacitor/preferences` (UserDefaults on iOS / SharedPreferences on Android — sandboxed per-app OS storage), not raw `localStorage`; web still uses `localStorage` as the only browser-available option. An in-memory cache in `api/client.ts` keeps every existing call site synchronous, populated once at app startup by `hydrateTokens()` (awaited by `AuthContext` before `RequireAuth` renders anything, so a returning user doesn't flash the login page). Note `@capacitor/preferences` is unencrypted platform storage, not secure-enclave-backed — a real step up from `localStorage` on native, but not full encryption-at-rest; `capacitor-secure-storage-plugin` (Keychain/Keystore-backed) would be the next step if that's required.

`capacitor-native-biometric` + `@capacitor/app` for a real biometric app-lock — real, compiled, build-verified. `frontend/src/native/biometrics.ts` wraps `isAvailable()`/`verifyIdentity()`; `frontend/src/native/appLifecycle.ts` wraps `App.addListener("appStateChange", ...)`; `frontend/src/security/AppLockGate.tsx` wraps the whole app shell and, after the app returns from the background past a user-configured timeout, shows a real lock screen gated on the OS's actual fingerprint/Face ID/device-passcode prompt — never a fake check. It only ever activates when `Capacitor.isNativePlatform()` is true AND the device itself reports biometric hardware present; on web, or on a device with no biometric hardware, it is fully transparent and the existing JWT session is the only gate, with an honest message to that effect in Settings. Configurable in `SettingsPage.tsx` (enable toggle + lock-after timeout). Rebuilding the APK after adding both plugins grew it from 3.96MB to 7.08MB and `aapt dump badging` now lists `USE_BIOMETRIC`/`USE_FINGERPRINT` permissions with the `androidx.biometric` library bundled — confirmed via `unzip -l app-debug.apk | grep biometric`. 5 new Vitest tests cover: web/no-op transparency, lock-after-timeout-when-enabled-and-available, no-lock-when-disabled, no-lock-with-no-hardware, and the unlock/retry-on-failure flow (mocking `onAppStateChange`/`isBiometricAvailable`/`verifyBiometric` — real device biometric prompts can't be exercised outside a physical device/emulator).

`@capacitor/local-notifications` for real bill-due reminders — real, compiled, build-verified, and wired into an actual feature: `BillsPage.tsx` calls `syncBillReminders()` (in `frontend/src/native/notifications.ts`) after every bill list refresh, scheduling one OS-level notification per active bill at `dueDate - reminderDaysBefore`, cancelling it if the bill becomes inactive or the reminder time has already passed. No-ops on web / without notification permission — best-effort, never blocks the UI.

`@capacitor/network` — real, compiled, build-verified, and wired into `frontend/src/offline/useOnlineStatus.ts` (the hook the offline banner and outbox sync already depend on): on native it now queries `Network.getStatus()`/`networkStatusChange` instead of WebView `navigator.onLine`/online/offline events, which are known to be unreliable inside a WebView; web keeps the original browser-event path unchanged.

`@capacitor/camera` — real, compiled, build-verified (`frontend/src/native/camera.ts`, wrapping `getPhoto()`/`checkPermissions()`). Not yet wired to a UI feature — there is no receipt-capture feature in the app to attach it to yet; wiring it in would mean building a new receipt-attachment feature (storage, backend model, UI), which is new scope beyond exposing the plugin itself.

`@capacitor/share` + `@capacitor/filesystem` — real, compiled, build-verified, and wired into both real export/download flows: `downloadBackup()` (`api/backup.ts`) and `downloadExport()` (`api/importExport.ts`) now call `saveAndShareFile()` (`frontend/src/native/fileExport.ts`) first, which writes the downloaded blob to the app's cache dir and opens the native OS share sheet — the `<a download>` anchor-click pattern used on web does not reliably trigger a file download inside an Android/iOS WebView, so this is a real correctness fix for native, not just a decorative addition. Falls back to the original web download-link code when not running natively.

Rebuilding the APK after adding all five plugins (`local-notifications`, `camera`, `filesystem`, `network`, `share`) on top of the biometric+preferences build grew it from 7.08MB to 7.71MB; `npx cap sync android` reports all 8 plugins found, and `./gradlew.bat assembleDebug` succeeds cleanly with the manifest correctly gaining `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, and `ACCESS_NETWORK_STATE` permissions (the camera plugin adds no permission on Android — it delegates to the system camera app via an intent `<queries>` entry, by design).

`@capacitor/camera` — now fully wired, real feature, real build: `capturePhoto()` (`frontend/src/native/camera.ts`, resolution capped at 1600px so the encoded photo fits the upload limit below) is called from `TransactionsPage.tsx`'s "Add receipt" button when running natively; on web it falls back to a real `<input type="file" accept="image/*" capture="environment">`, which opens the same camera/gallery picker in a mobile browser. Either path runs the image through `frontend/src/utils/imageCompress.ts` (canvas-based downscale + progressive JPEG re-encode) before upload — a raw phone photo is routinely 3-10MB, well over the cap. Backend: `PUT /api/transactions/:id/receipt` / `DELETE /api/transactions/:id/receipt` (`backend/src/controllers/transactions.controller.ts`), storing the image as a `data:` URL directly on the transaction document, capped at ~2.2MB binary (3,000,000 base64 chars) via a Zod regex that also allowlists only `image/jpeg|png|webp` mime prefixes — stops a non-image payload (e.g. `data:text/html`) from ever being stored and later rendered back as an `<img src>`. The app-wide JSON body limit was raised from 1mb to 4mb to accommodate this (every other endpoint's body stays far smaller than that). Verified: a new backend test (attach/fetch/remove, rejects a non-image mime type, cross-user isolation — 65/65 backend tests passing) and a new frontend test exercising the real web file-picker fallback end-to-end (38/38 frontend tests passing), plus a live curl smoke test against the freshly-rebuilt Dockerized backend (attach → fetch → delete, each confirmed by response body). Android rebuild after wiring this in: `BUILD SUCCESSFUL`, all 8 plugins still linking.

## Production Deployment

Everything in this section is real, verified code/config — not a claim that the app is actually deployed anywhere. No domain, hosting account, or managed database has been provisioned; that requires you to create accounts and provide credentials (see "What you need to provide," below).

### What was audited and fixed

A full repo audit for hardcoded localhost/dev-only assumptions found and fixed:

1. **No `trust proxy` setting.** Any real host (Render, Railway, Fly.io, a self-hosted Nginx/Caddy) puts the app behind one reverse-proxy hop, which rewrites the real client IP into `X-Forwarded-For`. Without `app.set('trust proxy', 1)`, `express-rate-limit` keys every request off the proxy's own IP — one shared bucket for every user. Fixed in `backend/src/app.ts`, applied only when `NODE_ENV=production`.
2. **CORS rejection returned a bare `Error`** (500, "Internal server error") instead of a proper 403. Fixed to throw `HttpError(403, ...)`, with a new regression test (`backend/tests/cors.test.ts`) proving: the real production frontend origin is allowed, both native origins (`https://localhost` Android, `capacitor://localhost` iOS) are allowed, and a random unconfigured origin gets 403 with no CORS header at all.
3. **`.gitignore` only excluded the exact filename `.env`**, not `.env.production` or any other variant — a real secret file could have been committed by accident. Fixed to `.env.*` with `!.env.*.example` re-included.
4. **Both Dockerfiles were dev-only** (`npm run dev`, full devDependencies, no build step) — fine for local docker-compose, wrong for anything meant to actually run in production. Added `backend/Dockerfile.prod` (multi-stage: compiles TypeScript, ships only production dependencies) and `frontend/Dockerfile.prod` (multi-stage: builds the Vite SPA, serves the static output via nginx with SPA-fallback routing) — both built and verified locally this session.
5. **The Android release build had no guard against shipping a broken API URL.** The signed release AAB built in an earlier session still had `http://localhost:4000/api` baked into its JS bundle — confirmed by unzipping the APK and grepping the bundle. Vite bakes `VITE_API_URL` in at build time; there's no way to fix this after the fact short of rebuilding. Added `frontend/scripts/verify-release-api-url.js` and a `npm run cap:sync:release` script that refuses to proceed (exit 1) if `VITE_API_URL` is unset, not `https://`, or looks like a local/dev address (`localhost`, `127.0.0.1`, `10.0.2.2`, `0.0.0.0`) — verified against all of those rejection cases plus the acceptance case.
6. **`FinancialConnection.encryptedCredentials`** is explicitly commented "must always be encrypted at rest," and `ENCRYPTION_KEY` is required at startup — but neither is actually consumed anywhere in the codebase yet (no live provider integration exists to populate that field). Not a live vulnerability (nothing is stored there today, so nothing is stored in plaintext either), but flagged here so it isn't mistaken for a working encryption-at-rest implementation — the real encrypt/decrypt wiring is part of the (still 🔴-blocked) real Account Aggregator integration work, not something addressable now.

### Verified against a real production-mode container (not just claimed)

Built `backend/Dockerfile.prod` and ran it standalone with `NODE_ENV=production`, a real MongoDB container, freshly-generated random JWT/encryption secrets, and a production-shaped `CORS_ORIGIN` (a fake domain + both native origins) — then hit it directly with curl to confirm every API-dependent feature the checklist asked for actually works under that configuration, not just in dev/test mode:

- **CORS**: the configured frontend origin and both native origins get `200` + a correct `Access-Control-Allow-Origin`; a random origin gets `403` with no CORS header.
- **Auth**: register → login → refresh (confirmed refresh-token rotation is real: reusing a register-issued refresh token after a subsequent login correctly fails, since login issues a new one).
- **Receipts**: attach a real base64 PNG to a transaction, confirmed `receiptImage` round-trips.
- **Export**: `GET /api/export/transactions?format=csv` returns real CSV content.
- **Backup**: `GET /api/backup` returns a real structured JSON snapshot of the account/transaction data just created.
- **Notifications**: `GET /api/notifications` returns the correct shape.

Backend: 69/69 tests pass (65 + 4 new CORS tests). Frontend: 41/41. Both `npm run build`s clean. Cleaned up all smoke-test containers/images afterward.

### Recommended hosting (a recommendation, not a deployment — no accounts exist)

**Backend + database — a managed PaaS is the practical choice for a project this size:**
- **Render**, **Railway**, or **Fly.io** — point at this repo (once it's a real git repo — see blockers below), set `Dockerfile.prod` as the build target (or let their Node buildpack run `npm run build && npm start`), and set the environment variables from `backend/.env.production.example` in the platform's secret/env dashboard. All three provision HTTPS automatically for their subdomain, and a custom domain is a DNS record away.
- **MongoDB Atlas** (free/shared tier is enough to start) for the database — managed backups and failover that a bare Docker volume on one VPS doesn't give you.
- Self-hosting alternative: `docker-compose.prod.yml` + `Caddyfile` in this repo build the real production images and front them with Caddy for automatic Let's Encrypt HTTPS on a plain VPS (DigitalOcean, Hetzner, etc.) — a legitimate option if you'd rather not depend on a PaaS, at the cost of you managing the server yourself.

**Frontend (web):** a static host — **Vercel**, **Netlify**, or **Cloudflare Pages** — is simpler and cheaper than running `frontend/Dockerfile.prod`'s nginx container for a plain Vite SPA; set `VITE_API_URL` as a build-time environment variable pointing at the deployed backend's real HTTPS domain. The nginx Docker path stays available for self-hosting frontend alongside backend on the same VPS.

### Exact steps once you have a domain + hosting account

1. Provision the backend host and MongoDB Atlas cluster; copy `backend/.env.production.example` to real values in the host's env/secret dashboard (never commit them) — real random `JWT_SECRET`/`JWT_REFRESH_SECRET`/`ENCRYPTION_KEY` (e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`), the real Atlas connection string, and `CORS_ORIGIN` including your real frontend domain plus `https://localhost,capacitor://localhost`.
2. Deploy the backend (PaaS build from `Dockerfile.prod`, or `docker compose -f docker-compose.prod.yml up -d --build` on a VPS with `DOMAIN`/`MONGODB_URI`/secrets set).
3. Deploy the frontend to your static host with `VITE_API_URL=https://<your-backend-domain>/api` set as a build-time env var.
4. Rebuild the signed Android release pointed at the real API:
   ```
   cd frontend
   VITE_API_URL=https://<your-backend-domain>/api npm run cap:sync:release
   cd android
   ./gradlew.bat bundleRelease assembleRelease
   ```
   This reuses the existing signing key (`frontend/android/moneyos-release-key.jks` — already generated, signed, and verified; do not regenerate it) and refuses to build if `VITE_API_URL` is missing, non-HTTPS, or looks like a dev address.
5. Verify the rebuilt AAB has no localhost baked in: `unzip -o app-release.apk -d /tmp/check && grep -r "localhost" /tmp/check/assets/public/assets/*.js` should find nothing.
6. Upload `app-release.aab` to your Play Console listing.

### What you need to provide (exact blockers, nothing fakeable past this point)

- A **domain name** for the backend (and, if self-hosting the frontend too, one for that).
- A **hosting account** for the backend (Render/Railway/Fly.io/a VPS provider) and, separately, real database credentials (a **MongoDB Atlas** account, or your own managed Mongo).
- A **static hosting account** for the frontend (Vercel/Netlify/Cloudflare Pages) if not self-hosting it.
- A **Google Play Console developer account** (one-time registration fee) plus store-listing assets (screenshots, description, privacy policy) — needed before `app-release.aab` can actually be published, separate from the signing that's already done.
- This repository is **not currently a git repository** (no `.git` directory, no CI workflows beyond a stray `copilot-instructions.md`) — most PaaS deploy flows expect to build from a git push (typically GitHub). `git init` + pushing to a remote is a prerequisite for the PaaS path above, and is itself worth confirming with you before I do it, since it's the kind of action with a lasting effect (repo history starts from here) rather than a pure local build/config step.

None of the above can be done from inside this environment — they require you to create accounts, choose a domain, and hand back the resulting credentials/URLs, at which point I can wire them in and do a final real-domain verification pass.

## Statement import — current status

**CSV**: fully supported. Maps common column names (Date, Description/Narration, Amount or separate Debit/Credit columns); every row goes through preview → categorization suggestion → duplicate detection → explicit user confirmation before anything is saved.

**PDF**: real, working, generic text-based parser (`backend/src/services/pdfImport.service.ts`, using `pdf-parse`) — not a bank-specific layout parser. It extracts text and applies a line heuristic: a leading date, a trailing amount with an explicit `Dr`/`Cr` marker, description in between. A line without a clear Dr/Cr marker is flagged as low-confidence rather than guessed. Real limitations, not glossed over: it cannot read scanned/image-only PDFs (no OCR), multi-line transaction rows, or statements whose layout puts the amount somewhere other than the end of the line. Bank-specific adapters (for statements this generic parser can't read reliably) would be the natural next step, built against real sample statements per bank.

**Excel import**: not implemented (Excel *export* is). CSV/PDF cover the import path today.
