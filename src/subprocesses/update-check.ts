import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../../package.json" with { type: "json" };
import { UPDATE_NOTIFIER_STATE_PATH } from "../config";
import { stringify } from "../lib/json";

const FETCH_TIMEOUT_MS = 2000;

try {
	const url = `https://registry.npmjs.org/${packageJson.name}/latest`;
	const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	if (!res.ok) process.exit(0);
	const { version } = (await res.json()) as { version: unknown };
	if (typeof version !== "string") process.exit(0);

	const statePath = fileURLToPath(UPDATE_NOTIFIER_STATE_PATH);
	await mkdir(dirname(statePath), { recursive: true });
	await writeFile(
		statePath,
		stringify({ latestKnownVersion: version, lastUpdateCheckAt: Date.now() }),
	);
} catch {}
