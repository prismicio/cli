import detectIndent from "detect-indent";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { x } from "tinyexec";
import { z } from "zod/mini";

import { exists, findUpward, readJsonFile } from "./file";

const PackageJsonSchema = z.object({
	dependencies: z.optional(z.record(z.string(), z.string())),
	devDependencies: z.optional(z.record(z.string(), z.string())),
	peerDependencies: z.optional(z.record(z.string(), z.string())),
});
type PackageJson = z.infer<typeof PackageJsonSchema>;

export async function readPackageJson(): Promise<PackageJson> {
	const packageJsonPath = await findPackageJson();
	const packageJson = await readJsonFile(packageJsonPath, { schema: PackageJsonSchema });
	return packageJson;
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

export async function addDependencies(dependencies: Record<string, string>): Promise<void> {
	const packageJsonPath = await findPackageJson();
	const raw = await readFile(packageJsonPath, "utf8");
	const indent = detectIndent(raw).indent || "\t";
	const packageJson = JSON.parse(raw);
	packageJson.dependencies = Object.fromEntries(
		Object.entries({
			...packageJson.dependencies,
			...dependencies,
		}).sort(([a], [b]) => a.localeCompare(b)),
	);
	const newContents = JSON.stringify(packageJson, null, indent) + "\n";
	await writeFile(packageJsonPath, newContents);
}

export async function getNpmPackageVersion(name: string, tag = "latest"): Promise<string> {
	const url = new URL(`${name}/${tag}`, "https://registry.npmjs.org/");
	const res = await fetch(url);
	const { version } = await res.json();
	return version;
}

export async function installDependencies(): Promise<void> {
	const packageJsonPath = await findPackageJson();
	const dir = new URL(".", packageJsonPath);
	const [cmd, ...args] = await detectInstallCommand(dir);
	await x(cmd, args, {
		nodeOptions: { cwd: fileURLToPath(dir), stdio: "inherit" },
		throwOnError: true,
	});
}

const PM_INSTALL_ARGS: [lockfile: string, args: string[]][] = [
	["bun.lock", ["bun", "install"]],
	["bun.lockb", ["bun", "install"]],
	["pnpm-lock.yaml", ["pnpm", "install"]],
	["yarn.lock", ["yarn", "install"]],
	["package-lock.json", ["npm", "install"]],
];

async function detectInstallCommand(dir: URL): Promise<string[]> {
	for (const [file, command] of PM_INSTALL_ARGS) {
		if (await exists(new URL(file, dir))) return command;
	}
	return ["npm", "install"];
}
