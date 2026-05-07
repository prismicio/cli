import { CommandError } from "./command";

const DOMAIN_REGEX = /^[a-zA-Z0-9][-a-zA-Z0-9]{2,}[a-zA-Z0-9]$/;
const MIN_LENGTH = 4;
const MAX_LENGTH = 63;

export function formatRepositoryDomain(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function validateRepositoryDomain(domain: string): void {
	if (domain.length < MIN_LENGTH || domain.length > MAX_LENGTH || !DOMAIN_REGEX.test(domain)) {
		throw new CommandError(
			`Invalid repository name "${domain}". Must be ${MIN_LENGTH}–${MAX_LENGTH} characters, contain only letters, numbers, and hyphens, and start and end with a letter or number.`,
		);
	}
}
