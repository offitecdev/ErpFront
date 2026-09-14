/**
 * Gemeinsamer Loader fuer Route und Intent-Prefetch. So laedt ein Hover/Fokus
 * auf einer Aufgabenzeile denselben Vite-Chunk, den React Router danach nutzt.
 */
export const loadTaskDetailPage = () => import('./TaskDetailPage');
