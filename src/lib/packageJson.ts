import detectIndent from "detect-indent";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { x } from "tinyexec";
import { z } from "zod/mini";

import { exists, findUpward, readJsonFile } from "./file";
import { request } from "./request";

const PackageJsonSchema = z.object({
	dependencies: z.optional(z.record(z.string(), z.string())),
	devDependencies: z.optional(z.record(z.string(), z.string())),
	peerDependencies: z.optional(z.record(z.string(), z.string())),
	packageManager: z.optional(z.string()),
});
type PackageJson = z.infer<typeof PackageJsonSchema>;

export async function readPackageJson(config: { start?: URL } = {}): Promise<PackageJson> {
	const packageJsonPath = await findPackageJson(config);
	const packageJson = await readJsonFile(packageJsonPath, { schema: PackageJsonSchema });
	return packageJson;
}

export async function findPackageJson(config: { start?: URL } = {}): Promise<URL> {
	const packageJsonPath = await findUpward("package.json", config);
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

export async function removeDependencies(names: string[]): Promise<void> {
	const packageJsonPath = await findPackageJson();
	const raw = await readFile(packageJsonPath, "utf8");
	const indent = detectIndent(raw).indent || "\t";
	const packageJson = JSON.parse(raw);
	for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
		if (!packageJson[section]) continue;
		for (const name of names) delete packageJson[section][name];
	}
	const newContents = JSON.stringify(packageJson, null, indent) + "\n";
	await writeFile(packageJsonPath, newContents);
}

export async function getNpmPackageVersion(name: string, tag = "latest"): Promise<string> {
	const url = new URL(`${name}/${tag}`, "https://registry.npmjs.org/");
	const { version } = await request(url, {
		schema: z.object({ version: z.string() }),
	});
	return version;
}

const INSTALL_COMMANDS = {
	npm: ["npm", "install"],
	yarn: ["yarn", "install"],
	pnpm: ["pnpm", "install"],
	bun: ["bun", "install"],
};

export async function installDependencies(config: { start?: URL } = {}): Promise<void> {
	const packageJsonPath = await findPackageJson(config);
	const cwd = new URL(".", packageJsonPath);
	const packageManager = await detectPackageManager(packageJsonPath);
	const [command, ...args] = INSTALL_COMMANDS[packageManager];
	await x(command, args, {
		nodeOptions: { cwd: fileURLToPath(cwd), stdio: "inherit" },
		throwOnError: true,
	});
}

const PACKAGE_MANAGER_LOCKFILES: Record<string, keyof typeof INSTALL_COMMANDS> = {
	"bun.lock": "bun",
	"bun.lockb": "bun",
	"pnpm-lock.yaml": "pnpm",
	"yarn.lock": "yarn",
	"package-lock.json": "npm",
};

async function detectPackageManager(packageJsonPath: URL): Promise<keyof typeof INSTALL_COMMANDS> {
	const packageManager = await readPackageManager(packageJsonPath);
	if (packageManager) return packageManager;

	for (const file in PACKAGE_MANAGER_LOCKFILES) {
		const packageManager = PACKAGE_MANAGER_LOCKFILES[file];
		const hasLockfile = await exists(new URL(file, packageJsonPath));
		if (hasLockfile) return packageManager;
	}

	return "npm";
}

async function readPackageManager(
	packageJsonPath: URL,
): Promise<keyof typeof INSTALL_COMMANDS | undefined> {
	try {
		const packageJson = await readJsonFile(packageJsonPath, {
			schema: PackageJsonSchema,
		});
		if (!packageJson.packageManager) return;
		const packageManager = packageJson.packageManager.split("@")[0];
		if (packageManager in INSTALL_COMMANDS) return packageManager as keyof typeof INSTALL_COMMANDS;
		return undefined;
	} catch {
		return undefined;
	}
}
