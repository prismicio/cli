import { defineConfig } from "tsdown";

const MODE = process.env.MODE || "development";
const PROD = MODE === "production";

export default defineConfig({
	entry: {
		index: "./src/index.ts",
		"subprocesses/refreshToken": "./src/subprocesses/refreshToken.ts",
		"subprocesses/sendSegmentEvents": "./src/subprocesses/sendSegmentEvents.ts",
		"subprocesses/updateVersionState": "./src/subprocesses/updateVersionState.ts",
	},
	format: "esm",
	platform: "node",
	unbundle: !PROD,
	minify: PROD,
	envPrefix: "PRISMIC_",
	define: {
		"process.env.PROD": JSON.stringify(String(PROD)),
	},
});
