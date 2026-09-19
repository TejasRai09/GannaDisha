// Color System & Palette utilities complying strictly with the Design System

export const CHART_PALETTE_LIGHT = [
  '#2a78d6', // 1
  '#eb6834', // 2
  '#1baf7a', // 3
  '#eda100', // 4
  '#e87ba4', // 5
  '#008300', // 6
  '#4a3aa7', // 7
  '#e34948', // 8
] as const;

export const CHART_PALETTE = CHART_PALETTE_LIGHT;

export const CHART_PALETTE_DARK = [
  '#3987e5', // 1
  '#d95926', // 2
  '#199e70', // 3
  '#c98500', // 4
  '#d55181', // 5
  '#008300', // 6
  '#9085e9', // 7
  '#e66767', // 8
] as const;

// Single-hue magnitude ramp (for heatmaps, density, intensity)
export const BLUE_RAMP = [
  '#cde2fb',
  '#9ec5f4',
  '#6da7ec',
  '#3987e5',
  '#256abf',
  '#184f95',
] as const;

export const COLOR_OTHER_LIGHT = '#94A3B8';
export const COLOR_OTHER_DARK = '#64748B';

// Fixed mapping order for initial varieties so colors are 100% deterministic and persistent
export const VARIETY_COLOR_INDEX_MAP: Record<string, number> = {
  'co-0118': 0,    // #2a78d6
  'colk-94184': 1, // #eb6834
  'co-98014': 2,   // #1baf7a
  'co-0238': 3,    // #eda100
  'co-15023': 4,   // #e87ba4
  'co-05011': 5,   // #008300
  'colk-14201': 6, // #4a3aa7
  // Any others take color 7 or other grey band
};

/**
 * Returns consistent color for a given variety ID and theme mode
 */
export function getVarietyColor(varietyId: string, isDark = false): string {
  const palette = isDark ? CHART_PALETTE_DARK : CHART_PALETTE_LIGHT;
  const index = VARIETY_COLOR_INDEX_MAP[varietyId];
  if (index !== undefined && index < palette.length) {
    return palette[index];
  }
  // If not in standard top 7, return 'Other' color or 8th color
  return isDark ? COLOR_OTHER_DARK : COLOR_OTHER_LIGHT;
}

/**
 * Returns chart color array for active theme
 */
export function getChartPalette(isDark = false): readonly string[] {
  return isDark ? CHART_PALETTE_DARK : CHART_PALETTE_LIGHT;
}

/**
 * Status colors and styles pairing an icon with text
 */
export const STATUS_COLORS = {
  good: '#0CA30C',
  warning: '#FAB219',
  serious: '#EC835A',
  critical: '#D03B3B',
} as const;
