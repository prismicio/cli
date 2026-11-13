import { env } from "./env";
import { getConfigDir } from "./lib/config-dir";

export const CONFIG_DIR = getConfigDir("prismic", env.PRISMIC_CONFIG_DIR);

export const CREDENTIALS_PATH = new URL("credentials.json", CONFIG_DIR);
export const ENCRYPTED_CREDENTIALS_PATH = new URL("credentials.enc", CONFIG_DIR);
export const CREDENTIALS_LOCK_PATH = new URL("credentials.lock", CONFIG_DIR);
export const LOGIN_LOCK_PATH = new URL("login.lock", CONFIG_DIR);
export const UPDATE_NOTIFIER_STATE_PATH = new URL("update-notifier.json", CONFIG_DIR);
export const ANALYTICS_IDS_PATH = new URL("analytics.json", CONFIG_DIR);
