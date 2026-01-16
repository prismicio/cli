import { expectTypeOf, it } from "vitest"

import { hello } from "../src"

// TODO: Test the package's public types
// See: https://vitest.dev/guide/testing-types.html

it("returns a string", () => {
	expectTypeOf(hello).returns.toBeString()
})
