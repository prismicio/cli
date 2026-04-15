import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../../package.json" with { type: "json" };
import { UPDATE_NOTIFIER_STATE_PATH } from "../config";
import { stringify } from "../lib/json";
import { getNpmPackageVersion } from "../lib/packageJson";

try {
	const version = await getNpmPackageVersion(packageJson.name);
	const statePath = fileURLToPath(UPDATE_NOTIFIER_STATE_PATH);
	await mkdir(dirname(statePath), { recursive: true });
	await writeFile(
		statePath,
		stringify({ latestKnownVersion: version, lastUpdateCheckAt: Date.now() }),
	);
} catch {}
