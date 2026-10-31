# Pantry Guardian

Pantry Guardian is a public, mobile-friendly pantry app designed to keep food from being forgotten, spoiled, or wasted. It combines expiry-first inventory, storage visualization, rescue recipes, food-status history, and a safety-gated community donation board.

Live app: **https://pantry-guardian.ajmillertperez562.chatgpt.site**

## Features

- Add and edit food with a resized device photo, quantity, expiry, price, and exact location
- Mark food available, opened, eaten, consumed, donated, spoiled, or discarded
- See an expiry-prioritized rescue plan and recipe ideas for urgent ingredients
- Customize labeled cabinets and map food into real LG and Samsung refrigerator models, colors, and compartments
- Offer only active, unexpired food expiring within three days in the public pantry
- Ask an OpenAI-powered kitchen copilot questions about the current pantry
- Generate personalized rescue recipes, analyze food and label photos, dictate questions, and listen to answers
- Moderate public donation text before publishing
- Store private pantry state locally in the browser; public donations use Cloudflare D1

## OpenAI integration

All OpenAI calls run in server routes so the API key never reaches the browser.

| Capability | API/model |
| --- | --- |
| Pantry copilot and recipes | Responses API / `gpt-5.6` |
| Food and label photos | Responses API image input |
| Voice entry | `gpt-4o-mini-transcribe` |
| Spoken answers | `gpt-4o-mini-tts` |
| Public listing safety | `omni-moderation-latest` |

AI suggestions are guidance, not a food-safety guarantee. Users are prompted to verify dates, allergens, storage history, and spoilage signs.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Set `OPENAI_API_KEY` in `.env.local`. Never commit a real API key.

## Quality checks

```bash
npm run check
npm test
```

The build targets OpenNext/Vinext on Cloudflare Workers. `.openai/hosting.json` declares the D1 `DB` binding used by the public pantry.

## Architecture

- `app/page.tsx` — responsive pantry experience and browser-local state
- `app/api/ai/*` — authenticated server-to-server OpenAI calls with size and input limits
- `app/api/donations/route.ts` — validated, moderated community donation API
- `lib/openai.ts` — runtime-secret client factory and safe error handling
- `db/` and `drizzle/` — typed D1 schema and migrations
- `scripts/` — isolated install/build and deployable artifact validation

## Privacy and security

- Secrets are runtime environment variables only.
- Photos added to private pantry entries remain in the user’s browser. A photo is sent to OpenAI only when the user explicitly analyzes it; donation photos are published only when the user posts an eligible listing.
- Public inputs have length limits, expiry/status checks, confirmation requirements, and moderation.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).


## Offline operation

Vercel builds with `npm run build:vercel`. After the Next.js build, the offline packager generates a versioned service worker with every page and all compiled assets. Open the production HTTPS URL once and wait for **Offline ready**. Installation on the home screen is optional. Normal pantry operations then use saved pages and device storage automatically. Keep the device powered by its battery or a power bank.

Food, photos, kitchen settings, saved meals, unfinished food/donation forms, copilot prompts, and history save automatically into account-scoped IndexedDB. Earlier browser-storage and IndexedDB records are retained and imported into the guest workspace, choosing the newest timestamp. New account data is never mirrored into global browser-storage keys. The Offline & backups page exports and restores full JSON backups. Guest records are never uploaded. Account changes use a separate pending outbox and require a verified matching signed-in account. Clearing site data removes local data.

Cloud inference, photo recognition, transcription, sign-in, and live community availability require connectivity. Offline copilot guidance uses local pantry rules. Community offers are timestamped snapshots and donation submissions save as drafts when disconnected; drafts require review before public posting.

The built-in offline test blocks same-origin app requests in the service worker and can be ended offline. Cache lifecycle and transport-failure tests run with `node --test tests/offline-worker.test.mjs`. Service workers require HTTPS or a browser-trusted local origin; the HTTP design preview does not provide this capability.


### Account workspaces and concurrent edits

Guest and each verified Google subject have separate local workspaces. On an unavailable identity/backend response, reopening retains the last selected local snapshot. A verified logout or account change switches scopes; requests and editor saves tied to the old account cannot write to the new scope. Backups identify their owner and cannot be imported into a different workspace.

Every local edit uses an atomic IndexedDB read/write transaction with the editor's expected local version. Two tabs editing stale snapshots retain both copies, stop account uploads, and show explicit copy selection with durable backups. BroadcastChannel only announces changes; correctness does not depend on it. Server synchronization uses canonical revisions and idempotent retries, returning both copies on conflict. API, authentication, authorization-bearing requests, and private RSC responses are never stored by the worker. The public cache contains only build-verified static pages and assets with SHA-256 checks.

The Vercel deployment has no configured durable private pantry database, so authenticated account synchronization returns an honest 503 and retains the local outbox. Public donation memory storage is never used to acknowledge private saves. The optional D1 migration `db/migrations/0002_offline_workspaces.sql` is included for a future configured durable deployment and is **not applied** by this change. Google sign-in, private cloud sync, hosted AI and live donations have not been verified with a real signed-in account.

Run `npm run test:offline` for cache lifecycle, persistence, legacy migration, account isolation, bounded outages, multi-tab stale snapshot/reopen, and conflict resolution tests. A device must have power and finish the initial public download before disconnected startup can work.
