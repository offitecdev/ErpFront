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
  | 'appointmentMail'
  | 'fieldReports'
  | 'generalReport'
  | 'delivery'
  | 'signatures'
  | 'expenses'
  | 'materials'
  | 'overtime'
  | 'addonOrders';

export type ProjectDetailView = {
  section: ProjectSectionKey;
  subSection?: ProjectSubSectionKey;
};

// The default sub-section opened when a user clicks a top-level group.
// `overview`, `positions` and `billing` have no sub-sections.
export const DEFAULT_SUB_SECTION: Partial<Record<ProjectSectionKey, ProjectSubSectionKey>> = {
  planning: 'appointments',
  field: 'fieldReports',
  costs: 'expenses',
  addons: 'addonOrders',
};

export const viewForSection = (section: ProjectSectionKey): ProjectDetailView => ({
  section,
  subSection: DEFAULT_SUB_SECTION[section],
});
