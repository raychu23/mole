// T66 review-1 (HIGH): isModuleExportTitle (packages/decisions/src/check/options.ts) needed one of
// default|named|module|barrel|index|re-export in the SAME title as "export(s)" to be crisp. That missed genuine
// module-export titles that use "convention(s)" with none of those other words ("Export conventions", "Export
// Convention") and missed "Barrel files re-exporting" because the old `\bre-?export\b` word-boundary test cannot
// match "re-exporting" (the trailing "ing" breaks the closing \b). Table-driven per review-1's required list plus
// >=10 more of each kind, grounded in prior-art.md #4 (ESLint import/no-default-export, prefer-default-export,
// no-named-export, no-anonymous-default-export, group-exports; Backstage ADR003/ADR004; public "Barrel Export
// Boundaries"/"Barrel Export Pattern" ADRs).
import { describe, expect, it } from 'vitest';
import { isModuleExportTitle } from '../src/check/options.js';

const CRISP_MODULE_EXPORT_TITLES = [
  // review-1's required regression cases
  'Export conventions',
  'Export Convention',
  'Barrel files re-exporting',
  // real ADR titles this repo's bench already carries (bs-adr003/bs-adr004) -- must stay unaffected
  'Avoid Default Exports and Prefer Named Exports',
  'Module Export Structure',
  // eslint-plugin-import rule names/descriptions (prior-art.md #4), phrased as decision titles
  'Prefer named exports over default exports',
  'Disallow default exports',
  'No anonymous default export',
  'Group named exports together',
  // public "barrel" ADR titles found in prior-art.md #4
  'Barrel export boundaries',
  'Barrel export pattern',
  // ADR004's own body vocabulary (index files, re-exports, entry point) as title phrasing
  'Index files re-export only their own directory',
  'Public API surface exported via barrel index',
  'Single entry point module exports',
  'Re-exporting named exports through index.ts',
  'Export convention: named exports only',
];

const NON_CRISP_DATA_EXPORT_TITLES = [
  // review-1's required regression cases
  'Audit every data export',
  'CSV export',
  'Export job scheduling',
  'Exporting reports',
  'Data exporter config',
  'Export endpoint rate limits',
  // additional data/business-export titles, same vocabulary family
  'Nightly data export job',
  'User export to CSV',
  'PDF export rate limiting',
  'Export report generation pipeline',
  'Excel export formatting',
  'Bulk user data export',
  'Scheduled export job for analytics pipeline',
  'Download export endpoint timeout',
  'Export audit log retention',
  'Customer data export compliance',
  'Export pipeline for reports',
  // mixed-register titles: module vocabulary IS present, but data vocabulary dominates -- the dataVocab safety net
  'Default export of CSV report data',
  'Barrel file for user export job',
];

describe('T66 review-1: isModuleExportTitle table', () => {
  it.each(CRISP_MODULE_EXPORT_TITLES)('crisp (module-export vocabulary): %s', (title) => {
    expect(isModuleExportTitle(title)).toBe(true);
  });

  it.each(NON_CRISP_DATA_EXPORT_TITLES)('NOT crisp (data/business export vocabulary): %s', (title) => {
    expect(isModuleExportTitle(title)).toBe(false);
  });
});
