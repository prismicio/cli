import { expectTypeOf } from "vitest";

import { it } from "./it";

// TODO: Test the package's public types
// See: https://vitest.dev/guide/testing-types.html

it("placeholder test", () => {
	expectTypeOf(true).toBeBoolean();
});
