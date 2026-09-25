import baseDedent from "dedent";

const baseDedentWithOptions = baseDedent.withOptions({ alignValues: true });

export function dedent(strings: TemplateStringsArray | string, ...values: unknown[]): string {
	if (typeof strings === "string") {
		return baseDedentWithOptions(strings);
	}

	// dedent reads `strings.raw` by default, which keeps escapes the bundler adds
	// to string literals (e.g. `</script>` becomes `<\/script>`). Point `raw` at
	// the regular string segments instead, where escapes are already resolved, so
	// they don't leak into generated files.
	const resolved = Array.from(strings);
	return baseDedentWithOptions(Object.assign(resolved, { raw: resolved }), ...values);
}

export function formatObjectKey(key: string): string {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

export function formatTable(rows: string[][], config?: { headers?: string[] }): string {
	const allRows = config?.headers ? [config.headers, ...rows] : rows;
	const columnWidths: number[] = [];
	for (const row of allRows) {
		for (let i = 0; i < row.length; i++) {
			columnWidths[i] = Math.max(columnWidths[i] ?? 0, row[i].length);
		}
	}

	return allRows
		.map((row) =>
			row
				.map((cell, i) => (i < row.length - 1 ? cell.padEnd(columnWidths[i]) : cell))
				.join("   ")
				.trimEnd(),
		)
		.join("\n");
}
