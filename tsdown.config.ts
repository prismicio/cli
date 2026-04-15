import { defineConfig } from "tsdown";

const MODE = process.env.MODE || "development";
const TEST = MODE === "test";

export default defineConfig({
	entry: {
		index: "./src/index.ts",
		"subprocesses/refresh-token": "./src/subprocesses/refresh-token.ts",
		"subprocesses/flush-telemetry": "./src/subprocesses/flush-telemetry.ts",
		"subprocesses/update-check": "./src/subprocesses/update-check.ts",
	},
	format: "esm",
	platform: "node",
	unbundle: TEST,
	minify: !TEST,
	envPrefix: "PRISMIC_",
	define: {
		"process.env.MODE": JSON.stringify(MODE),
		"process.env.DEV": JSON.stringify(String(MODE !== "production")),
		"process.env.PROD": JSON.stringify(String(MODE === "production")),
		"process.env.TEST": JSON.stringify(String(TEST)),
	},
});
