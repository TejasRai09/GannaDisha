import React, { useState, useMemo } from 'react';
import { VillageAllocation, AllocationResult } from '../types';
import { AnimatedMetricCard } from './AnimatedMetricCard';
import { useToast } from './Toast';
import {
  MapPin,
  Search,
  AlertOctagon,
  Building,
  Layers,
  FileSpreadsheet,
  FileDown,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  X,
  Sparkles,
} from 'lucide-react';

interface Step6AllocationProps {
  villages: VillageAllocation[];
  /** Full plot-level result. Null until a survey has been loaded. */
  allocation?: AllocationResult | null;
  isDark?: boolean;
}

export const Step6Allocation: React.FC<Step6AllocationProps> = ({ villages, allocation, isDark = false }) => {
  const [societyFilter, setSocietyFilter] = useState<string>('ALL');
  const [villageSearch, setVillageSearch] = useState<string>('');
  const [varietyFilter, setVarietyFilter] = useState<string>('ALL');
  const [landFilter, setLandFilter] = useState<string>('ALL');
  const [selectedVillage, setSelectedVillage] = useState<VillageAllocation | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 25;
  const { showToast } = useToast();

  // Extract unique societies and varieties for filters
  const societies = useMemo(() => {
    return Array.from(new Set(villages.map((v) => v.society))).sort();
  }, [villages]);

  const varieties = useMemo(() => {
    return Array.from(new Set(villages.map((v) => v.varietyToPlant))).sort();
  }, [villages]);

  // Filtered villages
  const filteredVillages = useMemo(() => {
    return villages.filter((v) => {
      const matchesSociety = societyFilter === 'ALL' || v.society === societyFilter;
      const matchesVariety = varietyFilter === 'ALL' || v.varietyToPlant === varietyFilter;
      const matchesLand = landFilter === 'ALL' || v.landType === landFilter;
      const matchesSearch =
        v.village.toLowerCase().includes(villageSearch.toLowerCase()) ||
        v.society.toLowerCase().includes(villageSearch.toLowerCase());
      return matchesSociety && matchesVariety && matchesLand && matchesSearch;
    });
  }, [villages, societyFilter, varietyFilter, landFilter, villageSearch]);

  // Pagination logic
  const totalPages = Math.ceil(filteredVillages.length / pageSize) || 1;
  const paginatedVillages = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVillages.slice(start, start + pageSize);
  }, [filteredVillages, currentPage, pageSize]);

  // Reset page when filter changes
  const handleSocietyChange = (soc: string) => {
    setSocietyFilter(soc);
    setCurrentPage(1);
  };

  // Totals
  // Rows are village x variety x land type, so counting rows counted 2,142
  // "villages" against a survey of 334. Count the villages themselves.
  const totalVillagesCount = new Set(filteredVillages.map((v) => v.village)).size;
  // A plot split between two varieties appears in two rows. Sum the rows and a
  // split plot is counted twice, which overstated plots by about 6%.
  const totalFieldsCount = filteredVillages.reduce((sum, v) => sum + v.numberOfFields, 0);
  const totalPlanLinesCount = filteredVillages.length;
  const totalAllocatedHa = filteredVillages.reduce((sum, v) => sum + v.areaFreeToReplantHa, 0);

  // Priority Actions items
  const priorityItems = villages.filter((v) => v.isPriorityAction);

  /** Quote a CSV field and escape any quotes inside it. */
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const saveCsv = (name: string, headers: string[], rows: (string | number)[][]) => {
    const csv = [headers.map(q).join(','), ...rows.map((r) => r.join(','))].join(String.fromCharCode(10));
    // A Blob rather than a data: URI - the field dispatch runs to tens of
    // thousands of rows and a data: URI is capped well below that.
    // BOM so Excel opens it as UTF-8 rather than mangling the variety names.
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const handleDownloadVillagePlanExcel = () => {
    const headers = [
      'Year', 'Basis', 'Society', 'Village Name', 'Land Type',
      'Area to Plant (ha)', 'Variety to Plant', 'Blocks', 'Priority Flag',
      'Agronomy Directive',
    ];
    const rows = filteredVillages.map((v) => [
      v.year ?? 1,
      q((v.year ?? 1) === 1 ? 'Surveyed' : 'Projected'),
      q(v.society), q(v.village), q(v.landType),
      v.areaFreeToReplantHa, q(v.varietyToPlant), v.numberOfFields,
      v.isPriorityAction ? 'YES' : 'NO',
      q(v.priorityNote || 'Standard seed distribution'),
    ]);
    saveCsv(
      `Gobind_Village_Plan_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
    const years = new Set(filteredVillages.map((v) => v.year ?? 1)).size;
    showToast(
      'Village plan downloaded',
      'success',
      `${rows.length.toLocaleString()} instructions across ${years} year${years === 1 ? '' : 's'}.`
    );
  };

  /**
   * One row per block - the actual instruction for one piece of ground.
   *
   * This used to invent farmer names and fabricate field areas for the first 25
   * villages. It now writes the real allocation: every block the engine placed,
   * with the plot it belongs to and whether its land type was measured or
   * inferred, so a supervisor can see which instructions rest on what.
   */
  const handleDownloadFieldPlanCSV = () => {
    if (!allocation?.blocks.length) {
      showToast('Nothing to export', 'info', 'No allocation has been produced yet.');
      return;
    }
    const seedRate = 65;
    const headers = [
      'Year', 'Basis', 'Plot ID', 'Society', 'Village', 'Grower Code',
      'Land Type', 'Land Type Source', 'Block Area (ha)', 'Variety to Plant',
      'Replaces', 'Plot Split', 'Seed Required (qtl)', 'Priority', 'Note',
    ];
    const rows = allocation.blocks.map((b) => [
      b.year,
      q(b.basis === 'SURVEYED' ? 'Surveyed' : 'Projected'),
      q(b.plotId), q(b.society), q(b.village), q(b.grower),
      q(b.landType), q(b.landTypeSource ?? 'UNKNOWN'),
      b.areaHa.toFixed(3), q(b.variety), q(b.previousVariety),
      b.isSplit ? 'YES' : 'NO',
      (b.areaHa * seedRate).toFixed(1),
      b.isPriority ? 'YES' : 'NO',
      q(b.priorityNote || ''),
    ]);
    saveCsv(
      `Gobind_Field_Dispatch_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
    showToast(
      'Field dispatch downloaded',
      'success',
      `${rows.length.toLocaleString()} blocks across ${allocation.byYear?.length ?? 1} years.`
    );
  };

  return (
    <div className="space-y-6 pb-28 screen-fade-in">
      {/* Screen Header */}
      <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-bold text-(--text-primary) tracking-tight">
              Step 6: Village & Field Operational Allocation Plan
            </h2>
            <span className="app-chip bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">
              Ground Dispatch Matrix
            </span>
          </div>
          <p className="text-[13px] text-(--text-secondary) mt-1 max-w-3xl leading-relaxed">
            Granular village field distribution mapping approved varieties onto re-plantable land across 7 cane societies and 334 command villages.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadVillagePlanExcel}
            className="btn-secondary"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Village Plan (CSV)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadFieldPlanCSV}
            className="btn-primary"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Field Dispatch (CSV)</span>
          </button>
        </div>
      </div>

      {/* What the run actually achieved. Without this the screen shows only what
          was placed and stays silent about what could not be. */}
      {allocation && (
        <div className="bg-(--surface-card) p-4 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
          <span className="font-bold text-(--text-primary) text-[13px]">Allocation run</span>
          <span className="text-(--text-secondary)">
            <strong className="text-(--text-primary) tabular-nums">
              {allocation.totalAllocatedHa.toLocaleString()}
            </strong>{' '}
            of {allocation.totalFreeHa.toLocaleString()} free ha placed
            {allocation.totalFreeHa > 0 && (
              <> ({((allocation.totalAllocatedHa / allocation.totalFreeHa) * 100).toFixed(1)}%)</>
            )}
          </span>
          <span className="text-(--text-secondary)">
            <strong className="text-(--text-primary) tabular-nums">
              {allocation.plotsUsed.toLocaleString()}
            </strong>{' '}
            plots used, <strong className="text-(--text-primary) tabular-nums">
              {allocation.plotsSplit.toLocaleString()}
            </strong>{' '}
            split between varieties
          </span>
          {allocation.unassignedPlots > 0 && (
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              {allocation.unassignedPlots.toLocaleString()} plots ({allocation.unassignedHa.toLocaleString()} ha)
              had no eligible variety
            </span>
          )}
          {Object.keys(allocation.unmetHa).length > 0 && (
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              Short: {Object.entries(allocation.unmetHa)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([n, ha]) => `${n} ${ha.toLocaleString()} ha`)
                .join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <AnimatedMetricCard
          label="Villages With Planting"
          value={totalVillagesCount}
          subtext={`${totalPlanLinesCount.toLocaleString()} village-variety instructions`}
          trend="neutral"
          icon={<MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        />

        <AnimatedMetricCard
          label="Blocks To Plant"
          value={totalFieldsCount}
          suffix=" blocks"
          subtext={
            allocation
              ? `${allocation.plotsUsed.toLocaleString()} plots, ${allocation.plotsSplit.toLocaleString()} carrying two varieties`
              : 'Bonded survey parcels for Year 1 planting'
          }
          trend="neutral"
          icon={<Building className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
        />

        <AnimatedMetricCard
          label="Total Area Allocated"
          value={totalAllocatedHa}
          suffix=" ha"
          subtext="Re-plantable land earmarked for seeding"
          trend="neutral"
          icon={<Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
        />
      </div>

      {/* Priority Actions Section */}
      <div className="bg-(--surface-card) p-5 rounded-[12px] border border-amber-500/25 shadow-(--shadow-sm) space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-(--text-primary) flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>Priority Field Actions & Standing Crop Phaseout Directives</span>
          </h3>
          <span className="app-chip bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold">
            {priorityItems.length} Urgent Directives
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {priorityItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedVillage(item)}
              className="p-3 bg-amber-500/8 border border-amber-500/20 rounded-[10px] text-[12px] space-y-1.5 cursor-pointer hover:bg-amber-500/15 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-(--text-primary)">
                  {item.village} ({item.society})
                </span>
                <span className="app-chip bg-rose-500/15 text-rose-700 dark:text-rose-400 text-[10px] font-bold">
                  Action Required
                </span>
              </div>
              <p className="text-(--text-secondary) leading-snug">{item.priorityNote}</p>
              <div className="text-[11px] text-(--text-muted) pt-0.5 flex items-center justify-between">
                <span>
                  Target:{' '}
                  <strong className="text-emerald-700 dark:text-emerald-300">{item.varietyToPlant}</strong> on{' '}
                  <span className="font-mono font-bold text-(--text-primary)">{item.areaFreeToReplantHa} ha</span>
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 text-[11px] font-semibold">
                  Inspect <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters Bar with Society Chips */}
      <div className="bg-(--surface-card) p-4 rounded-[12px] border border-(--border) shadow-(--shadow-sm) space-y-3">
        {/* Quick Society Pill Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-(--border)">
          <span className="text-[11px] font-bold uppercase tracking-wider text-(--text-muted) mr-2">
            Society:
          </span>
          <button
            type="button"
            onClick={() => handleSocietyChange('ALL')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
              societyFilter === 'ALL'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-(--surface-sunken) text-(--text-secondary) hover:text-(--text-primary)'
            }`}
          >
            All Societies ({societies.length})
          </button>
          {societies.map((soc) => (
            <button
              key={soc}
              type="button"
              onClick={() => handleSocietyChange(soc)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer ${
                societyFilter === soc
                  ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                  : 'bg-(--surface-sunken) text-(--text-secondary) hover:text-(--text-primary)'
              }`}
            >
              {soc}
            </button>
          ))}
        </div>

        {/* Search and Dropdowns */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Search */}
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-(--text-muted) absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search village name..."
                value={villageSearch}
                onChange={(e) => {
                  setVillageSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 text-[12px] bg-(--surface-sunken) text-(--text-primary) border border-(--border) rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 font-medium"
              />
            </div>

            {/* Variety Filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-(--text-secondary) whitespace-nowrap">
                Variety:
              </label>
              <select
                value={varietyFilter}
                onChange={(e) => {
                  setVarietyFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-[12px] bg-(--surface-sunken) text-(--text-primary) border border-(--border) rounded-lg py-1 px-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer font-medium"
              >
                <option value="ALL">All Varieties ({varieties.length})</option>
                {varieties.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Land Filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-(--text-secondary) whitespace-nowrap">
                Land:
              </label>
              <select
                value={landFilter}
                onChange={(e) => {
                  setLandFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-[12px] bg-(--surface-sunken) text-(--text-primary) border border-(--border) rounded-lg py-1 px-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer font-medium"
              >
                <option value="ALL">All Land Types</option>
                <option value="UPLAND">UPLAND</option>
                <option value="LOWLAND">LOWLAND</option>
              </select>
            </div>
          </div>

          <div className="text-[12px] text-(--text-muted) font-medium">
            Showing <strong className="text-(--text-primary) font-mono">{filteredVillages.length}</strong> villages
          </div>
        </div>
      </div>

      {/* Villages Table Container with Pagination */}
      <div className="bg-(--surface-card) rounded-[12px] border border-(--border) shadow-(--shadow-sm) overflow-hidden">
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead>
              <tr>
                <th className="text-left">Society</th>
                <th className="text-left">Village</th>
                <th className="text-left">Land Type</th>
                <th className="text-right">Area Free to Re-Plant</th>
                <th className="text-left">Allocated Variety</th>
                <th className="text-right">Number of Fields</th>
                <th className="text-left">Notes & Directives</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedVillages.map((v) => (
                <tr
                  key={v.id}
                  className={`transition-colors cursor-pointer hover:bg-(--surface-sunken)/70 ${
                    v.isPriorityAction ? 'bg-amber-500/5' : ''
                  }`}
                  onClick={() => setSelectedVillage(v)}
                >
                  <td className="text-(--text-secondary) font-medium">{v.society}</td>
                  <td className="font-bold text-(--text-primary)">{v.village}</td>
                  <td>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                        v.landType === 'UPLAND'
                          ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                          : 'bg-blue-500/12 text-blue-700 dark:text-blue-400'
                      }`}
                    >
                      {v.landType}
                    </span>
                  </td>
                  <td className="text-right tabular-nums font-bold text-(--text-primary) font-mono">
                    {v.areaFreeToReplantHa.toLocaleString()}{' '}
                    <span className="text-[11px] font-normal text-(--text-muted)">ha</span>
                  </td>
                  <td>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{v.varietyToPlant}</span>
                  </td>
                  <td className="text-right tabular-nums text-(--text-secondary) font-mono">
                    {v.numberOfFields.toLocaleString()}
                  </td>
                  <td className="text-(--text-secondary) text-[12px]">
                    {v.isPriorityAction ? (
                      <span className="text-amber-700 dark:text-amber-400 font-semibold">
                        {v.priorityNote}
                      </span>
                    ) : (
                      <span className="text-(--text-muted)">Regular nursery distribution</span>
                    )}
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedVillage(v);
                      }}
                      className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors"
                      title="Inspect village record"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 border-t border-(--border) flex items-center justify-between bg-(--surface-sunken)">
          <div className="text-[12px] text-(--text-secondary)">
            Page <strong className="text-(--text-primary) font-mono">{currentPage}</strong> of{' '}
            <strong className="text-(--text-primary) font-mono">{totalPages}</strong> (
            {filteredVillages.length} total entries)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-(--border) bg-(--surface-card) text-(--text-primary) hover:bg-(--surface-sunken) disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-7 h-7 text-[12px] font-semibold rounded-lg border transition-all cursor-pointer ${
                    currentPage === pageNum
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-(--surface-card) border-(--border) text-(--text-secondary) hover:text-(--text-primary)'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-(--border) bg-(--surface-card) text-(--text-primary) hover:bg-(--surface-sunken) disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Village Inspection Drawer / Modal */}
      {selectedVillage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-(--surface-card) rounded-[16px] border border-(--border-strong) shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-(--border)">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-(--text-primary)">
                    {selectedVillage.village}
                  </h3>
                  <p className="text-[11px] text-(--text-muted)">
                    Society: {selectedVillage.society} • Village ID: {selectedVillage.id.toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVillage(null)}
                className="p-1.5 rounded-lg text-(--text-muted) hover:text-(--text-primary) hover:bg-(--surface-sunken) transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-[13px]">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-(--surface-sunken) rounded-lg border border-(--border)">
                  <div className="text-[11px] font-bold uppercase text-(--text-muted)">Land Type</div>
                  <div className="text-[14px] font-bold text-(--text-primary) mt-0.5">
                    {selectedVillage.landType}
                  </div>
                </div>

                <div className="p-3 bg-(--surface-sunken) rounded-lg border border-(--border)">
                  <div className="text-[11px] font-bold uppercase text-(--text-muted)">Re-Plantable Land</div>
                  <div className="text-[14px] font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                    {selectedVillage.areaFreeToReplantHa} ha
                  </div>
                </div>

                <div className="p-3 bg-(--surface-sunken) rounded-lg border border-(--border)">
                  <div className="text-[11px] font-bold uppercase text-(--text-muted)">Allocated Cultivar</div>
                  <div className="text-[14px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {selectedVillage.varietyToPlant}
                  </div>
                </div>

                <div className="p-3 bg-(--surface-sunken) rounded-lg border border-(--border)">
                  <div className="text-[11px] font-bold uppercase text-(--text-muted)">Survey Plots</div>
                  <div className="text-[14px] font-bold text-(--text-primary) font-mono mt-0.5">
                    {selectedVillage.numberOfFields} Fields
                  </div>
                </div>
              </div>

              {selectedVillage.isPriorityAction && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-lg space-y-1">
                  <div className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 text-[12px]">
                    <AlertOctagon className="w-3.5 h-3.5" /> Urgent Agronomic Directive
                  </div>
                  <p className="text-[12px] text-(--text-secondary)">
                    {selectedVillage.priorityNote}
                  </p>
                </div>
              )}

              <div className="p-3 bg-(--surface-sunken) rounded-lg border border-(--border) space-y-1 text-[12px]">
                <div className="font-bold text-(--text-primary)">Seed Cane Logistics Requirement</div>
                <div className="text-(--text-secondary)">
                  Estimated Seed Requirement: <strong className="text-(--text-primary) font-mono">{(selectedVillage.areaFreeToReplantHa * 65).toLocaleString()} qtl</strong> (at standard 65 qtl/ha rate).
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedVillage(null)}
                className="btn-secondary"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
