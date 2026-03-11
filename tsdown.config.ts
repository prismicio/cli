import { defineConfig } from "tsdown";

const MODE = process.env.MODE || "production";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	platform: "node",
	minify: true,
	envPrefix: "PRISMIC_",
	define: {
		"process.env.MODE": JSON.stringify(MODE),
		"process.env.DEV": JSON.stringify(MODE !== "production"),
		"process.env.PROD": JSON.stringify(MODE === "production"),
	},
});
