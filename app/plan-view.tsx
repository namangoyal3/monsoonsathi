'use client';

import { useState } from 'react';
import type { Action, PlanResponseSuccess } from '@/types/contract';

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

export function PlanView({ result, onClear }: { result: PlanResponseSuccess; onClear: () => void }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const completed = checked.size;
  const total = result.plan.checklist.length;
  const planLang =
    result.profile.language === 'Hindi'
      ? 'hi'
      : result.profile.language === 'Kannada'
        ? 'kn'
        : 'en';

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
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
          <div className="weather-stat"><span>Condition</span><strong>{result.weather.weatherDescription}</strong></div>
          <div className="weather-stat"><span>Humidity</span><strong>{Math.round(result.weather.humidityPct)}%</strong></div>
          <div className="weather-stat"><span>Rain now</span><strong>{result.weather.precipitationMm.toFixed(1)} mm</strong></div>
          <div className="weather-stat"><span>Wind</span><strong>{Math.round(result.weather.windSpeedKmh)} km/h</strong></div>
          <div className="weather-stat">
            <span>Weather risk</span>
            <strong className="capitalize">{result.weather.weatherRisk ?? 'normal'}</strong>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs text-ink-soft">
          <span>
            <span className="font-semibold text-ink">Live weather fact</span>
            {' · '}Observed {formatTime(result.weather.observedAt)} · plan valid until{' '}
            {formatTime(result.validUntil)}
          </span>
          <span className="tabular font-medium text-ink">
            Live GenAI · {result.timings.modelCalls} model call
            {result.timings.modelCalls === 1 ? '' : 's'} ·{' '}
            {(result.timings.totalMs / 1000).toFixed(1)}s
          </span>
        </div>
      </section>

      <section
        className={`alert-panel alert-${result.alertState}`}
        aria-labelledby="alert-title"
        aria-live="polite"
      >
        <div className="alert-icon" aria-hidden="true">
          {result.alertState === 'active' || result.weather.weatherRisk === 'severe'
            ? '!'
            : 'i'}
        </div>
        <div>
          <p className="eyebrow">Real-time alert & risk status</p>
          <h3 id="alert-title" className="mt-0.5 font-semibold">
            Alert: <span className="capitalize">{result.alertState}</span>
            {' · '}
            Weather risk:{' '}
            <span className="capitalize">{result.weather.weatherRisk ?? 'normal'}</span>
          </h3>
          <p className="mt-1 text-sm leading-5 opacity-90">{result.alertSummary}</p>
          {result.weather.weatherRiskSummary && (
            <p className="mt-2 text-sm leading-5 opacity-90">
              <span className="font-semibold">Live weather risk: </span>
              {result.weather.weatherRiskSummary}
            </p>
          )}
        </div>
      </section>

      <section className="ms-card" aria-labelledby="align-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow text-leaf">Challenge coverage</p>
            <h3 id="align-title">What this plan demonstrates</h3>
          </div>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm text-ink-soft">
          {[
            ['Personalized plan', 'AI-generated for your profile'],
            ['Weather-aware guidance', result.weather.provider],
            ['Emergency checklist', `${result.plan.checklist.length} live items`],
            ['Safety recommendations', 'Do now / Do next'],
            ['Travel advisory', result.plan.travel ? result.plan.travel.recommendation : 'Not requested'],
            ['Multilingual', result.profile.language],
            ['Real-time risk', result.weather.weatherRisk ?? 'normal'],
            ['Before / during / after', result.profile.phase],
            ['Individuals / families / communities', result.profile.scope],
            ['Source-grounded GenAI', `${result.sources.length} sources`],
          ].map(([label, value]) => (
            <li key={label} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2">
              <span className="mt-0.5 text-leaf font-bold" aria-hidden="true">✓</span>
              <span>
                <strong className="text-ink">{label}</strong>
                <span className="block text-xs">{value}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ms-card" aria-labelledby="now-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow text-chili">Highest priority</p>
            <h3 id="now-title">Do this now</h3>
          </div>
          <span className="ms-badge bg-chili-soft text-chili">{result.plan.actionState}</span>
        </div>
        <div className="mt-4 divide-y divide-line" lang={planLang}>
          {result.plan.doNow.map((action, index) => <ActionCard key={`${action.title}-${index}`} action={action} index={index} />)}
        </div>
      </section>

      <section className="why-card" aria-labelledby="why-title">
        <p className="eyebrow text-leaf">AI interpretation · grounded in sources below</p>
        <h3 id="why-title" className="mt-1 font-display text-xl font-semibold">Why this is prioritized for you</h3>
        <p lang={planLang} className="mt-3 leading-7 text-ink-soft">{result.plan.whyPrioritized}</p>
        <p lang={planLang} className="mt-3 border-t border-leaf/15 pt-3 text-sm leading-6 text-ink-soft">{result.plan.interpretation}</p>
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
        <div className="mt-3 space-y-1" lang={planLang}>
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
          <div className="mt-3 divide-y divide-line" lang={planLang}>
            {result.plan.doNext.map((action, index) => <ActionCard key={`${action.title}-${index}`} action={action} index={index} />)}
          </div>
        </section>
        <section className="ms-card" aria-labelledby="phase-title">
          <div className="section-heading"><div><p className="eyebrow text-leaf">Selected phase · AI-generated</p><h3 id="phase-title" className="capitalize">{result.profile.phase} the event</h3></div></div>
          <div className="mt-3 divide-y divide-line" lang={planLang}>
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
              <dd lang={planLang} className="mt-1 text-sm leading-6 text-ink-soft">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {result.plan.supportActions.length > 0 && (
        <section className="ms-card" aria-labelledby="support-title">
          <div className="section-heading"><div><p className="eyebrow text-leaf">Personalized support</p><h3 id="support-title">People and needs to prioritize</h3></div></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2" lang={planLang}>
            {result.plan.supportActions.map((action, index) => <ActionCard key={`${action.title}-${index}`} action={action} index={index} />)}
          </div>
        </section>
      )}

      {result.plan.travel && (
        <section className="travel-card" aria-labelledby="travel-title">
          <div className="section-heading">
            <div><p className="eyebrow">Travel context</p><h3 id="travel-title">Recommendation: <span className="capitalize">{result.plan.travel.recommendation.replace('_', ' ')}</span></h3></div>
          </div>
          <p lang={planLang} className="mt-3 leading-6">{result.plan.travel.reason}</p>
          {result.plan.travel.cautions.length > 0 && <ul lang={planLang} className="mt-3 list-disc space-y-1 pl-5 text-sm">{result.plan.travel.cautions.map((c) => <li key={c}>{c}</li>)}</ul>}
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
            <div><p className="font-semibold text-ink">Assumptions</p><ul lang={planLang} className="mt-1 list-disc space-y-1 pl-5">{result.plan.assumptions.length ? result.plan.assumptions.map((item) => <li key={item}>{item}</li>) : <li lang="en">None stated.</li>}</ul></div>
            <div><p className="font-semibold text-ink">Limitations</p><ul lang={planLang} className="mt-1 list-disc space-y-1 pl-5">{result.plan.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>
        </details>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white/70 p-4">
        <p className="text-xs text-ink-faint">Request {result.requestId} · The server does not persist your profile or plan; optional basic preferences stay only on this device.</p>
        <button type="button" className="ms-btn-ghost" onClick={onClear}>Clear my plan</button>
      </div>
    </div>
  );
}
