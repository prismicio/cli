import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

import { it } from "./it";

const REGISTER = fileURLToPath(new URL("../dist/env/register.mjs", import.meta.url));

const ENV_VARS = [
	"NEXT_PUBLIC_PRISMIC_ENVIRONMENT",
	"PUBLIC_PRISMIC_ENVIRONMENT",
	"NUXT_PUBLIC_PRISMIC_ENVIRONMENT",
] as const;

it("does not set env vars when no environment is configured", async ({ expect, home, project }) => {
	process.chdir(fileURLToPath(project));
	vi.stubEnv("PRISMIC_CONFIG_DIR", fileURLToPath(new URL(".config/prismic/", home)));
	vi.resetModules();
	await import(REGISTER);
	for (const key of ENV_VARS) expect(process.env[key]).toBeUndefined();
});

it("sets env vars when an environment is configured", async ({ expect, home, project }) => {
	process.chdir(fileURLToPath(project));
	vi.stubEnv("PRISMIC_CONFIG_DIR", fileURLToPath(new URL(".config/prismic/", home)));
	await mkdir(new URL(".config/prismic/", home), { recursive: true });
	await writeFile(
		new URL(".config/prismic/environments.json", home),
		JSON.stringify({ [project.toString()]: "my-stage-env" }),
	);
	vi.resetModules();
	await import(REGISTER);
	for (const key of ENV_VARS) expect(process.env[key]).toBe("my-stage-env");
});
