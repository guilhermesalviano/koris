import { useState, useEffect, useRef, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsForm, type SettingsFormApi } from '../../lib/use-settings-form';
import { usePlugins, type UsePluginsApi } from '../../lib/use-plugins';
import { ProviderStep } from './steps/ProviderStep';
import { PluginsStep } from './steps/PluginsStep';
import { ChannelsStep } from './steps/ChannelsStep';
import { DomainsStep } from './steps/DomainsStep';
import { PersonalInfoStep } from './steps/PersonalInfoStep';
import { ReviewStep } from './steps/ReviewStep';

interface StepProps {
  api: SettingsFormApi;
  pluginsApi: UsePluginsApi;
}

function SetupChannelsStep({ api, pluginsApi }: StepProps) {
  return <ChannelsStep api={api} pluginsApi={pluginsApi} onlyEnabled />;
}

const STEPS: { title: string; render: ComponentType<StepProps> }[] = [
  { title: 'AI provider', render: ProviderStep },
  { title: 'Plugins', render: PluginsStep },
  { title: 'Channels', render: SetupChannelsStep },
  { title: 'Allowed domains', render: DomainsStep },
  { title: 'Personal info', render: PersonalInfoStep },
  { title: 'Review & save', render: ReviewStep },
];

export default function SetupWizardPage() {
  const api = useSettingsForm();
  const pluginsApi = usePlugins();
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const isLast = step === STEPS.length - 1;
  const StepComponent = STEPS[step].render;

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!api.loading && !initializedRef.current) {
      initializedRef.current = true;
      api.update((prev) => ({ ...prev, sameForBoth: true }));
    }
  }, [api.loading, api.update]);

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

  if (api.loading || pluginsApi.loading) {
    return <div className="flex min-h-screen items-center justify-center bg-bg font-mono text-sm text-txt-3">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-bg text-txt">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-12">
        <h1 className="text-lg sm:text-xl font-semibold">Set up Koris Assistant</h1>
        <p className="mt-1 font-mono text-[11px] text-txt-3">
          Step {step + 1} of {STEPS.length} · {STEPS[step].title}
        </p>

        <div className="mt-3 flex gap-1">
          {STEPS.map((s, i) => (
            <div key={s.title} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-bg-3'}`} />
          ))}
        </div>

        <div className="mt-6 sm:mt-8 rounded-card border border-subtle bg-bg-2 p-4 sm:p-6">
          <StepComponent api={api} pluginsApi={pluginsApi} />
        </div>

        {api.loadError && <p className="mt-3 text-sm text-red-400">{api.loadError}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded-lg border border-strong bg-bg-3 px-5 py-2.5 sm:py-2 text-sm font-medium min-h-[42px] disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            disabled={api.saving}
            onClick={handleNext}
            className="rounded-lg bg-accent px-5 py-2.5 sm:py-2 text-sm font-medium min-h-[42px] hover:opacity-90 disabled:opacity-60"
          >
            {isLast ? (api.saving ? 'Saving…' : 'Save & finish') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
