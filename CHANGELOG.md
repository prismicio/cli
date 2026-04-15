# Changelog

## [1.6.0](https://github.com/prismicio/cli/compare/v1.5.0...v1.6.0) (2026-04-15)

### Features

- add a consistent table formatter for tabular output ([#125](https://github.com/prismicio/cli/issues/125)) ([9a79c50](https://github.com/prismicio/cli/commit/9a79c50abb78ee311e2b9aa79a613d4885aff85d))
- add remote modeling commands for custom types, page types, and slices ([#83](https://github.com/prismicio/cli/issues/83)) ([78c13b0](https://github.com/prismicio/cli/commit/78c13b066814d95429cbb0f17fcd71f5ae793d98))
- move CLI config to cross-platform config directory ([#130](https://github.com/prismicio/cli/issues/130)) ([39fc1d7](https://github.com/prismicio/cli/commit/39fc1d750d0d7261df84d2b1a7c5046b614b45a3))

### Bug Fixes

- handle 404 errors with contextual messages ([#121](https://github.com/prismicio/cli/issues/121)) ([7f75f97](https://github.com/prismicio/cli/commit/7f75f978ca6509eac7572b78dac30754a4f30609))

## [1.5.0](https://github.com/prismicio/cli/compare/v1.4.0...v1.5.0) (2026-04-08)

### Features

- add `docs` command for browsing Prismic documentation ([#85](https://github.com/prismicio/cli/issues/85)) ([787a9c1](https://github.com/prismicio/cli/commit/787a9c186a2e13ed34f39d37cdfd04a1a498d718))
- notify when a newer CLI version is available ([#87](https://github.com/prismicio/cli/issues/87)) ([4025179](https://github.com/prismicio/cli/commit/4025179a7d6bc22a5cb2374eb2d864d15a003695))

### Bug Fixes

- use correct Amplitude vardata path ([#88](https://github.com/prismicio/cli/issues/88)) ([e7aa64c](https://github.com/prismicio/cli/commit/e7aa64c0ac49f2e25b33fa3c1e4fb272c5a5a744))
- use slice `id` instead of `name` for generated TypeScript types ([#90](https://github.com/prismicio/cli/issues/90)) ([d6f53e4](https://github.com/prismicio/cli/commit/d6f53e473a6527d6588ec64af3e37dc81e7c7605))

## [1.4.0](https://github.com/prismicio/cli/compare/v1.3.0...v1.4.0) (2026-04-02)

### Features

- support Slice Machine projects ([#84](https://github.com/prismicio/cli/issues/84)) ([6daa538](https://github.com/prismicio/cli/commit/6daa538b614298bc9c280eab9b6ec948ae0bcb0d))

## [1.3.0](https://github.com/prismicio/cli/compare/v1.2.1...v1.3.0) (2026-03-25)

### Features

- add `gen setup` command ([#73](https://github.com/prismicio/cli/issues/73)) ([9f1abb9](https://github.com/prismicio/cli/commit/9f1abb9fb03044b84ecb1bb92a864e6df34421f2))
- add documentAPIEndpoint to config ([#71](https://github.com/prismicio/cli/issues/71)) ([c647872](https://github.com/prismicio/cli/commit/c647872c9cff38622016479a794b92818836b9aa))
- add gen commands ([#68](https://github.com/prismicio/cli/issues/68)) ([3077302](https://github.com/prismicio/cli/commit/30773024f845dedc7aa7651ca26690f6a4c7ded6)), closes [#19](https://github.com/prismicio/cli/issues/19)
- add locale commands ([#66](https://github.com/prismicio/cli/issues/66)) ([b3507fb](https://github.com/prismicio/cli/commit/b3507fbc34960403c0f1aa9bd09f4adb563045a8))
- add repo commands ([#69](https://github.com/prismicio/cli/issues/69)) ([acf686e](https://github.com/prismicio/cli/commit/acf686e89b8b6f6e7aacc5508e58129d9d5ce839)), closes [#16](https://github.com/prismicio/cli/issues/16)
- add token commands ([#67](https://github.com/prismicio/cli/issues/67)) ([f02cfc3](https://github.com/prismicio/cli/commit/f02cfc3c906517f50d6027347227c9cc670d6251))
- generate page files for page types ([#63](https://github.com/prismicio/cli/issues/63)) ([1b40899](https://github.com/prismicio/cli/commit/1b408995f68843856eee883f2c84ad14cfb4a15c))
- manage routes in config for page types ([#62](https://github.com/prismicio/cli/issues/62)) ([6831aaa](https://github.com/prismicio/cli/commit/6831aaa3cff3013bb2eced1812a2d360013697c1))

## [1.2.1](https://github.com/prismicio/cli/compare/v1.2.0...v1.2.1) (2026-03-23)

### Bug Fixes

- slice file creation during sync ([#58](https://github.com/prismicio/cli/issues/58)) ([c50ec41](https://github.com/prismicio/cli/commit/c50ec41d0ed3f834258873969e42ed24ec54f231))

## [1.2.0](https://github.com/prismicio/cli/compare/v1.1.0...v1.2.0) (2026-03-21)

### Features

- add preview commands ([#55](https://github.com/prismicio/cli/issues/55)) ([b56262f](https://github.com/prismicio/cli/commit/b56262fad7d1fb5b789aad32565ff5757559a9eb))
- add webhook commands ([#35](https://github.com/prismicio/cli/issues/35)) ([c7c763a](https://github.com/prismicio/cli/commit/c7c763a875a523dc2c9804b46e3424bc3553543c))
- install dependencies on init ([#57](https://github.com/prismicio/cli/issues/57)) ([f180b07](https://github.com/prismicio/cli/commit/f180b07c6c0268eab6a231037b920fa96b3eff56))

## [1.1.0](https://github.com/prismicio/cli/compare/v1.0.0...v1.1.0) (2026-03-12)

### Features

- generate TypeScript types after sync and init ([#48](https://github.com/prismicio/cli/issues/48)) ([006e9b2](https://github.com/prismicio/cli/commit/006e9b25c476df1510c7eb007ac845813c22b5ba))

## 1.0.0 (2026-03-11)

Initial release.
