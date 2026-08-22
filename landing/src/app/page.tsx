import { Feature } from '@/components/Feature';
import { Hero } from '@/components/Hero';
import { HowItWorks } from '@/components/HowItWorks';
import { Changelog } from '@/components/Changelog';
import { Footer } from '@/components/Footer';
import { ChatsIcon, CpuIcon, LayersIcon, MemoryIcon, TerminalIcon } from '@/components/icons';

const FEATURES = [
  {
    title: 'Modular plugins & skills',
    description:
      'Extend the agent with channel plugins and markdown-defined skills, without touching core code.',
    icon: <LayersIcon />,
  },
  {
    title: 'Persistent memory',
    description:
      'A SQLite-backed memory store keeps summaries, facts, and lessons learned across sessions.',
    icon: <MemoryIcon />,
  },
  {
    title: 'Multi-channel',
    description: 'Talk to your agent over Telegram, WhatsApp, a terminal UI, or the web dashboard.',
    icon: <ChatsIcon />,
  },
  {
    title: 'Pluggable AI providers',
    description: 'Bring your own model — run against Ollama, NVIDIA, or a mock provider for testing.',
    icon: <CpuIcon />,
  },
  {
    title: 'Tools & heartbeats',
    description:
      'Executes shell commands, curl requests, and search, plus scheduled heartbeat agents that run on their own.',
    icon: <TerminalIcon />,
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <Hero />

      <HowItWorks />

      <section id="features" className="mt-24 scroll-mt-20">
        <div className="mb-12 max-w-xl">
          <h2 className="text-3xl font-bold tracking-tight text-txt sm:text-4xl">What&apos;s inside</h2>
          <p className="mt-3 text-muted">Everything you need to run your own agent.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Feature key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      <Changelog />

      <Footer />
    </main>
  );
}
