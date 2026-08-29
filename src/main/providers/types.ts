// Re-export: the provider contract lives in src/shared (cross-process).
// The explicit .ts extension keeps this importable under plain Node
// (scripts/test-providers.ts) as well as vite.
export * from '../../shared/providers.ts'
