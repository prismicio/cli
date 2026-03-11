import detectIndent from "detect-indent";
import { readFile, writeFile } from "node:fs/promises";

import { findUpward } from "./file";

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
