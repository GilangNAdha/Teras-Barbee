// Vitest runs in plain Node, where the real `server-only` package throws on
// import. Next.js enforces the boundary at bundle time; tests only need a no-op.
export {};
