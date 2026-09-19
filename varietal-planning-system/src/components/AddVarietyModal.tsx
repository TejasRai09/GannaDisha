import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  VarietyRecord,
  LandSuitability,
  PlantingSeason,
  AnimalDamageRisk,
  VarietyStrategy,
} from '../types';
import { X, Sprout, Star } from 'lucide-react';

interface AddVarietyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (newVariety: VarietyRecord) => void;
}

const inputCls =
  'w-full h-[34px] px-2.5 text-[13px] bg-(--surface-card) text-(--text-primary) border border-(--border) rounded-[8px] focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none';

/** Extra right padding so the native dropdown arrow never sits on the label. */
const selectCls = inputCls + ' pr-7';

/** One labelled cell in the form grid. Keeps every field the same height. */
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div className="min-w-0">
    <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-(--text-secondary) mb-1">
      {label}
      {hint && (
        <span className="ml-1 font-medium normal-case tracking-normal text-(--text-muted)">
          {hint}
        </span>
      )}
    </label>
    {children}
  </div>
);

export const AddVarietyModal: React.FC<AddVarietyModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [landSuitability, setLandSuitability] = useState<LandSuitability>('UPLAND');
  const [plantingSeason, setPlantingSeason] = useState<PlantingSeason>('SPRING');
  const [juiceSucrosePct, setJuiceSucrosePct] = useState(17.5);
  const [avgCaneWeightGrams, setAvgCaneWeightGrams] = useState(850);
  const [farmerAcceptance, setFarmerAcceptance] = useState(4);
  const [animalDamageRisk, setAnimalDamageRisk] = useState<AnimalDamageRisk>('LOW');
  const [seedAvailableQtl, setSeedAvailableQtl] = useState(5000);
  const [strategy, setStrategy] = useState<VarietyStrategy>('INTRODUCE-NEW');
  const [notes, setNotes] = useState('');

  // Escape closes; the page behind must not scroll while the dialog is up.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newRecord: VarietyRecord = {
      id: id + '-' + Date.now().toString().slice(-4),
      name: name.trim().toUpperCase(),
      currentAreaHa: 0,
      // Added by hand means it is not in the survey yet - by definition a trial.
      stage: 'TRIAL',
      landSuitability,
      plantingSeason,
      juiceSucrosePct: Number(juiceSucrosePct),
      avgCaneWeightGrams: Number(avgCaneWeightGrams),
      farmerAcceptance: Number(farmerAcceptance),
      animalDamageRisk,
      seedAvailableQtl: Number(seedAvailableQtl),
      strategy,
      notes: notes.trim() || 'New research cultivar introduced into nursery programme.',
      isCustom: true,
    };

    onAdd(newRecord);
    onClose();
  };

  // Rendered into <body> so no transformed ancestor can capture `position: fixed`
  // and anchor the dialog to the scrolled page instead of the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add new sugarcane variety"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      {/* max-h-full + flex-col is what keeps the header and footer on screen:
          only the middle section scrolls, and only when it has to. */}
      <div className="relative w-full max-w-3xl max-h-full flex flex-col bg-(--surface-card) rounded-[10px] shadow-(--shadow-lg) border border-(--border) overflow-hidden">
        {/* Header - fixed */}
        <div className="shrink-0 px-5 py-3 border-b border-(--border) flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-[6px] bg-(--surface-sunken) text-(--accent) flex items-center justify-center border border-(--border)">
              <Sprout className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-(--text-primary) truncate">
                Add New Sugarcane Variety
              </h3>
              <p className="text-[12px] text-(--text-muted) truncate">
                Register experimental cultivar or new commercial seed line
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-(--text-muted) hover:text-(--text-primary) p-1 rounded-[6px] hover:bg-(--surface-sunken) transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          {/* Body - the only scrolling region */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
              <Field label="Variety Name / Code *">
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. CO 20021"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Initial Strategy">
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as VarietyStrategy)}
                  className={selectCls}
                >
                  <option value="INTRODUCE-NEW">INTRODUCE-NEW — initial nursery</option>
                  <option value="EXPAND">EXPAND — rapid multiplication</option>
                  <option value="HOLD">HOLD — commercial observation</option>
                  <option value="REDUCE">REDUCE — phasing down</option>
                  <option value="EXIT">EXIT — de-notified</option>
                </select>
              </Field>

              <Field label="Land Suitability">
                <select
                  value={landSuitability}
                  onChange={(e) => setLandSuitability(e.target.value as LandSuitability)}
                  className={selectCls}
                >
                  <option value="UPLAND">UPLAND — well-drained loam</option>
                  <option value="LOWLAND">LOWLAND — waterlogging tolerant</option>
                  <option value="BOTH">BOTH — broad tolerance</option>
                </select>
              </Field>

              <Field label="Planting Season">
                <select
                  value={plantingSeason}
                  onChange={(e) => setPlantingSeason(e.target.value as PlantingSeason)}
                  className={selectCls}
                >
                  <option value="SPRING">SPRING — Feb to Mar</option>
                  <option value="AUTUMN">AUTUMN — Oct to Nov</option>
                  <option value="BOTH">BOTH — spring and autumn</option>
                </select>
              </Field>

              <Field label="Juice Sucrose" hint="% pol in cane">
                <input
                  type="number"
                  step="0.1"
                  min="12"
                  max="22"
                  value={juiceSucrosePct}
                  onChange={(e) => setJuiceSucrosePct(parseFloat(e.target.value))}
                  className={inputCls + ' tabular-nums'}
                />
              </Field>

              <Field label="Avg Cane Weight" hint="grams">
                <input
                  type="number"
                  min="300"
                  max="1400"
                  value={avgCaneWeightGrams}
                  onChange={(e) => setAvgCaneWeightGrams(parseInt(e.target.value))}
                  className={inputCls + ' tabular-nums'}
                />
              </Field>

              <Field label="Seed Available" hint="quintals">
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={seedAvailableQtl}
                  onChange={(e) => setSeedAvailableQtl(parseInt(e.target.value))}
                  className={inputCls + ' tabular-nums'}
                />
              </Field>

              <Field label="Animal Damage Risk">
                <select
                  value={animalDamageRisk}
                  onChange={(e) => setAnimalDamageRisk(e.target.value as AnimalDamageRisk)}
                  className={selectCls}
                >
                  <option value="LOW">LOW — tough rind</option>
                  <option value="MEDIUM">MEDIUM — standard rind</option>
                  <option value="HIGH">HIGH — sweet, thin rind</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
              <Field label="Farmer Acceptance" hint="1 to 5">
                <div className="flex items-center gap-0.5 h-[34px]">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      aria-label={`${star} of 5`}
                      onClick={() => setFarmerAcceptance(star)}
                      className="p-0.5 hover:scale-110 transition-transform cursor-pointer"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          star <= farmerAcceptance
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-(--border-strong)'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </Field>

              <div className="sm:col-span-2">
                <Field label="Agronomic Notes" hint="optional">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. tolerant to red rot race CF08, high tillering"
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Footer - always visible */}
          <div className="shrink-0 px-5 py-3 border-t border-(--border) bg-(--surface-sunken) flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Add to Registry
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
