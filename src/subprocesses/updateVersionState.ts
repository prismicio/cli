import packageJson from "../../package.json" with { type: "json" };
import { UPDATE_NOTIFIER_STATE_PATH } from "../config";
import { updateVersionState } from "../lib/update-notifier";

try {
	await updateVersionState(packageJson.name, UPDATE_NOTIFIER_STATE_PATH);
} catch {}
