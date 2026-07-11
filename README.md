# MonsoonSathi

> Live weather turned into personalized actions for you, your family, and your community.

**PromptWars / Build with AI** submission for:

> Design a GenAI-powered solution that helps individuals, families, and communities prepare for the monsoon season…

## Solution

MonsoonSathi is a **monsoon action planner** (not a weather dashboard or chatbot):

1. You describe locality, scope (individual / family / community), phase (before / during / after), language, and optional travel destination.
2. The server resolves the location and fetches **live weather** (OpenWeather).
3. **One Gemini structured-output call** produces a personalized plan.
4. Server-side Zod + safety validation rejects bad source IDs, phone numbers, HTML, and unsupported “flood-safe route” claims.
5. The dashboard clearly labels **live weather facts** vs **AI-generated guidance**.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Zod validation
- Gemini API (`GEMINI_API_KEY`)
- OpenWeather (live weather + geocoding)

## Setup

```bash
cd code/monsoonsathi
npm install
cp .env.example .env.local
# set GEMINI_API_KEY and OPENWEATHER_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the port Next prints).

### Environment

Copy `.env.example` → `.env.local` (and optionally `.env`). **Never commit real keys** (`.env*` is gitignored).

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Server-only GenAI key |
| `GEMINI_MODEL` | no | Default in code if unset (e.g. `gemini-2.5-flash` / `gemini-flash-lite-latest`) |
| `OPENWEATHER_API_KEY` | yes | Server-only live weather + geocoding |

Both keys are read only in server code via `lib/env.ts` — never `NEXT_PUBLIC_*`.

## Scripts

```bash
npm run dev
npm run typecheck
npm run selfcheck   # deterministic validation tests
npm test            # unit tests
npm run build
npm run verify      # typecheck + selfcheck + unit tests + build
```

## Live services

| Service | Purpose | Honest failure |
|---|---|---|
| OpenWeather Geocoding | Resolve locality | 400 if not found |
| OpenWeather Forecast | Current + hourly weather | Blocks plan if unavailable |
| Gemini | Personalized plan | 502 with clear error; no canned plan |
| NDMA guidance snapshot | Official preparedness bullets | Versioned static evidence |

**Alert honesty:** This build does not invent IMD/NDMA public alerts. Alert state is `unavailable` with an explicit message. Empty ≠ invented active alert.

## GenAI usage

| Input | Gemini task | Validation |
|---|---|---|
| Profile + verified evidence packet | Structured action plan in chosen language | Zod schema + source ID + prohibited claim scan |

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
npm run selfcheck
npm test
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

- Official India weather-alert feed not integrated (status shown as unavailable — never invented).
- Travel uses coarse geocoded distance context, not live traffic / flood maps.
- Language is chosen before generation (no post-hoc silent translation).
- Not a substitute for official emergency instructions.

Demo chips on the form only fill inputs — every plan still requires a live Gemini call.

## Deployed URL

**Production:** https://monsoonsathi.vercel.app

### Production smoke (measured)

| Scenario | Result |
|---|---|
| Family during + elderly/device | OpenWeather live, Gemini `modelCalls: 1`, personalized support |
| Hindi individual | Non-English GenAI plan |
| Travel to Electronic City | Travel advisory from Gemini |
| Invalid locality | Honest `LOCATION_NOT_FOUND` (no fake plan) |

### Judge demo (3 min)

1. Open https://monsoonsathi.vercel.app  
2. Click **Family · During · EN** → Create plan  
3. Show live OpenWeather timestamp + GenAI model-call badge  
4. Show support actions for elderly/device  
5. Click **Individual · Before · HI** → Hindi plan  
6. Optional: **Travel stress** chip → travel disclaimer (never flood-safe)

### 60s pitch

> MonsoonSathi turns live OpenWeather data into personalized monsoon actions with one Gemini call—individuals, families, and communities; before, during, and after; English, Hindi, and Kannada—with server-side safety validation and zero hardcoded AI results.

