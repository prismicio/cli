import { updateVersionState } from "../lib/update-notifier";

const [npmPackageName, statePathHref] = process.argv.slice(2);

try {
	await updateVersionState(npmPackageName, new URL(statePathHref));
} catch {}
