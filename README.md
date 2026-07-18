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
