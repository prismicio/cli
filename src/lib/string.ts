import baseDedent from "dedent";

export const dedent = baseDedent.withOptions({ alignValues: true });

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function visualLength(s: string): number {
	return s.replace(ANSI_RE, "").length;
}

export function formatTable(
	rows: string[][],
	config?: { headers?: string[]; separator?: string },
): string {
	const separator = config?.separator ?? "   ";
	const allRows = config?.headers ? [config.headers, ...rows] : rows;
	const columnWidths: number[] = [];
	for (const row of allRows) {
		for (let i = 0; i < row.length; i++) {
			columnWidths[i] = Math.max(columnWidths[i] ?? 0, visualLength(row[i]));
		}
	}
	return allRows
		.map((row) => {
			const line = row
				.map((cell, i) =>
					i < row.length - 1
						? cell + " ".repeat(columnWidths[i] - visualLength(cell))
						: cell,
				)
				.join(separator)
				.trimEnd();
			return line;
		})
		.join("\n");
}
