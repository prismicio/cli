import { defineConfig } from "tsdown";

const PROD = process.env.MODE === "production";

export default defineConfig({
	entry: {
		index: "./src/index.ts",
		"subprocesses/refreshToken": "./src/subprocesses/refreshToken.ts",
		"subprocesses/sendSegmentEvents": "./src/subprocesses/sendSegmentEvents.ts",
		"subprocesses/updateVersionState": "./src/subprocesses/updateVersionState.ts",
	},
	format: "esm",
	platform: "node",
	minify: true,
	envPrefix: "PRISMIC_",
	define: {
		"process.env.PROD": JSON.stringify(String(PROD)),
	},
});
