import React, { useState, useMemo, useRef } from 'react';
import {
  VarietyRecord,
  LandSuitability,
  PlantingSeason,
  AnimalDamageRisk,
  VarietyStrategy,
} from '../types';
import { AddVarietyModal } from './AddVarietyModal';
import {
  Plus,
  Download,
  Upload,
  Search,
  ArrowUpDown,
  Star,
  ArrowRight,
  LayoutGrid,
  Table as TableIcon,
  BarChart2,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Droplets,
  Sprout,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import { useToast } from './Toast';
import {
  downloadVarietyTemplate,
  parseVarietySheet,
  applyVarietySheet,
} from '../lib/varietySheet';

interface Step2VarietiesProps {
  varieties: VarietyRecord[];
  onUpdateVariety: (variety: VarietyRecord) => void;
  onAddVariety: (newVariety: VarietyRecord) => void;
  /** Replaces the whole registry - used when a filled sheet is uploaded. */
  onReplaceVarieties?: (next: VarietyRecord[]) => void;
  /** Named on the generated template so the file records where it came from. */
  surveyFileName?: string;
  onProceedToParameters: () => void;
  isDark?: boolean;
}

export const Step2Varieties: React.FC<Step2VarietiesProps> = ({
  varieties,
  onUpdateVariety,
  onAddVariety,
  onReplaceVarieties,
  surveyFileName,
  onProceedToParameters,
  isDark = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');
  const [landFilter, setLandFilter] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [sortField, setSortField] = useState<keyof VarietyRecord>('currentAreaHa');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'matrix'>('cards');
  const { showToast } = useToast();
  const sheetInputRef = useRef<HTMLInputElement>(null);

  /** Build the input sheet from whatever survey is loaded and hand it over. */
  const handleDownloadTemplate = () => {
    if (!varieties.length) {
      showToast('Nothing to put in the template', 'error', 'Load the survey on Step 1 first.');
      return;
    }
    try {
      const name = downloadVarietyTemplate(varieties, surveyFileName);
      showToast(
        'Template downloaded',
        'success',
        `${varieties.length} varieties listed. ${name}`
      );
    } catch (err) {
      showToast('Could not build the template', 'error', err instanceof Error ? err.message : '');
    }
  };

  /** Read a filled sheet back. Blank cells are left alone, never written as 0. */
  const handleSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      showToast('Wrong file type', 'error', 'Please upload the .xlsx variety sheet.');
      return;
    }
    file.arrayBuffer().then(
      (buf) => {
        try {
          const parsed = parseVarietySheet(buf);
          if (parsed.values.size === 0) {
            showToast(
              'Nothing to apply',
              'info',
              `Read ${parsed.rowCount} rows but every agronomy column was blank.`
            );
            return;
          }
          const { next, updated, unmatched } = applyVarietySheet(varieties, parsed);
          if (onReplaceVarieties) onReplaceVarieties(next);
          const bits = [`${updated} varieties updated`];
          if (parsed.blankRows) bits.push(`${parsed.blankRows} rows left blank`);
          if (unmatched.length) bits.push(`${unmatched.length} not in this survey`);
          showToast('Variety sheet applied', 'success', bits.join(' · '));
          parsed.warnings.forEach((w) => showToast('Check the sheet', 'info', w));
        } catch (err) {
          showToast(
            'Could not read the sheet',
            'error',
            err instanceof Error ? err.message : 'Unreadable workbook.'
          );
        }
      },
      () => showToast('Could not read the sheet', 'error', 'The file could not be opened.')
    );
  };

  const handleSort = (field: keyof VarietyRecord) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredVarieties = useMemo(() => {
    return varieties
      .filter((v) => {
        const matchesSearch =
          v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.notes.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStrategy = strategyFilter === 'ALL' || v.strategy === strategyFilter;
        const matchesLand = landFilter === 'ALL' || v.landSuitability === landFilter;
        return matchesSearch && matchesStrategy && matchesLand;
      })
      .sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }
        return 0;
      });
  }, [varieties, searchTerm, strategyFilter, landFilter, sortField, sortDirection]);

  const getStrategyBadgeClass = (strat: VarietyStrategy) => {
    switch (strat) {
      case 'EXPAND':
        return 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30';
      case 'EXIT':
        return 'bg-rose-500/12 text-rose-700 dark:text-rose-400 border border-rose-500/30';
      case 'HOLD':
        return 'bg-slate-500/12 text-(--text-secondary) border border-slate-500/20';
      case 'REDUCE':
        return 'bg-amber-500/12 text-amber-700 dark:text-amber-400 border border-amber-500/30';
      case 'INTRODUCE-NEW':
        return 'bg-blue-500/12 text-blue-700 dark:text-blue-400 border border-blue-500/30';
      default:
        return 'bg-slate-500/12 text-(--text-secondary)';
    }
  };

  const handleFieldChange = (
    v: VarietyRecord,
    field: keyof VarietyRecord,
    value: any
  ) => {
    const updated: VarietyRecord = {
      ...v,
      [field]: value,
      isEdited: true,
    };
    onUpdateVariety(updated);
  };

  const handleExportExcel = () => {
    const headers = [
      'Variety Name',
      'Current Area (ha)',
      'Land Suitability',
      'Planting Season',
      'Juice Sucrose %',
      'Avg Cane Weight (g)',
      'Farmer Acceptance (1-5)',
      'Animal Damage Risk',
      'Seed Available (qtl)',
      'Strategy',
      'Notes',
    ];

    const rows = varieties.map((v) => [
      `"${v.name}"`,
      v.currentAreaHa,
      `"${v.landSuitability}"`,
      `"${v.plantingSeason}"`,
      v.juiceSucrosePct,
      v.avgCaneWeightGrams,
      v.farmerAcceptance,
      `"${v.animalDamageRisk}"`,
      v.seedAvailableQtl,
      `"${v.strategy}"`,
      `"${v.notes.replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Gobind_Sugar_Varieties_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Varietal catalog exported successfully', 'success', 'Saved as CSV for Excel');
  };

  return (
    <div className="space-y-6 pb-16 screen-fade-in">
      {/* Screen Header */}
      <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-bold text-(--text-primary) tracking-tight">
              Step 2: Bio-Agronomic Varietal Registry
            </h2>
            <span className="app-chip bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">
              {varieties.length} Cultivars Monitored
            </span>
          </div>
          <p className="text-[13px] text-(--text-secondary) mt-1 max-w-3xl leading-relaxed">
            Calibrate cultivar physical profiles, sugar recovery benchmarks, farmer acceptance ratings, and disease defense strategies.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={sheetInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleSheetUpload}
            className="hidden"
          />

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="btn-secondary"
            title="Download an Excel sheet with every variety from the survey already listed"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Download Template</span>
          </button>

          <button
            type="button"
            onClick={() => sheetInputRef.current?.click()}
            className="btn-secondary"
            title="Upload the filled-in variety sheet"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Sheet</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="btn-secondary"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="btn-secondary"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Variety</span>
          </button>

          <button
            type="button"
            onClick={onProceedToParameters}
            className="btn-primary"
          >
            <span>Proceed to Parameters</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter, Search & View Switcher Bar */}
      <div className="bg-(--surface-card) p-3 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search */}
          <div className="relative w-full max-w-xs">
            <Search className="w-3.5 h-3.5 text-(--text-muted) absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search cultivar name or agronomy notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-(--surface-sunken) text-(--text-primary) border border-(--border) rounded-lg focus:outline-none focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent)"
            />
          </div>

          {/* Strategy Filter */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-(--text-secondary) whitespace-nowrap">
              Strategy:
            </label>
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="text-[12px] bg-(--surface-sunken) text-(--text-primary) border border-(--border) rounded-lg py-1 px-2.5 focus:outline-none focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) cursor-pointer"
            >
              <option value="ALL">All Strategies</option>
              <option value="EXPAND">EXPAND (Seed Priority)</option>
              <option value="HOLD">HOLD (Sustained Yield)</option>
              <option value="REDUCE">REDUCE (Controlled Phase-down)</option>
              <option value="EXIT">EXIT (Emergency Replacement)</option>
              <option value="INTRODUCE-NEW">INTRODUCE-NEW (STP Nursery)</option>
            </select>
          </div>

          {/* Land Type Filter */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-(--text-secondary) whitespace-nowrap">
              Land:
            </label>
            <select
              value={landFilter}
              onChange={(e) => setLandFilter(e.target.value)}
              className="text-[12px] bg-(--surface-sunken) text-(--text-primary) border border-(--border) rounded-lg py-1 px-2.5 focus:outline-none focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) cursor-pointer"
            >
              <option value="ALL">All Land Types</option>
              <option value="UPLAND">UPLAND Only</option>
              <option value="LOWLAND">LOWLAND (Waterlogging)</option>
              <option value="BOTH">Universal (BOTH)</option>
            </select>
          </div>
        </div>

        {/* View Mode Toggle & Counter */}
        <div className="flex items-center gap-3">
          <div className="text-[12px] text-(--text-muted) font-medium hidden sm:inline">
            Showing <strong className="text-(--text-primary) font-mono">{filteredVarieties.length}</strong> of {varieties.length}
          </div>

          <div className="inline-flex bg-(--surface-sunken) p-0.5 rounded-lg border border-(--border)">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-(--surface-card) text-(--text-primary) shadow-xs font-semibold'
                  : 'text-(--text-secondary) hover:text-(--text-primary)'
              }`}
              title="Visual Agronomic Cards View"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Cards</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-(--surface-card) text-(--text-primary) shadow-xs font-semibold'
                  : 'text-(--text-secondary) hover:text-(--text-primary)'
              }`}
              title="Dense Spreadsheet Table View"
            >
              <TableIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Table</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
                viewMode === 'matrix'
                  ? 'bg-(--surface-card) text-(--text-primary) shadow-xs font-semibold'
                  : 'text-(--text-secondary) hover:text-(--text-primary)'
              }`}
              title="Comparative Agronomic Benchmarks"
            >
              <BarChart2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Matrix</span>
            </button>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: VISUAL AGRONOMIC CARDS */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVarieties.map((v) => {
            const isExit = v.strategy === 'EXIT';
            const isExpand = v.strategy === 'EXPAND';
            const isHighSugar = v.juiceSucrosePct >= 18.0;

            return (
              <div
                key={v.id}
                className={`bg-(--surface-card) rounded-[12px] p-4 border transition-all duration-200 hover:shadow-(--shadow-md) flex flex-col justify-between group ${
                  isExit
                    ? 'border-rose-500/30 hover:border-rose-500/50'
                    : isExpand
                    ? 'border-emerald-500/30 hover:border-emerald-500/50'
                    : 'border-(--border) hover:border-(--border-strong)'
                }`}
              >
                <div>
                  {/* Top Bar: Name, Badges & Strategy */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[16px] font-bold text-(--text-primary) tracking-tight group-hover:text-(--accent) transition-colors">
                          {v.name}
                        </h3>
                        {v.isCustom && (
                          <span className="app-chip bg-purple-500/15 text-purple-700 dark:text-purple-300 text-[10px]">
                            Custom
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-(--text-muted) font-medium">
                        {v.plantingSeason} Planting • {v.landSuitability}
                      </span>
                    </div>

                    <select
                      value={v.strategy}
                      onChange={(e) =>
                        handleFieldChange(v, 'strategy', e.target.value as VarietyStrategy)
                      }
                      className={`text-[11px] font-bold rounded-lg px-2 py-1 cursor-pointer focus:outline-none transition-all ${getStrategyBadgeClass(
                        v.strategy
                      )}`}
                    >
                      <option value="EXPAND">EXPAND</option>
                      <option value="HOLD">HOLD</option>
                      <option value="REDUCE">REDUCE</option>
                      <option value="EXIT">EXIT</option>
                      <option value="INTRODUCE-NEW">INTRODUCE-NEW</option>
                    </select>
                  </div>

                  {/* Key Vital Metrics Row */}
                  <div className="grid grid-cols-2 gap-2 my-3 p-2.5 rounded-lg bg-(--surface-sunken) border border-(--border)/60">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-(--text-muted) block">
                        Current Catchment
                      </span>
                      <div className="text-[15px] font-bold text-(--text-primary) font-mono mt-0.5">
                        {v.currentAreaHa.toLocaleString()}{' '}
                        <span className="text-[11px] font-normal text-(--text-muted)">ha</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-(--text-muted) block">
                        Sucrose Content
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[15px] font-bold text-(--text-primary) font-mono">
                          {v.juiceSucrosePct.toFixed(1)}%
                        </span>
                        {isHighSugar && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                            High Brix
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Agronomic Profile Bars & Inputs */}
                  <div className="space-y-2.5 text-[12px]">
                    {/* Sucrose Gauge Bar */}
                    <div>
                      <div className="flex justify-between text-[11px] text-(--text-secondary) mb-1">
                        <span>Sugar Juice Density</span>
                        <span className="font-mono font-semibold">{v.juiceSucrosePct}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-(--surface-sunken) rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            v.juiceSucrosePct >= 18.5
                              ? 'bg-emerald-500'
                              : v.juiceSucrosePct >= 17.5
                              ? 'bg-teal-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(100, ((v.juiceSucrosePct - 14) / 8) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Weight & Multiplication Row */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5 text-(--text-secondary)">
                        <span className="text-[11px] font-medium">Avg Weight:</span>
                        <input
                          type="number"
                          value={v.avgCaneWeightGrams}
                          onChange={(e) =>
                            handleFieldChange(
                              v,
                              'avgCaneWeightGrams',
                              e.target.value ? parseInt(e.target.value) : 750
                            )
                          }
                          className="w-16 px-1.5 py-0.5 text-right font-mono font-medium rounded border border-(--border) bg-(--surface-sunken) focus:ring-1 focus:ring-(--accent)"
                        />
                        <span className="text-[11px] text-(--text-muted)">g</span>
                      </div>

                    </div>

                    {/* Farmer Acceptance & Animal Risk */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-(--border)/60">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-(--text-muted)">Farmer Rating:</span>
                        <div className="flex items-center">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => handleFieldChange(v, 'farmerAcceptance', star)}
                              className="p-0.5 hover:scale-110 transition-transform cursor-pointer"
                              title={`Rate ${star}/5`}
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${
                                  star <= v.farmerAcceptance
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-(--border-strong)'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-(--text-muted)">Animal Risk:</span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            v.animalDamageRisk === 'HIGH'
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                              : v.animalDamageRisk === 'MEDIUM'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {v.animalDamageRisk}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Notes */}
                <div className="mt-3 pt-2.5 border-t border-(--border)/60 text-[11px] text-(--text-secondary) flex flex-col gap-1.5">
                  <span className="line-clamp-2 leading-snug" title={v.notes}>
                    {v.notes}
                  </span>
                  <div className="text-[11px] text-(--text-muted) font-mono">
                    Seed: <strong className="text-(--text-primary)">{v.seedAvailableQtl.toLocaleString()}</strong> qtl
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE 2: DENSE SPREADSHEET TABLE */}
      {viewMode === 'table' && (
        <div className="bg-(--surface-card) rounded-[12px] border border-(--border) shadow-(--shadow-sm) overflow-hidden">
          <div className="overflow-x-auto max-h-[640px]">
            <table className="app-table">
              <thead>
                <tr>
                  <th
                    onClick={() => handleSort('name')}
                    className="cursor-pointer hover:text-(--text-primary) transition-colors text-left"
                  >
                    <div className="flex items-center gap-1">
                      <span>Variety Name</span>
                      <ArrowUpDown className="w-3 h-3 text-(--text-muted)" />
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('currentAreaHa')}
                    className="cursor-pointer hover:text-(--text-primary) transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Current Area</span>
                      <ArrowUpDown className="w-3 h-3 text-(--text-muted)" />
                    </div>
                  </th>

                  <th className="text-left">Land Suitability</th>
                  <th className="text-left">Planting Season</th>

                  <th
                    onClick={() => handleSort('juiceSucrosePct')}
                    className="cursor-pointer hover:text-(--text-primary) transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Sucrose %</span>
                      <ArrowUpDown className="w-3 h-3 text-(--text-muted)" />
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('avgCaneWeightGrams')}
                    className="cursor-pointer hover:text-(--text-primary) transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Avg Wt (g)</span>
                      <ArrowUpDown className="w-3 h-3 text-(--text-muted)" />
                    </div>
                  </th>

                  <th className="text-left">Farmer Rating</th>
                  <th className="text-left">Animal Risk</th>



                  <th
                    onClick={() => handleSort('seedAvailableQtl')}
                    className="cursor-pointer hover:text-(--text-primary) transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Seed Avail (qtl)</span>
                      <ArrowUpDown className="w-3 h-3 text-(--text-muted)" />
                    </div>
                  </th>

                  <th className="text-left">Strategy</th>
                  <th className="text-left min-w-[160px]">Notes</th>
                </tr>
              </thead>

              <tbody>
                {filteredVarieties.map((v) => {
                  const isEdited = v.isEdited;

                  return (
                    <tr key={v.id} className="relative group/row">
                      {/* Variety Name */}
                      <td className="font-semibold text-(--text-primary) whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{v.name}</span>
                          {v.isCustom && (
                            <span className="app-chip bg-purple-500/12 text-purple-700 dark:text-purple-400 text-[10px]">
                              New
                            </span>
                          )}
                          {isEdited && (
                            <span
                              title="Edited row"
                              className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                            />
                          )}
                        </div>
                      </td>

                      {/* Current Area ha (Read-only baseline) */}
                      <td className="text-right font-medium text-(--text-secondary) tabular-nums whitespace-nowrap">
                        {v.currentAreaHa.toLocaleString()}{' '}
                        <span className="text-[11px] text-(--text-muted) font-normal">ha</span>
                      </td>

                      {/* Land Suitability */}
                      <td className="whitespace-nowrap">
                        <select
                          value={v.landSuitability}
                          onChange={(e) =>
                            handleFieldChange(v, 'landSuitability', e.target.value as LandSuitability)
                          }
                          className="text-[12px] bg-transparent border border-transparent hover:border-(--border-strong) rounded-[6px] px-1.5 py-1 focus:bg-(--surface-card) focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none transition-all cursor-pointer"
                        >
                          <option value="UPLAND">UPLAND</option>
                          <option value="LOWLAND">LOWLAND</option>
                          <option value="BOTH">BOTH</option>
                        </select>
                      </td>

                      {/* Planting Season */}
                      <td className="whitespace-nowrap">
                        <select
                          value={v.plantingSeason}
                          onChange={(e) =>
                            handleFieldChange(v, 'plantingSeason', e.target.value as PlantingSeason)
                          }
                          className="text-[12px] bg-transparent border border-transparent hover:border-(--border-strong) rounded-[6px] px-1.5 py-1 focus:bg-(--surface-card) focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none transition-all cursor-pointer"
                        >
                          <option value="SPRING">SPRING</option>
                          <option value="AUTUMN">AUTUMN</option>
                          <option value="BOTH">BOTH</option>
                        </select>
                      </td>

                      {/* Juice Sucrose % */}
                      <td className="text-right whitespace-nowrap relative">
                        <div className="relative inline-block">
                          <input
                            type="number"
                            step="0.1"
                            min="14"
                            max="22"
                            value={v.juiceSucrosePct || ''}
                            onChange={(e) =>
                              handleFieldChange(
                                v,
                                'juiceSucrosePct',
                                e.target.value ? parseFloat(e.target.value) : 17.0
                              )
                            }
                            className="w-16 text-right px-1.5 py-1 border border-transparent hover:border-dashed hover:border-(--border-strong) rounded-[6px] tabular-nums focus:bg-(--surface-card) focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none transition-all"
                          />
                        </div>
                      </td>

                      {/* Avg Cane Weight grams */}
                      <td className="text-right whitespace-nowrap relative">
                        <div className="relative inline-block">
                          <input
                            type="number"
                            min="300"
                            max="1200"
                            value={v.avgCaneWeightGrams || ''}
                            onChange={(e) =>
                              handleFieldChange(
                                v,
                                'avgCaneWeightGrams',
                                e.target.value ? parseInt(e.target.value) : 750
                              )
                            }
                            className="w-16 text-right px-1.5 py-1 border border-transparent hover:border-dashed hover:border-(--border-strong) rounded-[6px] tabular-nums focus:bg-(--surface-card) focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none transition-all"
                          />
                        </div>
                      </td>

                      {/* Farmer Rating Stars */}
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => handleFieldChange(v, 'farmerAcceptance', star)}
                              className="p-0.5 hover:scale-110 transition-transform cursor-pointer"
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${
                                  star <= v.farmerAcceptance
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-(--border-strong)'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </td>

                      {/* Animal Risk */}
                      <td className="whitespace-nowrap">
                        <select
                          value={v.animalDamageRisk}
                          onChange={(e) =>
                            handleFieldChange(v, 'animalDamageRisk', e.target.value as AnimalDamageRisk)
                          }
                          className="text-[12px] bg-transparent border border-transparent hover:border-(--border-strong) rounded-[6px] px-1.5 py-1 focus:bg-(--surface-card) focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none transition-all cursor-pointer"
                        >
                          <option value="LOW">LOW</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HIGH">HIGH</option>
                        </select>
                      </td>


                      {/* Seed Available (qtl) */}
                      <td className="text-right whitespace-nowrap relative">
                        <input
                          type="number"
                          min="0"
                          step="500"
                          value={v.seedAvailableQtl ?? ''}
                          onChange={(e) =>
                            handleFieldChange(
                              v,
                              'seedAvailableQtl',
                              e.target.value ? parseInt(e.target.value) : 0
                            )
                          }
                          className="w-20 text-right px-1.5 py-1 border border-transparent hover:border-dashed hover:border-(--border-strong) rounded-[6px] tabular-nums focus:bg-(--surface-card) focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none transition-all font-medium"
                        />
                      </td>

                      {/* Strategy Badge Selector */}
                      <td className="whitespace-nowrap">
                        <select
                          value={v.strategy}
                          onChange={(e) =>
                            handleFieldChange(v, 'strategy', e.target.value as VarietyStrategy)
                          }
                          className={`text-[11px] font-semibold rounded-[6px] px-2 py-0.5 border border-transparent cursor-pointer focus:outline-none focus:ring-2 focus:ring-(--accent)/40 ${getStrategyBadgeClass(
                            v.strategy
                          )}`}
                        >
                          <option value="EXPAND">EXPAND</option>
                          <option value="HOLD">HOLD</option>
                          <option value="REDUCE">REDUCE</option>
                          <option value="EXIT">EXIT</option>
                          <option value="INTRODUCE-NEW">INTRODUCE-NEW</option>
                        </select>
                      </td>

                      {/* Notes */}
                      <td className="min-w-[220px] max-w-[340px]">
                      <span className="line-clamp-2 leading-snug" title={v.notes}>{v.notes}</span>
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 3: COMPARISON MATRIX */}
      {viewMode === 'matrix' && (
        <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[16px] font-bold text-(--text-primary)">
                Agronomic Performance vs Acreage Matrix
              </h3>
              <p className="text-[12px] text-(--text-secondary)">
                Benchmarking sugar recovery potency (Sucrose %) against current command footprint
              </p>
            </div>
            <div className="text-[11px] text-(--text-muted) flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> High Sugar (≥18%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500" /> Standard Prime
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Exit / Vulnerable
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {varieties.map((v) => {
              const maxArea = Math.max(...varieties.map((item) => item.currentAreaHa));
              const areaWidthPct = Math.max(4, Math.round((v.currentAreaHa / maxArea) * 100));

              return (
                <div
                  key={v.id}
                  className="p-3 rounded-lg bg-(--surface-sunken) border border-(--border)/60 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="w-48 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold text-(--text-primary)">{v.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${getStrategyBadgeClass(v.strategy)}`}>
                        {v.strategy}
                      </span>
                    </div>
                    <span className="text-[11px] text-(--text-muted)">
                      {v.landSuitability} • {v.plantingSeason}
                    </span>
                  </div>

                  {/* Relative Area Bar */}
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex justify-between text-[11px] text-(--text-secondary) mb-1">
                      <span>Catchment Footprint:</span>
                      <strong className="text-(--text-primary) font-mono">
                        {v.currentAreaHa.toLocaleString()} ha
                      </strong>
                    </div>
                    <div className="h-2 w-full bg-(--surface-card) rounded-full overflow-hidden border border-(--border)">
                      <div
                        className={`h-full rounded-full ${
                          v.strategy === 'EXIT'
                            ? 'bg-rose-500'
                            : v.strategy === 'EXPAND'
                            ? 'bg-emerald-500'
                            : 'bg-teal-600'
                        }`}
                        style={{ width: `${areaWidthPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Sucrose Score & Multiplier */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase text-(--text-muted)">Sucrose</div>
                      <div className="text-[14px] font-bold text-(--text-primary) font-mono">
                        {v.juiceSucrosePct.toFixed(1)}%
                      </div>
                    </div>

                    <div className="text-right min-w-[80px]">
                      <div className="text-[10px] font-bold uppercase text-(--text-muted)">Seed Stock</div>
                      <div className="text-[12px] font-semibold text-(--text-primary) font-mono">
                        {v.seedAvailableQtl.toLocaleString()} q
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Variety Modal */}
      <AddVarietyModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={onAddVariety}
      />
    </div>
  );
};
