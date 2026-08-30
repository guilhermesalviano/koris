import { useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsForm, type SettingsFormApi } from '../../lib/use-settings-form';
import { ProviderStep } from './steps/ProviderStep';
import { ChannelsStep } from './steps/ChannelsStep';
import { PluginsStep } from './steps/PluginsStep';
import { SearchStep } from './steps/SearchStep';
import { DomainsStep } from './steps/DomainsStep';
import { PersonalInfoStep } from './steps/PersonalInfoStep';
import { ReviewStep } from './steps/ReviewStep';

const STEPS: { title: string; render: ComponentType<{ api: SettingsFormApi }> }[] = [
  { title: 'AI provider', render: ProviderStep },
  { title: 'Channels', render: ChannelsStep },
  { title: 'Plugins', render: PluginsStep },
  { title: 'Web search', render: SearchStep },
  { title: 'Allowed domains', render: DomainsStep },
  { title: 'Personal info', render: PersonalInfoStep },
  { title: 'Review & save', render: ReviewStep },
];

export default function SetupWizardPage() {
  const api = useSettingsForm();
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const isLast = step === STEPS.length - 1;
  const StepComponent = STEPS[step].render;

  async function handleNext() {
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    const ok = await api.submit();
    if (ok) {
      navigate('/admin', { replace: true });
    }
  }

  if (api.loading) {
    return <div className="flex min-h-screen items-center justify-center bg-bg font-mono text-sm text-txt-3">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-bg text-txt">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-xl font-semibold">Set up Koris Assistant</h1>
        <p className="mt-1 font-mono text-[11px] text-txt-3">
          Step {step + 1} of {STEPS.length} · {STEPS[step].title}
        </p>

        <div className="mt-3 flex gap-1">
          {STEPS.map((s, i) => (
            <div key={s.title} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-bg-3'}`} />
          ))}
        </div>

        <div className="mt-8 rounded-card border border-subtle bg-bg-2 p-6">
          <StepComponent api={api} />
        </div>

        {api.loadError && <p className="mt-3 text-sm text-red-400">{api.loadError}</p>}

        <div className="mt-6 flex justify-between">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded-lg border border-strong bg-bg-3 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            disabled={api.saving}
            onClick={handleNext}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {isLast ? (api.saving ? 'Saving…' : 'Save & finish') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
