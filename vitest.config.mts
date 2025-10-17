import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		globals: true,
		timeout: 10000,
		hookTimeout: 10000,
		teardownTimeout: 10000,
	},
});
