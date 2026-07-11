'use client';

import { FormEvent, useRef, useState } from 'react';
import type {
  Action,
  Language,
  Phase,
  PlanResponse,
  PlanResponseSuccess,
  Scope,
  TransportMode,
} from '@/types/contract';

const PHASES: Array<{ value: Phase; label: string; hint: string }> = [
  { value: 'before', label: 'Prepare', hint: 'Before heavy rain' },
  { value: 'during', label: 'Respond', hint: 'While it is happening' },
  { value: 'after', label: 'Recover', hint: 'Once conditions ease' },
];

const SUPPORT_NEEDS = [
  ['hasChildren', 'Children'],
  ['hasElderly', 'Elderly member'],
  ['hasPregnantMember', 'Pregnancy support'],
  ['hasDisabilityNeeds', 'Disability support'],
  ['needsEssentialMedicines', 'Essential medicines'],
  ['hasPoweredMedicalDevice', 'Powered medical device'],
  ['hasPets', 'Pets'],
] as const;

type SupportKey = (typeof SUPPORT_NEEDS)[number][0];

interface FormState {
  locality: string;
  scope: Scope;
  phase: Phase;
  language: Language;
  transportMode: TransportMode;
  destination: string;
  householdSize: number;
  communitySize: number;
  additionalContext: string;
  support: Record<SupportKey, boolean>;
}

const emptySupport = () =>
  Object.fromEntries(SUPPORT_NEEDS.map(([key]) => [key, false])) as Record<
    SupportKey,
    boolean
  >;

const INITIAL_FORM: FormState = {
  locality: 'Bengaluru',
  scope: 'individual',
  phase: 'before',
  language: 'English',
  transportMode: 'public_transit',
  destination: '',
  householdSize: 3,
  communitySize: 20,
  additionalContext: '',
  support: emptySupport(),
};

/** Demo chips only fill the form — they never inject canned AI results. */
const DEMO_SCENARIOS: Array<{ id: string; label: string; hint: string; form: FormState }> = [
  {
    id: 'family-during',
    label: 'Family · During · EN',
    hint: 'Elderly + powered device',
    form: {
      ...INITIAL_FORM,
      scope: 'family',
      phase: 'during',
      language: 'English',
      transportMode: 'two_wheeler',
      householdSize: 4,
      support: {
        ...emptySupport(),
        hasElderly: true,
        hasPoweredMedicalDevice: true,
        needsEssentialMedicines: true,
      },
    },
  },
  {
    id: 'community-kn',
    label: 'Community · After · KN',
    hint: 'Privacy-safe check-ins',
    form: {
      ...INITIAL_FORM,
      scope: 'community',
      phase: 'after',
      language: 'Kannada',
      communitySize: 80,
      additionalContext: 'Elderly residents and powered-equipment users need check-ins',
      support: emptySupport(),
    },
  },
  {
    id: 'individual-hi',
    label: 'Individual · Before · HI',
    hint: 'Hindi prep plan',
    form: {
      ...INITIAL_FORM,
      scope: 'individual',
      phase: 'before',
      language: 'Hindi',
      support: emptySupport(),
    },
  },
  {
    id: 'travel',
    label: 'Travel stress · EN',
    hint: 'Electronic City commute',
    form: {
      ...INITIAL_FORM,
      scope: 'individual',
      phase: 'during',
      language: 'English',
      transportMode: 'two_wheeler',
      destination: 'Electronic City',
      support: emptySupport(),
    },
  },
];

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

function priorityLabel(priority: Action['priority']): string {
  return priority === 'critical' ? 'Urgent' : priority === 'high' ? 'Important' : 'Plan';
}

function ActionCard({ action, index }: { action: Action; index: number }) {
  return (
    <article className="action-card">
      <div className={`priority-mark priority-${action.priority}`} aria-hidden="true">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h4 className="font-semibold text-ink">{action.title}</h4>
          <span className={`priority-text priority-${action.priority}`}>
            {priorityLabel(action.priority)}
          </span>
        </div>
        <p className="text-sm leading-6 text-ink-soft">{action.instruction}</p>
        <p className="mt-2 text-xs leading-5 text-ink-faint">
          {action.reason} · {action.timeframe.replaceAll('_', ' ')}
        </p>
      </div>
    </article>
  );
}

function WeatherIcon({ code }: { code: number }) {
  const symbol =
    code >= 200 && code < 300
      ? 'ϟ'
      : code >= 300 && code < 600
        ? '☂'
        : code >= 700 && code !== 800
          ? '☁'
          : '☀';
  return <span aria-hidden="true">{symbol}</span>;
}

function PlanView({ result, onClear }: { result: PlanResponseSuccess; onClear: () => void }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const completed = checked.size;
  const total = result.plan.checklist.length;

  return (
    <div className="animate-rise space-y-5">
      <section className="overflow-hidden rounded-2xl border border-line bg-card" aria-labelledby="plan-title">
        <div className="weather-hero">
          <div>
            <p className="eyebrow text-white/75">Live conditions · {result.weather.provider}</p>
            <h2 id="plan-title" tabIndex={-1} className="mt-1 font-display text-2xl font-semibold text-white sm:text-3xl">
              Your monsoon action plan
            </h2>
            <p className="mt-2 text-sm text-white/75">{result.weather.locationLabel}</p>
          </div>
          <div className="weather-reading" aria-label={`${result.weather.weatherDescription}, ${result.weather.temperatureC} degrees Celsius`}>
            <WeatherIcon code={result.weather.weatherCode} />
            <strong>{Math.round(result.weather.temperatureC)}°</strong>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          <div className="weather-stat"><span>Condition</span><strong>{result.weather.weatherDescription}</strong></div>
          <div className="weather-stat"><span>Humidity</span><strong>{Math.round(result.weather.humidityPct)}%</strong></div>
          <div className="weather-stat"><span>Rain now</span><strong>{result.weather.precipitationMm.toFixed(1)} mm</strong></div>
          <div className="weather-stat"><span>Wind</span><strong>{Math.round(result.weather.windSpeedKmh)} km/h</strong></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs text-ink-faint">
          <span>Observed {formatTime(result.weather.observedAt)} · refresh by {formatTime(result.validUntil)}</span>
          <span className="tabular">
            Live GenAI · {result.timings.modelCalls} model call
            {result.timings.modelCalls === 1 ? '' : 's'} ·{' '}
            {(result.timings.totalMs / 1000).toFixed(1)}s
          </span>
        </div>
      </section>

      <section className={`alert-panel alert-${result.alertState}`} aria-labelledby="alert-title" aria-live="polite">
        <div className="alert-icon" aria-hidden="true">{result.alertState === 'active' ? '!' : 'i'}</div>
        <div>
          <p className="eyebrow">Official alert status</p>
          <h3 id="alert-title" className="mt-0.5 font-semibold capitalize">{result.alertState}</h3>
          <p className="mt-1 text-sm leading-5 opacity-80">{result.alertSummary}</p>
        </div>
      </section>

      <section className="ms-card" aria-labelledby="now-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow text-chili">Highest priority</p>
            <h3 id="now-title">Do this now</h3>
          </div>
          <span className="ms-badge bg-chili-soft text-chili">{result.plan.actionState}</span>
        </div>
        <div className="mt-4 divide-y divide-line">
          {result.plan.doNow.map((action, index) => <ActionCard key={`${action.title}-${index}`} action={action} index={index} />)}
        </div>
      </section>

      <section className="why-card" aria-labelledby="why-title">
        <p className="eyebrow text-leaf">AI interpretation · grounded in sources below</p>
        <h3 id="why-title" className="mt-1 font-display text-xl font-semibold">Why this is prioritized for you</h3>
        <p className="mt-3 leading-7 text-ink-soft">{result.plan.whyPrioritized}</p>
        <p className="mt-3 border-t border-leaf/15 pt-3 text-sm leading-6 text-ink-soft">{result.plan.interpretation}</p>
      </section>

      <section className="ms-card" aria-labelledby="checklist-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow text-leaf">Today’s readiness</p>
            <h3 id="checklist-title">Preparedness checklist</h3>
          </div>
          <span className="tabular text-sm font-semibold text-leaf" aria-live="polite">{completed}/{total} ready</span>
        </div>
        <div className="progress-track mt-4" aria-hidden="true"><span style={{ width: `${total ? (completed / total) * 100 : 0}%` }} /></div>
        <div className="mt-3 space-y-1">
          {result.plan.checklist.map((item, index) => {
            const id = `check-${result.requestId}-${index}`;
            const isChecked = checked.has(index);
            return (
              <label key={id} htmlFor={id} className={`check-row ${isChecked ? 'check-row-done' : ''}`}>
                <input
                  id={id}
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => setChecked((current) => {
                    const next = new Set(current);
                    if (next.has(index)) next.delete(index);
                    else next.add(index);
                    return next;
                  })}
                />
                <span><strong>{item.title}</strong><small>{item.instruction}</small></span>
              </label>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="ms-card" aria-labelledby="next-title">
          <div className="section-heading"><div><p className="eyebrow text-turmeric">After urgent tasks</p><h3 id="next-title">Prepare next</h3></div></div>
          <div className="mt-3 divide-y divide-line">
            {result.plan.doNext.map((action, index) => <ActionCard key={`${action.title}-${index}`} action={action} index={index} />)}
          </div>
        </section>
        <section className="ms-card" aria-labelledby="phase-title">
          <div className="section-heading"><div><p className="eyebrow text-leaf">Selected phase · AI-generated</p><h3 id="phase-title" className="capitalize">{result.profile.phase} the event</h3></div></div>
          <div className="mt-3 divide-y divide-line">
            {result.plan.selectedPhase.map((action, index) => <ActionCard key={`${action.title}-${index}`} action={action} index={index} />)}
          </div>
        </section>
      </div>

      <section className="ms-card" aria-labelledby="phases-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow text-leaf">AI-generated · all event stages</p>
            <h3 id="phases-title">Before / During / After</h3>
          </div>
          <span className="ms-badge bg-leaf-soft text-leaf">GenAI guidance</span>
        </div>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {([
            ['Before', result.plan.otherPhaseSummaries.before],
            ['During', result.plan.otherPhaseSummaries.during],
            ['After', result.plan.otherPhaseSummaries.after],
          ] as const).map(([label, text]) => (
            <div key={label} className="rounded-xl border border-line bg-parchment/40 px-3 py-3">
              <dt className="text-sm font-semibold text-ink">{label}</dt>
              <dd className="mt-1 text-sm leading-6 text-ink-soft">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {result.plan.supportActions.length > 0 && (
        <section className="ms-card" aria-labelledby="support-title">
          <div className="section-heading"><div><p className="eyebrow text-leaf">Personalized support</p><h3 id="support-title">People and needs to prioritize</h3></div></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {result.plan.supportActions.map((action, index) => <ActionCard key={`${action.title}-${index}`} action={action} index={index} />)}
          </div>
        </section>
      )}

      {result.plan.travel && (
        <section className="travel-card" aria-labelledby="travel-title">
          <div className="section-heading">
            <div><p className="eyebrow">Travel context</p><h3 id="travel-title">Recommendation: <span className="capitalize">{result.plan.travel.recommendation.replace('_', ' ')}</span></h3></div>
          </div>
          <p className="mt-3 leading-6">{result.plan.travel.reason}</p>
          {result.plan.travel.cautions.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{result.plan.travel.cautions.map((c) => <li key={c}>{c}</li>)}</ul>}
          <p className="mt-4 border-t border-current/15 pt-3 text-xs font-medium">Traffic or distance context never proves that a road is flood-safe, open, or passable. Check local authorities before travel.</p>
        </section>
      )}

      <section className="ms-card" aria-labelledby="sources-title">
        <div className="section-heading"><div><p className="eyebrow text-leaf">Traceable evidence</p><h3 id="sources-title">Sources and limitations</h3></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {result.sources.map((source) => (
            <article key={source.id} className="source-card">
              <div className="flex items-center justify-between gap-2"><span className="ms-badge bg-leaf-soft text-leaf">{source.kind.replace('_', ' ')}</span><code>{source.id}</code></div>
              <p className="mt-2 text-sm font-semibold">{source.publisher}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-ink-soft">{source.text}</p>
            </article>
          ))}
        </div>
        <details className="mt-4 rounded-xl border border-line px-4 py-3">
          <summary className="cursor-pointer font-semibold">Assumptions and limitations</summary>
          <div className="mt-3 grid gap-4 text-sm text-ink-soft sm:grid-cols-2">
            <div><p className="font-semibold text-ink">Assumptions</p><ul className="mt-1 list-disc space-y-1 pl-5">{result.plan.assumptions.length ? result.plan.assumptions.map((item) => <li key={item}>{item}</li>) : <li>None stated.</li>}</ul></div>
            <div><p className="font-semibold text-ink">Limitations</p><ul className="mt-1 list-disc space-y-1 pl-5">{result.plan.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>
        </details>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white/70 p-4">
        <p className="text-xs text-ink-faint">Request {result.requestId} · No profile or plan is saved in this browser.</p>
        <button type="button" className="ms-btn-ghost" onClick={onClear}>Clear my plan</button>
      </div>
    </div>
  );
}

export default function Home() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PlanResponseSuccess | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const profile = {
      locality: form.locality,
      scope: form.scope,
      phase: form.phase,
      language: form.language,
      transportMode: form.transportMode,
      destination: form.destination,
      householdSize: form.scope === 'family' ? form.householdSize : undefined,
      communitySize: form.scope === 'community' ? form.communitySize : undefined,
      additionalContext: form.additionalContext,
      ...form.support,
    };

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const data = (await response.json()) as PlanResponse;
      if (!data.ok) throw new Error(data.error || 'Could not create the plan.');
      setResult(data);
      requestAnimationFrame(() => document.getElementById('plan-title')?.focus());
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : 'Could not create the plan. Please retry.');
      requestAnimationFrame(() => statusRef.current?.focus());
    } finally {
      setLoading(false);
    }
  }

  function clearPlan() {
    setResult(null);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      <a href="#planner" className="skip-link">Skip to planner</a>
      <header className="site-header">
        <a href="#top" className="brand" aria-label="MonsoonSathi home"><span className="brand-mark" aria-hidden="true">म</span><span>Monsoon<strong>Sathi</strong></span></a>
        <div className="live-chip"><span aria-hidden="true" /> Live weather + Gemini</div>
      </header>

      <main id="top" className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-14 pt-8 sm:px-6 lg:px-8">
        <section className="hero-copy">
          <p className="eyebrow text-leaf">Your calm before, during, and after the storm</p>
          <h1>Know what to do<br /><em>before the rain decides.</em></h1>
          <p>MonsoonSathi turns live local weather and your real needs into a short, prioritized preparedness plan—with every live claim traceable to its source.</p>
        </section>

        <div id="planner" className="mt-8 grid items-start gap-7 xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-5">
            <form onSubmit={submit} className="planner-form" aria-describedby="privacy-note">
              <div className="mb-6">
                <p className="step-label">Plan setup</p>
                <h2 className="font-display text-2xl font-semibold">Tell us about today</h2>
                <p className="mt-1 text-sm leading-5 text-ink-soft">Only what changes your safety priorities.</p>
              </div>

              <div className="mb-5" role="group" aria-label="Demo scenarios">
                <p className="ms-label">Quick demos (fill form only — real Gemini call on submit)</p>
                <div className="flex flex-wrap gap-2">
                  {DEMO_SCENARIOS.map((scenario) => (
                    <button
                      key={scenario.id}
                      type="button"
                      className="ms-btn-ghost text-left !px-2.5 !py-1.5 !text-xs"
                      onClick={() => {
                        setForm(scenario.form);
                        setError('');
                        setResult(null);
                      }}
                      title={scenario.hint}
                    >
                      {scenario.label}
                    </button>
                  ))}
                </div>
              </div>

              <fieldset>
                <legend className="ms-label">Who is this plan for?</legend>
                <div className="segmented grid-cols-3">
                  {(['individual', 'family', 'community'] as Scope[]).map((scope) => (
                    <label key={scope}><input type="radio" name="scope" value={scope} checked={form.scope === scope} onChange={() => update('scope', scope)} /><span className="capitalize">{scope === 'community' ? 'Group' : scope}</span></label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-5">
                <label htmlFor="locality" className="ms-label">Locality or pincode</label>
                <div className="input-with-icon"><span aria-hidden="true">⌖</span><input id="locality" className="ms-input" value={form.locality} onChange={(e) => update('locality', e.target.value)} required maxLength={120} autoComplete="address-level2" placeholder="e.g. Indiranagar, Bengaluru" /></div>
                <p className="field-hint">Use a coarse location—never your street address.</p>
              </div>

              <fieldset className="mt-5">
                <legend className="ms-label">What stage are you in?</legend>
                <div className="phase-options">
                  {PHASES.map((phase) => (
                    <label key={phase.value}><input type="radio" name="phase" value={phase.value} checked={form.phase === phase.value} onChange={() => update('phase', phase.value)} /><span><strong>{phase.label}</strong><small>{phase.hint}</small></span></label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div><label htmlFor="language" className="ms-label">Plan language</label><select id="language" className="ms-input" value={form.language} onChange={(e) => update('language', e.target.value as Language)}><option>English</option><option>Hindi</option><option>Kannada</option></select></div>
                {form.scope === 'family' && <div><label htmlFor="household-size" className="ms-label">People at home</label><input id="household-size" className="ms-input" type="number" min={1} max={30} value={form.householdSize} onChange={(e) => update('householdSize', Number(e.target.value))} /></div>}
                {form.scope === 'community' && <div><label htmlFor="community-size" className="ms-label">People covered</label><input id="community-size" className="ms-input" type="number" min={2} max={5000} value={form.communitySize} onChange={(e) => update('communitySize', Number(e.target.value))} /></div>}
              </div>

              <fieldset className="mt-5">
                <legend className="ms-label">Needs to consider <span className="font-normal">(optional)</span></legend>
                <div className="chip-options">
                  {SUPPORT_NEEDS.map(([key, label]) => (
                    <label key={key}><input type="checkbox" checked={form.support[key]} onChange={(e) => update('support', { ...form.support, [key]: e.target.checked })} /><span>{label}</span></label>
                  ))}
                </div>
              </fieldset>

              <details className="mt-5 border-t border-line pt-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink">Add travel or context</summary>
                <div className="mt-4 space-y-4">
                  <div><label htmlFor="destination" className="ms-label">Destination <span className="font-normal">(optional)</span></label><input id="destination" className="ms-input" value={form.destination} onChange={(e) => update('destination', e.target.value)} maxLength={120} placeholder="e.g. MG Road" /></div>
                  {form.destination && <div><label htmlFor="transport" className="ms-label">Travel mode</label><select id="transport" className="ms-input" value={form.transportMode} onChange={(e) => update('transportMode', e.target.value as TransportMode)}><option value="walk">Walking</option><option value="two_wheeler">Two-wheeler</option><option value="car">Car</option><option value="public_transit">Public transport</option><option value="other">Other</option></select></div>}
                  <div><label htmlFor="context" className="ms-label">Anything else that changes the plan?</label><textarea id="context" className="ms-input min-h-20 resize-y" value={form.additionalContext} onChange={(e) => update('additionalContext', e.target.value)} maxLength={300} placeholder="Example: ground-floor home, power cuts nearby" /><p className="mt-1 text-right text-xs text-ink-faint tabular">{form.additionalContext.length}/300</p></div>
                </div>
              </details>

              <button type="submit" className="ms-btn-primary mt-6 flex w-full items-center justify-center gap-2" disabled={loading}>{loading ? <><span className="spinner" aria-hidden="true" /> Creating your live plan…</> : <>Create my live monsoon plan <span aria-hidden="true">→</span></>}</button>
              <p id="privacy-note" className="mt-3 text-center text-xs leading-5 text-ink-faint">Your profile stays in this tab and is not saved. AI guidance supports—not replaces—official instructions.</p>
            </form>
          </aside>

          <div aria-busy={loading}>
            <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite">
              {loading && <div className="loading-panel"><div className="rain-loader" aria-hidden="true"><i /><i /><i /></div><div><h2>Building your live plan</h2><p>Fetching live data and generating personalized actions. This can take up to a minute.</p></div></div>}
              {error && <div className="error-panel" role="alert"><span aria-hidden="true">!</span><div><h2>We couldn’t create a safe plan</h2><p>{error}</p><button type="button" className="ms-btn-ghost mt-3" onClick={() => setError('')}>Try again</button></div></div>}
            </div>

            {!loading && !error && result && <PlanView result={result} onClear={clearPlan} />}
            {!loading && !error && !result && (
              <section className="empty-state" aria-labelledby="empty-title">
                <div className="storm-orbit" aria-hidden="true"><span>☂</span></div>
                <p className="eyebrow text-leaf">From conditions to decisions</p>
                <h2 id="empty-title">A plan that changes with your day</h2>
                <p>Enter your locality and needs. MonsoonSathi will combine live conditions with verified safety guidance and generate only the actions that matter now.</p>
                <div className="proof-grid">
                  <div><span aria-hidden="true">01</span><strong>Live context</strong><small>Current weather and forecast</small></div>
                  <div><span aria-hidden="true">02</span><strong>Personal priorities</strong><small>Your people, travel and phase</small></div>
                  <div><span aria-hidden="true">03</span><strong>Traceable actions</strong><small>Sources and limits shown</small></div>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-line bg-white/60 px-4 py-5 text-center text-xs text-ink-faint">
        MonsoonSathi · Live weather via OpenWeather · Personalized plans via Gemini · No hardcoded AI
        results · Follow IMD, NDMA and local authority instructions
      </footer>
    </>
  );
}
