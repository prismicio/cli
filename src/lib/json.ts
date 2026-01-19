export function stringify(input: unknown): string {
	return JSON.stringify(input, null, 2);
}
