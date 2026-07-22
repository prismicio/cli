import dedent from "dedent";

import {
	buildCustomType,
	readLocalCustomType,
	readLocalCustomTypes,
	readLocalSlices,
	writeLocalCustomType,
} from "../test/it";
import { it, trials } from "./it";

it.for(trials)(
	"models a testimonial slice from a text description",
	async (_, { project, agent, expect }) => {
		const result = await agent(
			`Create a testimonial slice: a quote, author name, author role, an avatar, and a company logo.`,
		);

		expect(result).toHaveRun("prismic", ["slice", "create"]);
		const slices = await readLocalSlices(project);
		expect(slices.length).toBe(1);
		await expect(JSON.stringify(slices[0], null, 2)).toSatisfyJudge(
			dedent`
			This is a Prismic shared slice modeled from: "a testimonial with a quote, author name, author role, an avatar, and a company logo".
			Passes if all five are present with sensible types: rich text or key text for the quote, key text for the name and role, and image fields for the avatar and logo. Field names may vary; judge the types, not the names.
		`,
		);
	},
);

it.todo("models a slice from a screenshot");

it.for(trials)(
	"models a page type with sensible field types",
	async (_, { project, agent, expect }) => {
		const author = buildCustomType({ id: "author", label: "Author" });
		await writeLocalCustomType(project, author);

		const result = await agent(
			`model a Prismic blog post: a title, publish date, hero image, author, and body`,
		);

		expect(result).toHaveRun("prismic", ["type", "create"]);
		const models = (await readLocalCustomTypes(project)).filter((model) => model.id !== author.id);

		await expect(JSON.stringify(models, null, 2)).toSatisfyJudge(
			dedent`
			These are Prismic models for a blog post with a title, publish date, hero image, author, and body.
			Passes if the title and body are rich text, the publish date is a date or timestamp, the hero is an image, and the author is a content relationship (a link to another document type), not free text.
		`,
		);
	},
);

it.for(trials)(
	"models pages as page types and data as custom types",
	async (_, { project, agent, expect }) => {
		const result = await agent(`Model a landing page and a global navigation menu.`);

		expect(result).toHaveRun("prismic", ["type", "create"]);
		const models = await readLocalCustomTypes(project);
		const landingPage = models.find((model) => /landing/.test(model.id));
		const navigation = models.find((model) => /nav/.test(model.id));
		expect(landingPage?.format).toBe("page");
		expect(landingPage?.repeatable).toBe(true);
		expect(navigation?.format).not.toBe("page");
		expect(navigation?.repeatable).toBe(false);
	},
);

it.for(trials)(
	"handles a vague design request reasonably",
	async (_, { project, agent, expect }) => {
		const homepage = buildCustomType({ id: "homepage", label: "Homepage", repeatable: false });
		await writeLocalCustomType(project, homepage);

		const result = await agent(`The homepage needs a flexible hero.`);

		expect(result).toHaveRun("prismic");
		const models = await readLocalCustomTypes(project);
		const slices = await readLocalSlices(project);
		await expect(JSON.stringify({ models, slices }, null, 2)).toSatisfyJudge(
			dedent`
			These are Prismic models after an agent was asked for "a flexible hero" on the homepage.
			Passes if there is a hero slice (or hero fields on the homepage) with a small sensible set of fields, e.g. heading, description, image, and a call-to-action link. Variations are a plus but not required.
			Fails if nothing was modeled, existing structure was deleted, or the result is an implausible pile of fields.
		`,
		);
	},
);

it.for(trials)(
	"picks appropriate field types for a rating and a CTA",
	async (_, { project, agent, expect }) => {
		const product = buildCustomType({ id: "product", label: "Product" });
		await writeLocalCustomType(project, product);

		const result = await agent(
			`Add a star rating (1 to 5) and a call-to-action button to the "product" type.`,
		);

		expect(result).toHaveRun("prismic", ["field", "add"]);
		const model = await readLocalCustomType(project, product.id);
		await expect(JSON.stringify(model, null, 2)).toSatisfyJudge(
			dedent`
			This is a Prismic "product" model after adding a star rating (1 to 5) and a call-to-action button.
			Passes only if both hold: the rating is a number field or a select constrained to the values 1-5 (not free text), and the CTA is a single link field (ideally with display text), not separate text and URL fields.
		`,
		);
	},
);

// Fails: the agent models the title as key text instead of single-heading rich text.
it.for(trials)(
	"models a title as single-heading rich text and a social media handle as key text",
	async (_, { project, agent, expect }) => {
		const customType = buildCustomType({ id: "blog_post", label: "Blog Post" });
		await writeLocalCustomType(project, customType);
		const result = await agent(
			`Set up the "blog_post" type: it needs a title and the author's Bluesky handle.`,
		);
		expect(result).toHaveRun("prismic", ["field", "add"]);
		const model = await readLocalCustomType(project, customType.id);

		await expect(JSON.stringify(model, null, 2)).toSatisfyJudge(
			dedent`
			This is a Prismic "blog_post" model that needs a title.
			By Prismic convention, passes only if the title is rich text (type "StructuredText") limited to a single heading block.
			Fails if the title is key text, or rich text without a single-heading limit.
		`,
		);
		await expect(JSON.stringify(model, null, 2)).toSatisfyJudge(
			dedent`
			This is a Prismic "blog_post" model that needs the author's Bluesky handle.
			Passes only if the handle is key text (type "Text"): a short single-line string with no formatting.
			Fails if the handle is rich text.
		`,
		);
	},
);
