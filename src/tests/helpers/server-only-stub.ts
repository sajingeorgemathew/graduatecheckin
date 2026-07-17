/**
 * Vitest replacement for the "server-only" marker package. The real
 * package prevents server modules from entering client bundles. Tests run
 * in Node, so the marker is replaced with this empty module.
 */

export {};
