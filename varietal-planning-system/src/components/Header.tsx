import React, { useState, useEffect } from 'react';
import { StepNumber } from '../types';
import {
  Check,
  Users,
  ShieldCheck,
  Sun,
  Moon,
  Database,
  Sprout,
  Sliders,
  Target,
  BarChart3,
  MapPin,
  GitCompare,
  Activity,
  Layers,
  Flame,
  UserRound,
} from 'lucide-react';

interface HeaderProps {
  currentStep: number;
  onSelectStep: (step: number) => void;
  completedSteps: number[];
  /** Signed-in user's email, shown beside the sign-out control. */
  user?: string | null;
  onSignOut?: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
  /** Null until a survey is ingested - the chips stay hidden until then. */
  baseline?: { surveyedAreaHa: number; varietiesFound: number } | null;
  baseYear?: string;
  onOpenCompareModal?: () => void;
}

export const STEPS = [
  { id: 1, label: 'Baseline Data', shortLabel: 'Data', desc: 'Census & Ingestion', icon: Database },
  { id: 2, label: 'Varietal Registry', shortLabel: 'Varieties', desc: 'Bio-Agronomic Catalog', icon: Sprout },
  { id: 3, label: 'Agronomic Rules', shortLabel: 'Parameters', desc: 'Calibration & Caps', icon: Sliders },
  { id: 4, label: 'Seed & Strategy', shortLabel: 'Strategy', desc: 'Multiplier Matrix', icon: Target },
  { id: 5, label: '3-Yr Trajectory', shortLabel: 'Results', desc: 'Executive Projection', icon: BarChart3 },
  { id: 6, label: 'Village Dispatch', shortLabel: 'Allocation', desc: 'Spatial Allocation', icon: MapPin },
];

export const Header: React.FC<HeaderProps> = ({
  currentStep,
  onSelectStep,
  completedSteps,
  user,
  onSignOut,
  isDark = false,
  onToggleTheme,
  baseline = null,
  baseYear = '',
  onOpenCompareModal,
}) => {
  // Phone-only account menu. Closes on an outside tap or Escape, or it
  // would sit open over whichever step you moved to next.
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAccountOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const progressPct = Math.round(((currentStep - 1) / (STEPS.length - 1)) * 100);

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-200 ${
        isScrolled
          ? 'bg-(--surface-card)/95 backdrop-blur-md border-b border-(--border) shadow-(--shadow-sm)'
          : 'bg-(--surface-card) border-b border-(--border)'
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Tier 1: Identity, Catchment Telemetry, Quick Tools & Role */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 gap-3 border-b border-(--border)/70">
          {/* Brand Identity & Mill Status */}
          <div className="flex items-center gap-3.5">
            <div className="relative">
              {/* The mark carries its own greens, so it sits on a light surface
                  rather than inside a solid gradient tile that would fight it.
                  It fills the tile edge to edge - its wordmark is tiny, so every
                  pixel of the 40px slot counts. */}
              {/* The real mark. It carries its own colour, so it sits on the
                  surface rather than inside a tinted tile that would fight it. */}
              <img
                src="/logo-mark-64.v3.png"
                alt="Ganna Chakra"
                className="w-10 h-10 object-contain shrink-0"
                width={128}
                height={108}
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-(--surface-card) flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  Gobind Sugar Mill • Aira
                </span>
                <span className="text-[11px] text-(--text-muted) hidden md:inline">
                  Lakhimpur Kheri, Uttar Pradesh
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h1 className="text-[15px] font-bold text-(--text-primary) tracking-tight">
                  Cane Varietal Planning OS
                </h1>
                <span className="text-[10px] font-mono px-1.5 py-0.2 text-(--text-muted) bg-(--surface-sunken) rounded border border-(--border)">
                  v3.4-prod
                </span>
              </div>
            </div>
          </div>

          {/* Catchment chips - only meaningful once a survey is loaded */}
          {baseline && (
          <div className="hidden lg:flex items-center gap-2.5">
            <div className="px-3 py-1 rounded-lg bg-(--surface-sunken) border border-(--border) flex items-center gap-2 text-[12px]">
              <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-(--text-secondary)">Command Area:</span>
              <strong className="text-(--text-primary) font-mono font-semibold">{baseline.surveyedAreaHa.toLocaleString()} Ha</strong>
            </div>

            <div className="px-3 py-1 rounded-lg bg-(--surface-sunken) border border-(--border) flex items-center gap-2 text-[12px]">
              <Activity className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-(--text-secondary)">Crushing Season:</span>
              <strong className="text-(--text-primary) font-mono font-semibold">{baseYear}</strong>
            </div>

            <div className="px-3 py-1 rounded-lg bg-(--surface-sunken) border border-(--border) flex items-center gap-2 text-[12px]">
              <Flame className="w-3.5 h-3.5 text-(--text-muted)" />
              <span className="text-(--text-secondary)">Varieties:</span>
              <strong className="text-(--text-primary) font-mono font-semibold">{baseline.varietiesFound}</strong>
            </div>
          </div>
          )}

          {/* Right Action Controls: Scenarios, Role Switcher, Theme */}
          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
            {onOpenCompareModal && (
              <button
                type="button"
                onClick={onOpenCompareModal}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-(--border) bg-(--surface-sunken) hover:bg-(--border) text-[12px] font-medium text-(--text-primary) transition-colors cursor-pointer"
                title="Compare saved scenarios"
              >
                <GitCompare className="w-3.5 h-3.5 text-(--accent)" />
                <span>Scenarios</span>
              </button>
            )}

            {/* The Plant Team / Manager switch used to live here. Everyone who can
                sign in is a manager now, so there is nothing to switch between. */}
            {user && (
              // ml-1 plus a divider: the email used to butt straight against the
              // Scenarios button and read as one run-on word.
              <div className="hidden sm:flex items-center gap-2 ml-1 pl-3 border-l border-(--border)">
                <span className="text-[12px] text-(--text-secondary) truncate max-w-[180px]" title={user}>
                  {user}
                </span>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="text-[12px] font-medium text-(--text-muted) hover:text-(--text-primary) px-2 py-1 rounded-md hover:bg-(--surface-sunken) transition-colors cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            )}

            {/* Account, on a phone.
                The block above is `hidden sm:flex`, so below 640px both the
                address and the sign-out went with it and there was no way off
                the app on a phone. The same two things live in here instead -
                a menu rather than a row, because the address does not fit
                beside the other controls at that width. */}
            {user && (
              <div className="relative sm:hidden" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  aria-label="Account"
                  className="w-8 h-8 rounded-lg border border-(--border) bg-(--surface-sunken) hover:bg-(--border) text-(--text-secondary) flex items-center justify-center transition-colors cursor-pointer"
                >
                  <UserRound className="w-4 h-4" />
                </button>

                {accountOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[38px] z-50 w-[230px] rounded-[12px] border border-(--border) bg-(--surface-card) shadow-(--shadow-md) p-1.5"
                  >
                    <p
                      className="px-2.5 pt-1.5 pb-2 text-[12px] text-(--text-secondary) break-all leading-snug"
                      title={user}
                    >
                      {user}
                    </p>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountOpen(false);
                        onSignOut?.();
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-[8px] text-[13px] font-medium text-(--text-primary) hover:bg-(--surface-sunken) border-t border-(--border) mt-0.5 pt-2.5 transition-colors cursor-pointer"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Dark / Light Mode Toggle */}
            {onToggleTheme && (
              <button
                type="button"
                id="btn-toggle-theme"
                onClick={onToggleTheme}
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label="Toggle theme"
                className="w-8 h-8 rounded-lg border border-(--border) bg-(--surface-sunken) hover:bg-(--border) text-(--text-secondary) hover:text-(--text-primary) flex items-center justify-center transition-colors cursor-pointer"
              >
                {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
              </button>
            )}
          </div>
        </div>

        {/* Tier 2: Stepper Navigation Bar */}
        <nav className="py-2.5" aria-label="Planning Workflow Steps">
          <div className="relative">
            {/* Background Rail Track */}
            <div className="absolute top-[18px] left-6 right-6 h-[2px] bg-(--surface-sunken) z-0 rounded-full">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-all duration-300 ease-out rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Stepper Nodes */}
            <ol className="relative z-10 flex items-center justify-between gap-1 sm:gap-2">
              {STEPS.map((step) => {
                const isActive = currentStep === step.id;
                const isCompleted = completedSteps.includes(step.id);
                const IconComponent = step.icon;

                return (
                  <li key={step.id} className="flex-1">
                    <button
                      type="button"
                      onClick={() => onSelectStep(step.id)}
                      id={`nav-step-${step.id}`}
                      className={`group w-full flex flex-col sm:flex-row items-center justify-center gap-2 py-1 px-2 rounded-xl transition-all cursor-pointer ${
                        isActive
                          ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30'
                          : 'hover:bg-(--surface-sunken) border border-transparent'
                      }`}
                    >
                      {/* Node Icon / Number */}
                      <div className="relative flex items-center justify-center shrink-0">
                        {isCompleted && !isActive ? (
                          <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm transition-transform group-hover:scale-105">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : isActive ? (
                          <div className="relative flex items-center justify-center">
                            <span className="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-emerald-500 opacity-25" />
                            <div className="relative w-7 h-7 rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-500/30 flex items-center justify-center font-bold text-[12px] font-mono">
                              {step.id}
                            </div>
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-(--surface-card) border border-(--border-strong) text-(--text-muted) flex items-center justify-center text-[12px] font-mono font-medium group-hover:border-(--accent) transition-colors">
                            {step.id}
                          </div>
                        )}
                      </div>

                      {/* Text details */}
                      <div className="text-left hidden sm:block min-w-0">
                        <div
                          className={`text-[12px] truncate leading-tight font-medium ${
                            isActive
                              ? 'font-bold text-emerald-700 dark:text-emerald-400'
                              : isCompleted
                              ? 'text-(--text-primary)'
                              : 'text-(--text-muted) group-hover:text-(--text-secondary)'
                          }`}
                        >
                          {step.label}
                        </div>
                        <div className="text-[10px] text-(--text-muted) truncate hidden md:block">
                          {step.desc}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>
      </div>
    </header>
  );
};
