/**
 * Single import point for the rules engine (ARCHITECTURE §2: server → engine only).
 * Nothing else under apps/server imports the engine package directly.
 */
export * from '@fortune-district/engine';
