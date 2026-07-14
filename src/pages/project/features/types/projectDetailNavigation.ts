export type ProjectSectionKey =
  | 'overview'
  | 'positions'
  | 'planning'
  | 'field'
  | 'costs'
  | 'addons';

export type ProjectSubSectionKey =
  | 'appointments'
  | 'appointmentMail'
  | 'fieldReports'
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
// `overview` has no sub-sections, so it is intentionally absent.
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
