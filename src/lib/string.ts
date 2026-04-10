import baseDedent from "dedent";

export const dedent = baseDedent.withOptions({ alignValues: true });

export function formatTable(rows: string[][], separator = "   "): string {
	const columnWidths: number[] = [];
	for (const row of rows) {
		for (let i = 0; i < row.length; i++) {
			columnWidths[i] = Math.max(columnWidths[i] ?? 0, row[i].length);
		}
	}
	return rows
		.map((row) =>
			row
				.map((cell, i) => (i < row.length - 1 ? cell.padEnd(columnWidths[i]) : cell))
				.join(separator)
				.trimEnd(),
		)
		.join("\n");
}
