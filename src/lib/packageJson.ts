import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import detectIndent from "detect-indent";
import { x } from "tinyexec";
import { z } from "zod/mini";

import { exists, findUpward, readJsonFile } from "./file";
import { request } from "./request";

const PackageJsonSchema = z.object({
	name: z.optional(z.string()),
	dependencies: z.optional(z.record(z.string(), z.string())),
	devDependencies: z.optional(z.record(z.string(), z.string())),
	peerDependencies: z.optional(z.record(z.string(), z.string())),
	packageManager: z.optional(z.string()),
});
type PackageJson = z.infer<typeof PackageJsonSchema>;

export async function readPackageJson(): Promise<PackageJson> {
	return readJsonFile(await findPackageJson(), { schema: PackageJsonSchema });
}

export async function findPackageJson(): Promise<URL> {
	const packageJsonPath = await findUpward("package.json");
	if (!packageJsonPath) throw new MissingPackageJson();
	return packageJsonPath;
}

export class MissingPackageJson extends Error {
	name = "MissingPackageJson";
	message = "Could not find a package.json file.";
}

// Rewrites package.json in place, keeping its indentation.
async function editPackageJson(edit: (packageJson: PackageJson) => void): Promise<void> {
	const packageJsonPath = await findPackageJson();
	const raw = await readFile(packageJsonPath, "utf8");
	const packageJson = JSON.parse(raw);
	edit(packageJson);
	const indent = detectIndent(raw).indent || "\t";
	await writeFile(packageJsonPath, JSON.stringify(packageJson, null, indent) + "\n");
}

export async function addDependencies(dependencies: Record<string, string>): Promise<void> {
	await editPackageJson((packageJson) => {
		packageJson.dependencies = Object.fromEntries(
			Object.entries({ ...packageJson.dependencies, ...dependencies }).sort(([a], [b]) =>
				a.localeCompare(b),
			),
		);
	});
}

export async function removeDependencies(names: string[]): Promise<void> {
	await editPackageJson((packageJson) => {
		for (const section of ["dependencies", "devDependencies", "peerDependencies"] as const) {
			const deps = packageJson[section];
			if (!deps) continue;
			for (const name of names) delete deps[name];
		}
	});
}

export async function updatePackageJsonName(name: string): Promise<void> {
	await editPackageJson((packageJson) => {
		packageJson.name = name;
	});
}

export async function getNpmPackageVersion(name: string): Promise<string> {
	const url = new URL(`${name}/latest`, "https://registry.npmjs.org/");
	const { version } = await request(url, { schema: z.object({ version: z.string() }) });
	return version;
}

const PACKAGE_MANAGERS = ["npm", "yarn", "pnpm", "bun"];

const LOCKFILES: Record<string, string> = {
	"bun.lock": "bun",
	"bun.lockb": "bun",
	"pnpm-lock.yaml": "pnpm",
	"yarn.lock": "yarn",
	"package-lock.json": "npm",
};

export async function installDependencies(): Promise<void> {
	const packageJsonPath = await findPackageJson();
	await x(await detectPackageManager(packageJsonPath), ["install"], {
		nodeOptions: { cwd: fileURLToPath(new URL(".", packageJsonPath)), stdio: "inherit" },
		throwOnError: true,
	});
}

async function detectPackageManager(packageJsonPath: URL): Promise<string> {
	const { packageManager } = await readPackageJson().catch(() => ({ packageManager: undefined }));
	const name = packageManager?.split("@")[0];
	if (name && PACKAGE_MANAGERS.includes(name)) return name;

	for (const file in LOCKFILES) {
		if (await exists(new URL(file, packageJsonPath))) return LOCKFILES[file];
	}
	return "npm";
}
