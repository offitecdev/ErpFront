export type ProjectSectionKey =
  | 'overview'
  | 'positions'
  | 'planning'
  | 'field'
  | 'costs'
  | 'billing'
  // Checklisten hatten hier einen eigenen Bereich (15.08.2026) — entfernt am
  // 16.08.2026: Checklisten gehören dem Monteur; im Projekt tauchen sie nicht
  // mehr auf, sondern nur noch im Rapport-Fenster auf dem Technikerbildschirm.
  | 'addons';

export type ProjectSubSectionKey =
  | 'appointments'
  | 'fieldReports'
  | 'generalReport'
  | 'delivery'
  | 'signatures';

export type ProjectDetailView = {
  section: ProjectSectionKey;
  subSection?: ProjectSubSectionKey;
};

// The default sub-section opened when a user clicks a top-level group. Every
// group is a single tab now; these only pick the view a section starts on.
export const DEFAULT_SUB_SECTION: Partial<Record<ProjectSectionKey, ProjectSubSectionKey>> = {
  planning: 'appointments',
  field: 'fieldReports',
};

export const viewForSection = (section: ProjectSectionKey): ProjectDetailView => ({
  section,
  subSection: DEFAULT_SUB_SECTION[section],
});

const SECTION_KEYS: ReadonlySet<string> = new Set<ProjectSectionKey>(['overview', 'positions', 'planning', 'field', 'costs', 'billing', 'addons']);
const SUB_SECTION_KEYS: ReadonlySet<string> = new Set<ProjectSubSectionKey>(['appointments', 'fieldReports', 'generalReport', 'delivery', 'signatures']);

/**
 * Deep-Link: `/projects/:id?section=field&sub=fieldReports` — Benachrichtigungen
 * ("Montage-Rapport eingegangen", "Unterschrift eingegangen") springen so direkt
 * in den passenden Bereich. Unbekannte Werte fallen auf die Übersicht zurück.
 */
export const viewFromSearch = (search: string): ProjectDetailView => {
  const params = new URLSearchParams(search);
  const section = params.get('section') ?? '';
  if (!SECTION_KEYS.has(section)) return { section: 'overview' };
  const sub = params.get('sub') ?? '';
  return {
    section: section as ProjectSectionKey,
    subSection: SUB_SECTION_KEYS.has(sub) ? (sub as ProjectSubSectionKey) : DEFAULT_SUB_SECTION[section as ProjectSectionKey],
  };
};
