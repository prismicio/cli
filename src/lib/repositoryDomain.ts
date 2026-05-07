import { CommandError } from "./command";

const DOMAIN_REGEX = /^[a-zA-Z0-9][-a-zA-Z0-9]{2,}[a-zA-Z0-9]$/;
const MIN_LENGTH = 4;
const MAX_LENGTH = 63;

export function validateRepositoryDomain(name: string): void {
	if (name.length < MIN_LENGTH || name.length > MAX_LENGTH || !DOMAIN_REGEX.test(name)) {
		throw new CommandError(
			`Invalid repository name "${name}". Must be ${MIN_LENGTH}–${MAX_LENGTH} characters, letters/numbers/hyphens only, and start and end with a letter or number.`,
		);
	}
}
