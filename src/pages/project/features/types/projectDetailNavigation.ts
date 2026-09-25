export type ProjectSectionKey =
  | 'overview'
  | 'positions'
  // «Siparişlerim» (24.09.2026): Pozisyon Özeti'nin YANINDAKİ ayrı sekme —
  // pozisyonların tedarik durumu ve «Siparişe Git».
  | 'procurement'
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

const SECTION_KEYS: ReadonlySet<string> = new Set<ProjectSectionKey>(['overview', 'positions', 'procurement', 'planning', 'field', 'costs', 'billing', 'addons']);
const SUB_SECTION_KEYS: ReadonlySet<string> = new Set<ProjectSubSectionKey>(['appointments', 'fieldReports', 'generalReport', 'delivery', 'signatures']);

/** Zwei Ansichten sind gleich, wenn Bereich und (wirksamer) Unterbereich gleich sind. */
export const sameView = (a: ProjectDetailView, b: ProjectDetailView): boolean =>
  a.section === b.section
  && (a.subSection ?? DEFAULT_SUB_SECTION[a.section]) === (b.subSection ?? DEFAULT_SUB_SECTION[b.section]);

/**
 * JEDER REITER HAT SEINE ADRESSE (Vorgabe Samet, 24.09.2026: «proje
 * taplarının her birinin id'si olmalı, geriye bastıkça aralarında geri
 * gitmeli»). Die Abfrage für eine Ansicht: `section` steht IMMER da (auch
 * `overview`), `sub` nur, wenn er vom Standard des Bereichs abweicht. Andere
 * Parameter der Adresse bleiben erhalten.
 */
export const searchForView = (view: ProjectDetailView, currentSearch: string): string => {
  const params = new URLSearchParams(currentSearch);
  params.set('section', view.section);
  const sub = view.subSection && view.subSection !== DEFAULT_SUB_SECTION[view.section] ? view.subSection : null;
  if (sub) params.set('sub', sub);
  else params.delete('sub');
  const query = params.toString();
  return query ? `?${query}` : '';
};

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
