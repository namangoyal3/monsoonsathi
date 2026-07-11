'use client';

import { FormEvent, useRef, useState } from 'react';
import type {
  Language,
  PlanResponse,
  PlanResponseSuccess,
  Scope,
  TransportMode,
} from '@/types/contract';
import {
  DEMO_SCENARIOS,
  INITIAL_FORM,
  PHASES,
  SUPPORT_NEEDS,
  type FormState,
} from '@/app/form-config';
import { PlanView } from '@/app/plan-view';

export default function Home() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PlanResponseSuccess | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

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
      let data: PlanResponse;
      try {
        data = (await response.json()) as PlanResponse;
      } catch {
        throw new Error('The server returned an invalid response. Please retry.');
      }
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
                <div className="input-with-icon"><span aria-hidden="true">⌖</span><input ref={firstFieldRef} id="locality" className="ms-input" value={form.locality} onChange={(e) => update('locality', e.target.value)} required maxLength={120} autoComplete="address-level2" placeholder="e.g. Indiranagar, Bengaluru" aria-required="true" /></div>
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
              <p id="privacy-note" className="mt-3 text-center text-xs leading-5 text-ink-faint">Your location is sent to OpenWeather and your profile to Gemini; MonsoonSathi does not persist either. AI guidance supports—not replaces—official instructions.</p>
            </form>
          </aside>

          <div aria-busy={loading}>
            <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite">
              {loading && <div className="loading-panel"><div className="rain-loader" aria-hidden="true"><i /><i /><i /></div><div><h2>Building your live plan</h2><p>Fetching live data and generating personalized actions. This can take up to a minute.</p></div></div>}
              {error && (
                <div className="error-panel" role="alert" aria-live="assertive">
                  <span aria-hidden="true">!</span>
                  <div>
                    <h2 id="error-title">We couldn’t create a safe plan</h2>
                    <p id="error-desc">{error}</p>
                    <button
                      type="button"
                      className="ms-btn-ghost mt-3"
                      onClick={() => {
                        setError('');
                        firstFieldRef.current?.focus();
                      }}
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
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
