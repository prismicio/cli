import baseDedent from "dedent";

export const dedent = baseDedent.withOptions({ alignValues: true });

export function formatTable(
	rows: string[][],
	config?: { headers?: string[]; separator?: string },
): string {
	const separator = config?.separator ?? "   ";
	const allRows = config?.headers ? [config.headers, ...rows] : rows;
	const columnWidths: number[] = [];
	for (const row of allRows) {
		for (let i = 0; i < row.length; i++) {
			columnWidths[i] = Math.max(columnWidths[i] ?? 0, row[i].length);
		}
	}
	return allRows
		.map((row) => {
			const line = row
				.map((cell, i) => (i < row.length - 1 ? cell.padEnd(columnWidths[i]) : cell))
				.join(separator)
				.trimEnd();
			return line;
		})
		.join("\n");
}
