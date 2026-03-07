import { existsSync } from "node:fs";
import { defineConfig } from "tsdown";

const MODE = process.env.MODE || "production";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	platform: "node",
	minify: true,
	envFile: existsSync(".env.local") ? ".env.local" : undefined,
	envPrefix: "PRISMIC_",
	define: {
		"import.meta.env.MODE": JSON.stringify(MODE),
		"import.meta.env.DEV": JSON.stringify(MODE !== "production"),
		"import.meta.env.PROD": JSON.stringify(MODE === "production"),
		"import.meta.env.PRISMIC_SENTRY_DSN": "undefined",
		"import.meta.env.PRISMIC_SENTRY_ENVIRONMENT": "undefined",
		"import.meta.env.PRISMIC_SENTRY_ENABLED": "undefined",
	},
});
