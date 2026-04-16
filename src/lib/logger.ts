import { styleText } from "node:util";

import { formatTable } from "./string";
import { relativePathname } from "./url";

type Log =
	| { type: "file-created"; url: URL }
	| { type: "file-updated"; url: URL }
	| { type: "file-deleted"; url: URL };

type Verb = "Created" | "Updated" | "Deleted";

const logs: Log[] = [];

export function log(payload: Log): void {
	logs.push(payload);
}

export function flushLogs(): Log[] {
	return logs.splice(0);
}

const VERB_ORDER: Verb[] = ["Created", "Updated", "Deleted"];

const VERB_COLOR = { Created: "green", Updated: "blue", Deleted: "red" } as const;

function getVerb(log: Log): Verb {
	switch (log.type) {
		case "file-created":
			return "Created";
		case "file-updated":
			return "Updated";
		case "file-deleted":
			return "Deleted";
	}
}

export function formatChanges(logs: Log[], config: { title: string; root?: URL }): string {
	const { title, root } = config;

	const boldTitle = title;

	if (logs.length === 0) return boldTitle;

	const sorted = [...logs].sort(
		(a, b) => VERB_ORDER.indexOf(getVerb(a)) - VERB_ORDER.indexOf(getVerb(b)),
	);

	const counts: Record<Verb, number> = { Created: 0, Updated: 0, Deleted: 0 };
	for (const entry of logs) {
		counts[getVerb(entry)]++;
	}

	const parts: string[] = [];
	for (const verb of VERB_ORDER) {
		const count = counts[verb];
		if (count > 0) {
			parts.push(`${count} ${count === 1 ? "file" : "files"} ${verb.toLowerCase()}`);
		}
	}

	const header = [boldTitle, "", styleText("dim", parts.join(", "))];

	const rows = sorted.map((entry): [string, string] => {
		const verb = getVerb(entry);
		const coloredVerb = styleText(VERB_COLOR[verb], verb);
		return [coloredVerb, root ? relativePathname(root, entry.url) : entry.url.href];
	});

	const table = formatTable(rows, { separator: "  " });
	const indented = table
		.split("\n")
		.map((line) => `  ${line}`)
		.join("\n");

	return [...header, indented].join("\n");
}
