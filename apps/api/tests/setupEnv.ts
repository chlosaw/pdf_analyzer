import { applyTestEnv } from './testEnv';

// Runs before each test file imports the app, so src/env.ts sees these values.
applyTestEnv();
