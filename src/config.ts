import { env } from "./env";
import { getConfigDir } from "./lib/config-dir";

const CONFIG_DIR = getConfigDir("prismic", env.PRISMIC_CONFIG_DIR);

export const CREDENTIALS_PATH = new URL("credentials.json", CONFIG_DIR);
export const UPDATE_NOTIFIER_STATE_PATH = new URL("update-notifier.json", CONFIG_DIR);
