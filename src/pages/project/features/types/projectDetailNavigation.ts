export type ProjectSectionKey =
  | 'overview'
  | 'positions'
  | 'planning'
  | 'field'
  | 'costs'
  | 'billing'
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
