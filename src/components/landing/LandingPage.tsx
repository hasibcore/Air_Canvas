import React, { useState } from 'react';
import {
  Brush,
  Wifi,
  Sparkles,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Download,
  Laptop,
  Smartphone,
  Shield,
  Zap,
  Layers,
  Sliders,
  ExternalLink,
  Code2,
  ArrowRight,
  Monitor,
} from 'lucide-react';

interface LandingPageProps {
  onLaunchTablet: () => void;
  onLaunchStudio: () => void;
  onOpenHub: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onLaunchTablet,
  onLaunchStudio,
  onOpenHub,
}) => {
  const [platformTab, setPlatformTab] = useState<'desktop' | 'mobile'>('desktop');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const faqs = [
    {
      q: 'Do I need a special active stylus or pen?',
      a: 'No! AirCanvas supports both active pressure-sensitive styluses (Samsung S-Pen, Apple Pencil, Microsoft Surface Pen, Wacom EMR) and capacitive or finger touch. Calibrated pressure curves (Gamma 0.7 to 1.4) adapt smoothly to your tool.',
    },
    {
      q: 'How does AirCanvas eliminate drawing lag over Wi-Fi?',
      a: 'We implement the Casiez et al. 1-Euro Adaptive Filter with predictive lead-point vector projection and ultra-compact 17-byte binary network frames. This provides sub-millisecond local network latency with zero micro-jitter.',
    },
    {
      q: 'Does it work with Photoshop, Blender, OneNote, and Krita?',
      a: 'Yes. On Windows desktop, AirCanvas injects synthetic native pointer events (`CreateSyntheticPointerDevice`) recognized as high-fidelity pen input by all modern creative software.',
    },
    {
      q: 'What is 16:9 PC Fit mode?',
      a: 'Standard phones have tall aspect ratios (19.5:9 or 20:9), while PC monitors are typically 16:9 or 16:10. Drawing a circle on a stretched phone canvas produces an ellipse on PC. 16:9 PC Fit mode matches your monitor proportions exactly for 1:1 true circle geometry.',
    },
  ];

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0F0F1A] text-slate-100 select-none font-sans scroll-smooth">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-[#0F0F1A]/85 backdrop-blur-xl border-b border-slate-800/80 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center shadow-[0_0_14px_rgba(0,229,255,0.4)]">
            <Brush className="w-5 h-5 text-slate-950" />
          </div>
          <span className="font-black text-lg text-white tracking-tight">Air Canvas</span>
        </div>

        <div className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
          <a href="#features" className="hover:text-cyan-400 transition-colors">
            Features
          </a>
          <a href="#architecture" className="hover:text-cyan-400 transition-colors">
            Architecture
          </a>
          <a href="#platforms" className="hover:text-cyan-400 transition-colors">
            Platforms
          </a>
          <a href="#faq" className="hover:text-cyan-400 transition-colors">
            FAQ
          </a>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenHub}
            className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-purple-600 hover:from-cyan-300 hover:to-purple-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all hover:scale-105"
          >
            Launch Web App
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-6 py-20 md:py-28 flex flex-col items-center text-center overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-cyan-500/15 to-purple-600/15 blur-[120px] pointer-events-none rounded-full" />

        <div className="relative z-10 max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>v1.7.1 PRO RELEASED • COMMERCIAL-GRADE WIRELESS TABLET</span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-white leading-tight">
            Draw on air.
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-purple-500 bg-clip-text text-transparent">
              Connect. Create.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Turn your smartphone or tablet into a commercial-grade wireless drawing canvas for your PC.
            Full edge-to-edge mobile canvas, notebook-scale handwriting output, 1:1 true circle geometry,
            and calibrated pressure curves over Wi-Fi — zero wires, zero lag.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
            <button
              type="button"
              onClick={onLaunchTablet}
              className="px-6 py-3.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-sm rounded-xl flex items-center gap-2 shadow-xl shadow-cyan-500/25 transition-all hover:scale-105"
            >
              <Smartphone className="w-4 h-4" /> Open Drawing Tablet
            </button>
            <button
              type="button"
              onClick={onLaunchStudio}
              className="px-6 py-3.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl flex items-center gap-2 shadow-xl shadow-purple-600/25 transition-all hover:scale-105"
            >
              <Monitor className="w-4 h-4" /> Open PC Drawing Studio
            </button>
            <button
              type="button"
              onClick={onOpenHub}
              className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-sm rounded-xl flex items-center gap-2 transition-all"
            >
              <Layers className="w-4 h-4" /> Connection Hub
            </button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="px-6 py-20 border-t border-slate-800/80 bg-slate-900/30">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
              Designed for <span className="text-cyan-400">Creators & Educators</span>
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Commercial-grade precision and responsiveness built for digital artists, online teachers, and notes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">1-Euro Adaptive Filter</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Dynamic velocity-based filtering eliminates micro-jitter and hand tremors during slow writing while
                preserving sharp corners at high speed with 0 lag.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Maximize2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">1:1 Shape Geometry</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Aspect ratio matching guarantees circles and diagrams drawn on mobile render with 100% identical
                geometry and zero distortion on PC screens.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Laptop className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">Native Pen Injection</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Translates touch and stylus data into native synthetic pen pointer events. Works out of the box with
                OneNote, PowerPoint, Photoshop, and Krita.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Sliders className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">Pressure Curve Tuning</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Switch between Standard linear, Soft (Gamma 0.7 for capacitive styluses), and Firm (Gamma 1.4 for
                calligraphy) curves.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Flow */}
      <section id="architecture" className="px-6 py-20 border-t border-slate-800/80">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
              How <span className="text-cyan-400">It Works</span>
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Real-time cross-platform client-server architecture with sub-millisecond UDP / WebRTC framing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-center flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center mb-1">
                <Smartphone className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-white text-base">1. Mobile / Tablet Client</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Acts as your high-precision graphics tablet. Captures pressure, stylus tilt, and palm-rejected strokes.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-cyan-500/40 space-y-3 text-center flex flex-col items-center shadow-[0_0_20px_rgba(0,229,255,0.1)]">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/15 text-purple-400 flex items-center justify-center mb-1">
                <Wifi className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-white text-base">2. Local WiFi / WebRTC Mesh</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Streams binary coordinates at up to 144Hz via zero-lag UDP datagrams or browser BroadcastChannels.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-center flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-1">
                <Laptop className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-white text-base">3. Desktop Server / Studio</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Receives coordinate data and injects synthetic native pen input into your drawing canvas or desktop apps.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Downloads */}
      <section id="platforms" className="px-6 py-20 border-t border-slate-800/80 bg-slate-900/30">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
              Supported <span className="text-cyan-400">Platforms</span>
            </h2>
            <p className="text-sm text-slate-400">
              Run AirCanvas anywhere — Web App, Windows, Android, macOS, and Linux.
            </p>

            <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800 mt-4">
              <button
                type="button"
                onClick={() => setPlatformTab('desktop')}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${
                  platformTab === 'desktop' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Desktop (Host / Server)
              </button>
              <button
                type="button"
                onClick={() => setPlatformTab('mobile')}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${
                  platformTab === 'mobile' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Mobile / Tablet (Client)
              </button>
            </div>
          </div>

          {platformTab === 'desktop' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <h4 className="font-bold text-white text-base">Windows 10 / 11</h4>
                <p className="text-xs text-slate-400">
                  Native synthetic pen injection (`CreateSyntheticPointerDevice`) for Office and design software.
                </p>
                <button
                  type="button"
                  onClick={onLaunchStudio}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Launch Host
                </button>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <h4 className="font-bold text-white text-base">macOS (Universal)</h4>
                <p className="text-xs text-slate-400">
                  High-speed WebSocket listener with UDP Discovery for Mac Silicon & Intel.
                </p>
                <button
                  type="button"
                  onClick={onLaunchStudio}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-purple-400 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Launch Web
                </button>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <h4 className="font-bold text-white text-base">Linux</h4>
                <p className="text-xs text-slate-400">
                  GTK / uinput receiver for Linux creative distributions and Wayland/X11.
                </p>
                <button
                  type="button"
                  onClick={onLaunchStudio}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Launch AppImage
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <h4 className="font-bold text-white text-base">Android (Tablets & Phones)</h4>
                <p className="text-xs text-slate-400">
                  Full S-Pen & active stylus sampling up to 240Hz with palm rejection.
                </p>
                <button
                  type="button"
                  onClick={onLaunchTablet}
                  className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Smartphone className="w-3.5 h-3.5" /> Launch Tablet Mode
                </button>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <h4 className="font-bold text-white text-base">iPad / iOS (Apple Pencil)</h4>
                <p className="text-xs text-slate-400">
                  Apple Pencil pressure, azimuth tilt and full retina screen utilization.
                </p>
                <button
                  type="button"
                  onClick={onLaunchTablet}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Smartphone className="w-3.5 h-3.5" /> Launch iPad Mode
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* FAQ Accordion */}
      <section id="faq" className="px-6 py-20 border-t border-slate-800/80">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Frequently Asked Questions</h2>
            <p className="text-xs text-slate-400">Everything you need to know about setting up Air Canvas.</p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(openFaqIndex === idx ? null : idx)}
                  className="w-full p-4 text-left flex items-center justify-between gap-4 font-bold text-sm text-slate-200"
                >
                  <span>{faq.q}</span>
                  {openFaqIndex === idx ? (
                    <ChevronUp className="w-4 h-4 text-cyan-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </button>
                {openFaqIndex === idx && (
                  <div className="px-4 pb-4 text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 px-6 text-center text-xs text-slate-500 space-y-2">
        <p>Air Canvas • Wireless Drawing & Control Surface • Commercial-Grade Tablet Architecture</p>
        <p className="text-[11px] text-slate-600">Built with 1-Euro Adaptive Filter & Real-Time Stream Framing</p>
      </footer>
    </div>
  );
};
