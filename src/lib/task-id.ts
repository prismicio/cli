import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const TASK_ID = new RegExp(`^pt_[${ALPHABET}]{16}$`);

export function genTaskId(): string {
	let id = "pt_";
	for (const byte of randomBytes(16)) id += ALPHABET[byte & 0b11111];

	return id;
}

export function isTaskId(value: string): boolean {
	return TASK_ID.test(value);
}
