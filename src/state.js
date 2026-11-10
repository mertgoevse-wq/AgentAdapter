import { changesPath } from './paths.js';
import { readJson, writeJsonAtomic } from './util.js';

export function loadChanges() {
  const value = readJson(changesPath, []);
  return Array.isArray(value) ? value : [];
}

export function saveChanges(changes) {
  writeJsonAtomic(changesPath, changes, 0o600);
}

export function appendChange(change) {
  const changes = loadChanges();
  ensureId(change);
  changes.push(change);
  saveChanges(changes);
  return change;
}

export function removeChange(id) {
  const changes = loadChanges().filter((entry) => entry.id !== id);
  saveChanges(changes);
}

export function findChange(predicate) {
  return loadChanges().find(predicate) || null;
}

export function ensureId(change) {
  if (!change.id) {
    change.id = `${change.type || 'change'}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }
  if (!change.createdAt) change.createdAt = new Date().toISOString();
  return change;
}
