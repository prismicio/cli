import { defineConfig } from "tsdown";

const MODE = process.env.MODE || "development";
const PROD = MODE === "production";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	platform: "node",
	bundle: PROD,
	minify: PROD,
	envPrefix: "PRISMIC_",
	define: {
		"process.env.MODE": JSON.stringify(MODE),
		"process.env.DEV": JSON.stringify(String(MODE !== "production")),
		"process.env.PROD": JSON.stringify(String(MODE === "production")),
		"process.env.TEST": JSON.stringify(String(MODE === "test")),
	},
});
