/**
 * Single import point for the engine.
 *
 * Until `npm install` has linked the workspaces, `@fortune-district/engine`
 * does not resolve, so this shim imports the engine source by relative path.
 * Once the workspace link exists, change this one line to
 * `export * from '@fortune-district/engine';` — nothing else in the simulator
 * needs to change (ADR-0003: share by import, never by copy).
 */
export * from '../../engine/src/index.ts';
