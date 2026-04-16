import { relativePathname } from "./url";

export type Action =
	| { type: "file-created"; url: URL }
	| { type: "file-updated"; url: URL }
	| { type: "file-deleted"; url: URL }
	| { type: "remote-created"; id: string; message: string }
	| { type: "remote-updated"; id: string; message: string }
	| { type: "remote-deleted"; id: string; message: string };

const actions: Action[] = [];

export function reportAction(action: Action): void {
	actions.push(action);
}

export function flushActions(): Action[] {
	return actions.splice(0);
}

export function formatAction(action: Action, projectRoot: URL): string {
	switch (action.type) {
		case "file-created":
			return `Created ${relativePathname(projectRoot, action.url)}`;
		case "file-updated":
			return `Updated ${relativePathname(projectRoot, action.url)}`;
		case "file-deleted":
			return `Deleted ${relativePathname(projectRoot, action.url)}`;
		case "remote-created":
			return `Created remote ${action.message}`;
		case "remote-updated":
			return `Updated remote ${action.message}`;
		case "remote-deleted":
			return `Deleted remote ${action.message}`;
	}
}
