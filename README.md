# MonsoonSathi

> Live weather turned into personalized actions for you, your family, and your community.

**PromptWars / Build with AI** submission for:

> Design a GenAI-powered solution that helps individuals, families, and communities prepare for the monsoon season…

## Solution

MonsoonSathi is a **monsoon action planner** (not a weather dashboard or chatbot):

1. You describe locality, scope (individual / family / community), phase (before / during / after), language, and optional travel destination.
2. The server resolves the location and fetches **live weather** (OpenWeather).
3. **Live Gemini structured output** produces a personalized plan; invalid output gets one real repair attempt, never a canned fallback.
4. Server-side Zod + safety validation rejects unsupported evidence citations, phone numbers, HTML, “flood-safe route” claims, and affirmative travel clearance.
5. The dashboard clearly labels **live weather facts** vs **AI-generated guidance**.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Zod validation
- Gemini API (`GEMINI_API_KEY`)
- OpenWeather (live weather + geocoding)

## Setup

```bash
cd code/monsoonsathi
npm ci
cp .env.example .env.local
# set GEMINI_API_KEY and OPENWEATHER_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the port Next prints).
Requires Node.js 20.9 or newer.

### Environment

Copy `.env.example` → `.env.local` (and optionally `.env`). **Never commit real keys** (`.env*` is gitignored).

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Server-only GenAI key |
| `GEMINI_MODEL` | no | Defaults to `gemini-flash-lite-latest` |
| `OPENWEATHER_API_KEY` | yes | Server-only live weather + geocoding |

Both keys are read only in server code via `lib/env.ts` — never `NEXT_PUBLIC_*`.

## Scripts

```bash
npm run dev
npm run typecheck
npm run selfcheck   # deterministic validation tests
npm test            # unit tests
npm run build
npm run verify      # lint + typecheck + selfcheck + unit tests + build
npm run verify:live # verify + serial Playwright tests against live providers
```

## Live services

| Service | Purpose | Honest failure |
|---|---|---|
| OpenWeather Geocoding | Resolve locality | 400 if not found |
| OpenWeather Forecast | Current + hourly weather | Blocks plan if unavailable |
| OpenWeather One Call alerts | Best-effort publisher alerts | Labeled `unavailable` when the key/plan cannot access them |
| OSRM public routing | Car time/distance estimate only | Falls back to straight-line context; never claims passability |
| Gemini | Personalized plan | 502 with clear error; no canned plan |
| NDMA guidance snapshot | Official preparedness bullets | Versioned static evidence |

**Alert honesty:** This build never presents weather-derived risk as an IMD/NDMA alert. OpenWeather publisher alerts are used only when returned live; otherwise the state is honestly `none` or `unavailable`.

## GenAI usage

| Input | Gemini task | Validation |
|---|---|---|
| Profile + verified evidence packet | Structured action plan in chosen language | Zod schema + matching evidence-kind checks + prohibited claim scan |

Deterministic code owns: input validation, geocoding, weather fetch, source IDs, claim rejection, timestamps.

## Security

- Secrets server-side only
- Zod at request boundary
- Profile treated as untrusted (XML-delimited in prompt)
- No `dangerouslySetInnerHTML`
- No sensitive profile persistence
- Logs: request id + error code only

## Testing

```bash
npm run verify
npm run verify:live
```

Manual production smoke:

1. Locality `Bengaluru`, individual, before, English → plan + live timestamp
2. Family + elderly + powered medical device + during → device/medicine priorities
3. Community scope → privacy-safe support actions
4. Hindi or Kannada → non-English plan text
5. Destination `Electronic City` → travel caution + flood-safety disclaimer
6. Invalid locality → honest error, no fake plan

## Alignment

See [docs/ALIGNMENT.md](docs/ALIGNMENT.md).

## Limitations

- An authoritative India-specific alert feed is not integrated; OpenWeather publisher alerts are best-effort and clearly labeled.
- Car travel can use OSRM time/distance; other modes use straight-line context. Neither includes live traffic, road closure, or flood-passability data.
- Language is chosen before generation (no post-hoc silent translation).
- Not a substitute for official emergency instructions.

Demo chips on the form only fill inputs — every plan still requires a live Gemini call.

## Deployed URL

**Production:** https://monsoonsathi.vercel.app

### Production smoke (measured)

Executed against the public URL on 11 July 2026:

| Check | Measured result |
|---|---|
| Homepage | HTTP 200; CSP, `X-Content-Type-Options`, `X-Frame-Options`, and strict referrer policy present |
| Bengaluru individual plan | HTTP 200; fresh OpenWeather observation; 4 evidence sources; 2 do-now actions; 4 checklist actions |
| Bengaluru → Electronic City car plan | HTTP 200; live OSRM route evidence; recommendation `reconsider`, never `go` |
| GenAI execution | Gemini `modelCalls: 1` on both measured requests; 4.404 s and 5.599 s generation times |
| Alert honesty | `alertState: unavailable`; no alert was invented |

### Judge demo (3 min)

1. Open https://monsoonsathi.vercel.app  
2. Click **Family · During · EN** → Create plan  
3. Show live OpenWeather timestamp + GenAI model-call badge  
4. Show support actions for elderly/device  
5. Click **Individual · Before · HI** → Hindi plan  
6. Optional: **Travel stress** chip → travel disclaimer (never flood-safe)

### 60s pitch

> MonsoonSathi turns live OpenWeather data into personalized monsoon actions with live Gemini generation—individuals, families, and communities; before, during, and after; English, Hindi, and Kannada—with server-side evidence validation and zero hardcoded AI results.
