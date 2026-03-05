import baseDedent from "dedent";

export function humanReadable(id: string): string {
	return id
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

export const dedent = baseDedent.withOptions({ alignValues: true });
