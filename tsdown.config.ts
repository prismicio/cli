import { defineConfig } from "tsdown";

const MODE = process.env.MODE || "development";
const TEST = MODE === "test";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	platform: "node",
	bundle: !TEST,
	minify: !TEST,
	envPrefix: "PRISMIC_",
	define: {
		"process.env.MODE": JSON.stringify(MODE),
		"process.env.DEV": JSON.stringify(String(MODE !== "production")),
		"process.env.PROD": JSON.stringify(String(MODE === "production")),
		"process.env.TEST": JSON.stringify(String(TEST)),
	},
});
