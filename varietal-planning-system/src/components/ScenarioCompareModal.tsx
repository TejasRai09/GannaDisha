import React, { useState } from 'react';
import { SavedScenario, VarietyRecord, ParametersState, VarietyStrategySetting } from '../types';
import { X, GitCompare, BookmarkPlus, Check, ArrowRight } from 'lucide-react';

interface ScenarioCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedScenarios: SavedScenario[];
  currentParams: ParametersState;
  currentStrategies: Record<string, VarietyStrategySetting>;
  varieties: VarietyRecord[];
  currentYear3Area: Record<string, number>;
  currentBlendedSucroseY3: number;
  onSaveScenario: (name: string, desc: string) => void;
  onLoadScenario: (scenario: SavedScenario) => void;
}

export const ScenarioCompareModal: React.FC<ScenarioCompareModalProps> = ({
  isOpen,
  onClose,
  savedScenarios,
  currentParams,
  currentStrategies,
  varieties,
  currentYear3Area,
  currentBlendedSucroseY3,
  onSaveScenario,
  onLoadScenario,
}) => {
  const [activeTab, setActiveTab] = useState<'compare' | 'save'>('compare');
  const [scenarioAId, setScenarioAId] = useState<string>(savedScenarios[0]?.id || '');
  const [scenarioBId, setScenarioBId] = useState<string>('current');

  // Save scenario form states
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  // Construct scenario objects for comparison
  const currentScenarioObj: SavedScenario = {
    id: 'current',
    name: 'Current Working Parameters',
    createdAt: 'Active Session',
    description: 'The parameter and strategy values currently dialed into the model.',
    parameters: currentParams,
    strategies: currentStrategies,
    resultsYear3Area: currentYear3Area,
    blendedSucroseY3: currentBlendedSucroseY3,
  };

  const allAvailableScenarios = [currentScenarioObj, ...savedScenarios];

  const scenA =
    allAvailableScenarios.find((s) => s.id === scenarioAId) ||
    allAvailableScenarios[1] ||
    currentScenarioObj;
  const scenB =
    allAvailableScenarios.find((s) => s.id === scenarioBId) || currentScenarioObj;

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveName.trim()) return;
    onSaveScenario(saveName.trim(), saveDesc.trim() || 'Custom agronomy scenario');
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setActiveTab('compare');
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
      <div className="bg-(--surface-card) rounded-[10px] max-w-5xl w-full shadow-(--shadow-lg) border border-(--border) overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-(--border) flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[6px] bg-(--surface-sunken) text-(--accent) flex items-center justify-center border border-(--border)">
              <GitCompare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-(--text-primary)">
                Scenario Manager & Sensitivity Comparison
              </h3>
              <p className="text-[12px] text-(--text-muted)">
                Side-by-side comparative analysis of varietal and sucrose projections
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-[8px] bg-(--surface-sunken) p-0.5 border border-(--border)">
              <button
                type="button"
                onClick={() => setActiveTab('compare')}
                className={`px-3 py-1 rounded-[6px] text-[12px] font-medium transition-all cursor-pointer ${
                  activeTab === 'compare'
                    ? 'bg-(--accent) text-white shadow-(--shadow-sm)'
                    : 'text-(--text-secondary) hover:text-(--text-primary)'
                }`}
              >
                Compare
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('save')}
                className={`px-3 py-1 rounded-[6px] text-[12px] font-medium transition-all cursor-pointer ${
                  activeTab === 'save'
                    ? 'bg-(--accent) text-white shadow-(--shadow-sm)'
                    : 'text-(--text-secondary) hover:text-(--text-primary)'
                }`}
              >
                + Save Snapshot
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-(--text-muted) hover:text-(--text-primary) p-1 rounded-[6px] hover:bg-(--surface-sunken) transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 text-[13px]">
          {activeTab === 'save' ? (
            <form onSubmit={handleSaveSubmit} className="max-w-lg mx-auto space-y-4 py-4">
              <div>
                <h4 className="text-[15px] font-semibold text-(--text-primary)">
                  Save Current Parameter Snapshot
                </h4>
                <p className="text-[12px] text-(--text-secondary) mt-1">
                  Name and snapshot the current multiplication rates, caps, seed rates, and variety strategy presets.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-(--text-secondary) mb-1.5">
                  Scenario Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aggressive STP Multiplication (12x) & High Sugar Push"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-full px-3 py-1.5 text-[13px] bg-(--surface-card) text-(--text-primary) border border-(--border) rounded-[8px] focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-(--text-secondary) mb-1.5">
                  Description / Agronomy Rationale
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Assumes single bud settlings, 12x multiplication, and accelerated exit of CO 0238 in Upland circles."
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  className="w-full px-3 py-1.5 text-[13px] bg-(--surface-card) text-(--text-primary) border border-(--border) rounded-[8px] focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-(--border) flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('compare')}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveSuccess}
                  className="btn-primary"
                >
                  {saveSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Saved Successfully!</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Save Snapshot</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Selectors Bar */}
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-(--border)">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-(--text-secondary) block mb-1.5">
                    Baseline Scenario (A)
                  </label>
                  <select
                    value={scenarioAId}
                    onChange={(e) => setScenarioAId(e.target.value)}
                    className="w-full px-3 py-1.5 text-[13px] bg-(--surface-card) text-(--text-primary) border border-(--border) rounded-[8px] focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none font-medium"
                  >
                    {allAvailableScenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.createdAt})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-(--text-secondary) block mb-1.5">
                    Comparison Scenario (B)
                  </label>
                  <select
                    value={scenarioBId}
                    onChange={(e) => setScenarioBId(e.target.value)}
                    className="w-full px-3 py-1.5 text-[13px] bg-(--surface-card) text-(--text-primary) border border-(--border) rounded-[8px] focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none font-medium"
                  >
                    {allAvailableScenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.createdAt})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Side by Side Key Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-(--surface-sunken) p-4 rounded-[8px] border border-(--border) space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-(--text-primary) text-[14px]">
                      {scenA.name}
                    </span>
                    <span className="text-[11px] text-(--text-muted)">{scenA.createdAt}</span>
                  </div>
                  <p className="text-[12px] text-(--text-secondary) italic">
                    {scenA.description}
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-(--border) text-center tabular-nums">
                    <div>
                      <span className="text-[10px] text-(--text-muted) uppercase font-semibold block">
                        Multiplier
                      </span>
                      <div className="font-semibold text-(--text-primary) text-[13px]">
                        {scenA.parameters.defaultMultiplicationFactor}x
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-(--text-muted) uppercase font-semibold block">
                        Seed Rate
                      </span>
                      <div className="font-semibold text-(--text-primary) text-[13px]">
                        {scenA.parameters.seedRateQtlPerHa} qtl
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-(--text-muted) uppercase font-semibold block">
                        Sucrose Y3
                      </span>
                      <div className="font-semibold text-emerald-600 dark:text-emerald-400 text-[13px]">
                        {scenA.blendedSucroseY3}%
                      </div>
                    </div>
                  </div>
                  {scenA.id !== 'current' && (
                    <button
                      type="button"
                      onClick={() => {
                        onLoadScenario(scenA);
                        onClose();
                      }}
                      className="w-full btn-secondary text-center justify-center text-[12px] py-1"
                    >
                      Apply Scenario A to Model
                    </button>
                  )}
                </div>

                <div className="bg-(--accent-subtle) p-4 rounded-[8px] border border-(--accent)/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-(--text-primary) text-[14px]">
                      {scenB.name}
                    </span>
                    <span className="text-[11px] text-(--text-muted)">{scenB.createdAt}</span>
                  </div>
                  <p className="text-[12px] text-(--text-secondary) italic">
                    {scenB.description}
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-(--border) text-center tabular-nums">
                    <div>
                      <span className="text-[10px] text-(--text-muted) uppercase font-semibold block">
                        Multiplier
                      </span>
                      <div className="font-semibold text-(--text-primary) text-[13px]">
                        {scenB.parameters.defaultMultiplicationFactor}x
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-(--text-muted) uppercase font-semibold block">
                        Seed Rate
                      </span>
                      <div className="font-semibold text-(--text-primary) text-[13px]">
                        {scenB.parameters.seedRateQtlPerHa} qtl
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-(--text-muted) uppercase font-semibold block">
                        Sucrose Y3
                      </span>
                      <div className="font-semibold text-emerald-600 dark:text-emerald-400 text-[13px]">
                        {scenB.blendedSucroseY3}%
                      </div>
                    </div>
                  </div>
                  {scenB.id !== 'current' && (
                    <button
                      type="button"
                      onClick={() => {
                        onLoadScenario(scenB);
                        onClose();
                      }}
                      className="w-full btn-secondary text-center justify-center text-[12px] py-1"
                    >
                      Apply Scenario B to Model
                    </button>
                  )}
                </div>
              </div>

              {/* Side by side variety area table */}
              <div className="border border-(--border) rounded-[8px] overflow-hidden">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th className="text-left">Variety</th>
                      <th className="text-right">Scenario A (Y3 ha)</th>
                      <th className="text-right">Scenario B (Y3 ha)</th>
                      <th className="text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {varieties.map((v) => {
                      const haA = scenA.resultsYear3Area?.[v.id] || 0;
                      const haB = scenB.resultsYear3Area?.[v.id] || 0;
                      const delta = haB - haA;
                      return (
                        <tr key={v.id}>
                          <td className="font-medium text-(--text-primary)">{v.name}</td>
                          <td className="text-right tabular-nums text-(--text-secondary)">
                            {haA.toLocaleString()} ha
                          </td>
                          <td className="text-right tabular-nums text-(--text-secondary)">
                            {haB.toLocaleString()} ha
                          </td>
                          <td
                            className={`text-right tabular-nums font-semibold ${
                              delta > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : delta < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-(--text-muted)'
                            }`}
                          >
                            {delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()}{' '}
                            ha
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
