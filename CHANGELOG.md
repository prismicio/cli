# Changelog

## [1.8.0](https://github.com/prismicio/cli/compare/v1.7.2...v1.8.0) (2026-05-13)


### Features

* add default UID field to new repeatable types ([#184](https://github.com/prismicio/cli/issues/184)) ([89591e5](https://github.com/prismicio/cli/commit/89591e5b3850deacd3abd8631d37c944d3ae7fe3))
* configure preview and simulator URL on init ([#183](https://github.com/prismicio/cli/issues/183)) ([2979d6b](https://github.com/prismicio/cli/commit/2979d6b91aa7f0ee87ae7350dab0d863a8754e68))
* mark onboarding steps from CLI commands ([#178](https://github.com/prismicio/cli/issues/178)) ([9ae5b1d](https://github.com/prismicio/cli/commit/9ae5b1d50ecf0ebf927341634612beb07d67e483))
* **tracking:** identify CLI and detect AI agent harness ([#175](https://github.com/prismicio/cli/issues/175)) ([1d5c9ed](https://github.com/prismicio/cli/commit/1d5c9ed4b516b1877ea981e9dcabdc882303efad))
* use --name as repository domain in repo create and init ([#180](https://github.com/prismicio/cli/issues/180)) ([1b7e4bf](https://github.com/prismicio/cli/commit/1b7e4bf5e93369a34787951e424436446c0b371d))


### Bug Fixes

* map non-prod hosts to staging Amplitude ([#179](https://github.com/prismicio/cli/issues/179)) ([4d981f8](https://github.com/prismicio/cli/commit/4d981f8fc909117801ee44e03da55666eb99190e))
* windows compatibility ([#185](https://github.com/prismicio/cli/issues/185)) ([79e9cc9](https://github.com/prismicio/cli/commit/79e9cc9bf563ab5c0cf0d92986cd4a65b6ff43a9))

## [1.7.2](https://github.com/prismicio/cli/compare/v1.7.1...v1.7.2) (2026-05-05)


### Bug Fixes

* derive Amplitude server URL from host ([#173](https://github.com/prismicio/cli/issues/173)) ([cc6f2d7](https://github.com/prismicio/cli/commit/cc6f2d7a1c7ae90162f5fe0b1d984f2f8c0af861))
* rename stray segmentTrackEnd call to trackCommandEnd ([#177](https://github.com/prismicio/cli/issues/177)) ([90818aa](https://github.com/prismicio/cli/commit/90818aad321200d62a60388dd93c08719c36af92))

## [1.7.1](https://github.com/prismicio/cli/compare/v1.7.0...v1.7.1) (2026-05-02)


### Bug Fixes

* ignore cosmetic key-order drift in model comparisons ([#172](https://github.com/prismicio/cli/issues/172)) ([5a96016](https://github.com/prismicio/cli/commit/5a9601623e47730fb559f86df7b93d8a75154288))
* include untracked model files in dirty tree check ([#169](https://github.com/prismicio/cli/issues/169)) ([9e130c3](https://github.com/prismicio/cli/commit/9e130c33fc1ae6dd281a70d814da3f153918aa3a))

## [1.7.0](https://github.com/prismicio/cli/compare/v1.6.1...v1.7.0) (2026-05-01)


### Features

* add --env flag ([#167](https://github.com/prismicio/cli/issues/167)) ([3dbdb86](https://github.com/prismicio/cli/commit/3dbdb869b73a5c6fab987e2e5eda455ac98bfbe9))
* add examples to --help output for complex commands ([#154](https://github.com/prismicio/cli/issues/154)) ([a4e39db](https://github.com/prismicio/cli/commit/a4e39db3ba7e4645cd0d51fb0f381c48721230a8))
* add push, pull, and fetch commands ([#164](https://github.com/prismicio/cli/issues/164)) ([ef09ffa](https://github.com/prismicio/cli/commit/ef09ffac9e394b612e5c356d68718bb58de3c728))
* add status command and simplify model sync ([#166](https://github.com/prismicio/cli/issues/166)) ([f010fa5](https://github.com/prismicio/cli/commit/f010fa56b200d7b0dbd6d930cdd53bcd2e242754))
* create a new repository during init when --repo is not provided ([#147](https://github.com/prismicio/cli/issues/147)) ([a4a8aba](https://github.com/prismicio/cli/commit/a4a8aba1ab17203908cc2204e6f7a17a16a8f3b7))
* document group field dot notation in field add help ([#152](https://github.com/prismicio/cli/issues/152)) ([c353e2f](https://github.com/prismicio/cli/commit/c353e2fc0fd003e8fcf631d78a93167bd3e59a2f))
* **nuxt:** module doesn't require further configuration ([#165](https://github.com/prismicio/cli/issues/165)) ([31c2c56](https://github.com/prismicio/cli/commit/31c2c56a14958017181835874d64d78a0ad4c2f6))
* operate on local models only ([a744f54](https://github.com/prismicio/cli/commit/a744f5454743c2af41dd95c833c2af6e7ffdf655))
* print suggested next steps after mutating commands ([#157](https://github.com/prismicio/cli/issues/157)) ([3f53653](https://github.com/prismicio/cli/commit/3f536538a527d0e429ebe9f2bc97b0feab365382))
* surface content-relationship --field flag in help text ([#153](https://github.com/prismicio/cli/issues/153)) ([84390d1](https://github.com/prismicio/cli/commit/84390d162702e8afc06ad71a90bf347cf8bd8f76))
* surface prismic docs command in top-level help ([#155](https://github.com/prismicio/cli/issues/155)) ([bdbe6a3](https://github.com/prismicio/cli/commit/bdbe6a346de6365a87d732c1361930278eb6b57d))


### Bug Fixes

* preserve order for docs anchors instead of sorting alphabetically ([#151](https://github.com/prismicio/cli/issues/151)) ([494e82d](https://github.com/prismicio/cli/commit/494e82d44def18944d31307be3c77216b70018c4)), closes [#144](https://github.com/prismicio/cli/issues/144)
* **win32:** don't open extra terminal ([#159](https://github.com/prismicio/cli/issues/159)) ([d418cc9](https://github.com/prismicio/cli/commit/d418cc996e7d4a8264dd6ba67bed4e2ce2534393))

## [1.6.1](https://github.com/prismicio/cli/compare/v1.6.0...v1.6.1) (2026-04-15)


### Bug Fixes

* only send unknown or intentionally tracked errors to Segment ([#136](https://github.com/prismicio/cli/issues/136)) ([604e895](https://github.com/prismicio/cli/commit/604e895218dee2d68b57dcd55162c5a5465941da))


### Performance Improvements

* move token refresh to a detached subprocess ([#134](https://github.com/prismicio/cli/issues/134)) ([e189ed5](https://github.com/prismicio/cli/commit/e189ed5f39a3d973617e591af79f1667e47fa28b))

## [1.6.0](https://github.com/prismicio/cli/compare/v1.5.0...v1.6.0) (2026-04-15)


### Features

* add a consistent table formatter for tabular output ([#125](https://github.com/prismicio/cli/issues/125)) ([9a79c50](https://github.com/prismicio/cli/commit/9a79c50abb78ee311e2b9aa79a613d4885aff85d))
* add remote modeling commands for custom types, page types, and slices ([#83](https://github.com/prismicio/cli/issues/83)) ([78c13b0](https://github.com/prismicio/cli/commit/78c13b066814d95429cbb0f17fcd71f5ae793d98))
* move CLI config to cross-platform config directory ([#130](https://github.com/prismicio/cli/issues/130)) ([39fc1d7](https://github.com/prismicio/cli/commit/39fc1d750d0d7261df84d2b1a7c5046b614b45a3))


### Bug Fixes

* handle 404 errors with contextual messages ([#121](https://github.com/prismicio/cli/issues/121)) ([7f75f97](https://github.com/prismicio/cli/commit/7f75f978ca6509eac7572b78dac30754a4f30609))

## [1.5.0](https://github.com/prismicio/cli/compare/v1.4.0...v1.5.0) (2026-04-08)


### Features

* add `docs` command for browsing Prismic documentation ([#85](https://github.com/prismicio/cli/issues/85)) ([787a9c1](https://github.com/prismicio/cli/commit/787a9c186a2e13ed34f39d37cdfd04a1a498d718))
* notify when a newer CLI version is available ([#87](https://github.com/prismicio/cli/issues/87)) ([4025179](https://github.com/prismicio/cli/commit/4025179a7d6bc22a5cb2374eb2d864d15a003695))


### Bug Fixes

* use correct Amplitude vardata path ([#88](https://github.com/prismicio/cli/issues/88)) ([e7aa64c](https://github.com/prismicio/cli/commit/e7aa64c0ac49f2e25b33fa3c1e4fb272c5a5a744))
* use slice `id` instead of `name` for generated TypeScript types ([#90](https://github.com/prismicio/cli/issues/90)) ([d6f53e4](https://github.com/prismicio/cli/commit/d6f53e473a6527d6588ec64af3e37dc81e7c7605))

## [1.4.0](https://github.com/prismicio/cli/compare/v1.3.0...v1.4.0) (2026-04-02)


### Features

* support Slice Machine projects ([#84](https://github.com/prismicio/cli/issues/84)) ([6daa538](https://github.com/prismicio/cli/commit/6daa538b614298bc9c280eab9b6ec948ae0bcb0d))

## [1.3.0](https://github.com/prismicio/cli/compare/v1.2.1...v1.3.0) (2026-03-25)


### Features

* add `gen setup` command ([#73](https://github.com/prismicio/cli/issues/73)) ([9f1abb9](https://github.com/prismicio/cli/commit/9f1abb9fb03044b84ecb1bb92a864e6df34421f2))
* add documentAPIEndpoint to config ([#71](https://github.com/prismicio/cli/issues/71)) ([c647872](https://github.com/prismicio/cli/commit/c647872c9cff38622016479a794b92818836b9aa))
* add gen commands ([#68](https://github.com/prismicio/cli/issues/68)) ([3077302](https://github.com/prismicio/cli/commit/30773024f845dedc7aa7651ca26690f6a4c7ded6)), closes [#19](https://github.com/prismicio/cli/issues/19)
* add locale commands ([#66](https://github.com/prismicio/cli/issues/66)) ([b3507fb](https://github.com/prismicio/cli/commit/b3507fbc34960403c0f1aa9bd09f4adb563045a8))
* add repo commands ([#69](https://github.com/prismicio/cli/issues/69)) ([acf686e](https://github.com/prismicio/cli/commit/acf686e89b8b6f6e7aacc5508e58129d9d5ce839)), closes [#16](https://github.com/prismicio/cli/issues/16)
* add token commands ([#67](https://github.com/prismicio/cli/issues/67)) ([f02cfc3](https://github.com/prismicio/cli/commit/f02cfc3c906517f50d6027347227c9cc670d6251))
* generate page files for page types ([#63](https://github.com/prismicio/cli/issues/63)) ([1b40899](https://github.com/prismicio/cli/commit/1b408995f68843856eee883f2c84ad14cfb4a15c))
* manage routes in config for page types ([#62](https://github.com/prismicio/cli/issues/62)) ([6831aaa](https://github.com/prismicio/cli/commit/6831aaa3cff3013bb2eced1812a2d360013697c1))

## [1.2.1](https://github.com/prismicio/cli/compare/v1.2.0...v1.2.1) (2026-03-23)


### Bug Fixes

* slice file creation during sync ([#58](https://github.com/prismicio/cli/issues/58)) ([c50ec41](https://github.com/prismicio/cli/commit/c50ec41d0ed3f834258873969e42ed24ec54f231))

## [1.2.0](https://github.com/prismicio/cli/compare/v1.1.0...v1.2.0) (2026-03-21)


### Features

* add preview commands ([#55](https://github.com/prismicio/cli/issues/55)) ([b56262f](https://github.com/prismicio/cli/commit/b56262fad7d1fb5b789aad32565ff5757559a9eb))
* add webhook commands ([#35](https://github.com/prismicio/cli/issues/35)) ([c7c763a](https://github.com/prismicio/cli/commit/c7c763a875a523dc2c9804b46e3424bc3553543c))
* install dependencies on init ([#57](https://github.com/prismicio/cli/issues/57)) ([f180b07](https://github.com/prismicio/cli/commit/f180b07c6c0268eab6a231037b920fa96b3eff56))

## [1.1.0](https://github.com/prismicio/cli/compare/v1.0.0...v1.1.0) (2026-03-12)


### Features

* generate TypeScript types after sync and init ([#48](https://github.com/prismicio/cli/issues/48)) ([006e9b2](https://github.com/prismicio/cli/commit/006e9b25c476df1510c7eb007ac845813c22b5ba))

## 1.0.0 (2026-03-11)

Initial release.
