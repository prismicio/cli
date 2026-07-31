import dedent from "dedent";
import { readdir, readFile } from "node:fs/promises";

import { buildSlice, readLocalCustomTypes, readLocalSlices, writeLocalSlice } from "../test/it";
import { it, trials } from "./it";

it.for(trials)("writes a slice component", async (_, { project, agent, expect }) => {
	const slice = buildSlice({ id: "testimonial", name: "Testimonial" });
	slice.variations[0].primary = {
		quote: { type: "StructuredText", config: { label: "Quote", multi: "paragraph" } },
		avatar: { type: "Image", config: { label: "Avatar" } },
		attribution: { type: "Text", config: { label: "Attribution" } },
	};
	await writeLocalSlice(project, slice);

	await agent(`Create the React component for the "Testimonial" slice.`);

	const dir = new URL("slices/Testimonial/", project);
	const files = await readdir(dir);
	const componentFile = files.find((file) => /\.(t|j)sx$/.test(file));
	expect(componentFile).toBeTruthy();
	const component = await readFile(new URL(componentFile!, dir), "utf8");
	expect(component).toContain("quote");
	expect(component).toContain("avatar");
	expect(component).toContain("attribution");
	await expect(component).toSatisfyJudge(
		dedent`
			This is a React component for a Prismic slice with a rich text "quote" field, an image "avatar" field, and a key text "attribution" field.
			Passes if it follows Prismic conventions: renders the quote with PrismicRichText (not raw text), renders the avatar with PrismicNextImage or PrismicImage (not next/image or <img>), and receives the slice via props.
		`,
	);
});

it.todo("wires a page that passes a production build");

it.for(trials)(
	"models and wires a landing page end to end",
	async (_, { project, agent, expect }) => {
		const result = await agent(
			`Build a Prismic landing page for this project: a "landing_page" type with a hero slice (heading, description, image, CTA), wired up so the page renders its slices.`,
		);

		expect(result).toHaveRun("prismic", ["type", "create"]);
		expect(result).toHaveRun("prismic", ["slice", "create"]);
		expect(result).toHaveRun("prismic", ["slice", "connect"]);
		const models = await readLocalCustomTypes(project);
		const landingPage = models.find((model) => model.id === "landing_page");
		expect(landingPage).toBeTruthy();
		const slices = await readLocalSlices(project);
		expect(slices.length).toBeGreaterThan(0);

		const sliceZone = Object.values(landingPage!.json.Main).find(
			(field) => field.type === "Slices",
		);
		const choices = (sliceZone?.config as { choices?: Record<string, unknown> })?.choices ?? {};
		expect(slices.some((slice) => slice.id in choices)).toBe(true);
	},
);
