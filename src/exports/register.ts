import { getActiveEnvironment, getFrameworkEnvVar } from "../active-environment";

// Side-effect import for a framework config (e.g. `import "prismic/env/register"`).
// Sets the framework's environment variable to the active environment, leaving an
// existing value (e.g. from CI) untouched.

const variable = getFrameworkEnvVar();
const active = getActiveEnvironment();
if (variable && active && process.env[variable] == null) {
	process.env[variable] = active;
}
