# Changelog

## 1.0.0 (2026-03-11)


### Features

* `webhook` commands ([66ed8f2](https://github.com/prismicio/cli/commit/66ed8f2ac90da13e3c86a6c22ff3b01486fa84ef))
* add `--version` flag ([3b516a3](https://github.com/prismicio/cli/commit/3b516a3658c12db813c4f76aaa070cb50ad061e3))
* add `codegen types` command ([6fd8413](https://github.com/prismicio/cli/commit/6fd84133dd3d53a743cce6dad272f9190520815c))
* add `preview` commands ([840557e](https://github.com/prismicio/cli/commit/840557e14b5b37222873ccd3025e1aeb0ab79541))
* add `prismic docs` command ([#5](https://github.com/prismicio/cli/issues/5)) ([63deeeb](https://github.com/prismicio/cli/commit/63deeebb3d66d4eb9a8b4e0cb48c2196aa7a26b7))
* add `push` command and rename `sync` to `push` ([e58e691](https://github.com/prismicio/cli/commit/e58e6913172bb8ecda67fb0da10f150e3f412f8c))
* add `sync` command ([2ff9563](https://github.com/prismicio/cli/commit/2ff956394d3c1701f64b1cabd7d40c5b342237df))
* add `token` commands ([ac8a1c5](https://github.com/prismicio/cli/commit/ac8a1c5cdcb098c9cba4e1c22ababd82e72579f1))
* add `whoami` ([6e43d26](https://github.com/prismicio/cli/commit/6e43d268eded30ccef81b3549190fb99be7a6d54))
* add analytics and error reporting parity with devtools ([#36](https://github.com/prismicio/cli/issues/36)) ([353d566](https://github.com/prismicio/cli/commit/353d5667cfa5f29cc6fa0317c8361f06e9b0fdc0))
* add connect slice next step to status command ([3e383cd](https://github.com/prismicio/cli/commit/3e383cdd7458c8d19c3ac3f545613e4d0f330088))
* add default fields to page types and custom types ([#6](https://github.com/prismicio/cli/issues/6)) ([1d36cd8](https://github.com/prismicio/cli/commit/1d36cd8409d789bce3e09e0b09f5996483f33769))
* add docs fetch/list commands ([#10](https://github.com/prismicio/cli/issues/10)) ([1143872](https://github.com/prismicio/cli/commit/114387285ca68e22b8eed8b88806a5524f9046ed))
* add group field support to add-field commands ([6615d1c](https://github.com/prismicio/cli/commit/6615d1ca3ec6c2b39c4d1691576a4e9f2268d178))
* add init command ([c6fb47e](https://github.com/prismicio/cli/commit/c6fb47e2cfb8f0317b9ba0b0142bde9e5a749bdd))
* add initial commands ([2988e31](https://github.com/prismicio/cli/commit/2988e3141d54641c810d4128eae0945e495d9794))
* add missing commands ([e7e1728](https://github.com/prismicio/cli/commit/e7e17283a0bff7cd7663156abbe5c7a7be84a9e4))
* add next steps guidance to CLI commands and status ([#4](https://github.com/prismicio/cli/issues/4)) ([dcb352d](https://github.com/prismicio/cli/commit/dcb352d65a8cae282c4bd18ea1ac6c448be8c225))
* add per-section next steps to `prismic status` ([e479dab](https://github.com/prismicio/cli/commit/e479dab7cb177510eb8c477ee6e738f7ddfc4ef1))
* add screenshot support to slices ([fe51fbb](https://github.com/prismicio/cli/commit/fe51fbb54f85ea06152574cf90f75e77edbcb702))
* add Sentry, Segment, and native sync command ([#6](https://github.com/prismicio/cli/issues/6)) ([7a9ed0c](https://github.com/prismicio/cli/commit/7a9ed0c12f07fe99040606c38fde61eff6aef6ab))
* add some commands ([7eca3a2](https://github.com/prismicio/cli/commit/7eca3a268b6a0350e87d91d12bfebcaabfe2fef0))
* always generate types after model changes ([#7](https://github.com/prismicio/cli/issues/7)) ([5da487c](https://github.com/prismicio/cli/commit/5da487c4305fd3e90619759c6fbf022df973a67e))
* check domain availability before creating repository ([aa21905](https://github.com/prismicio/cli/commit/aa21905e1a03a020c8d051f9c6132182876354ca))
* create a config on `repo create` ([ee66a40](https://github.com/prismicio/cli/commit/ee66a402cb516a9750e7a02ab9314eb61428b6f8))
* generate types on model changes ([868b724](https://github.com/prismicio/cli/commit/868b724ace8f92c5b48f211b47967cc30cadb324))
* infer field labels and add preview/repo access commands ([ffce483](https://github.com/prismicio/cli/commit/ffce483b1871d751637663a2842c04c40a3b57b8))
* init ([c7507e2](https://github.com/prismicio/cli/commit/c7507e2c7718e29b2de6211ecd70858c0265e967))
* limit CLI to `init`, `sync`, and auth commands ([#29](https://github.com/prismicio/cli/issues/29)) ([c889649](https://github.com/prismicio/cli/commit/c88964943eba679c83abcd2657584a6e6dabc896))
* port devtools init/sync commands ([#4](https://github.com/prismicio/cli/issues/4)) ([679fa6a](https://github.com/prismicio/cli/commit/679fa6a67b5f67e38bedf92c4f4228b5ded3cad1))
* prefer port 5555 for login server with fallback to random port ([3fe9287](https://github.com/prismicio/cli/commit/3fe928790af59731bc985b1c612ee42a67742123))
* re-implement init command with login, migration, and sync ([#8](https://github.com/prismicio/cli/issues/8)) ([5f0261d](https://github.com/prismicio/cli/commit/5f0261da345d05d6657134a91dc1e1b6c31d0498))
* read from `prismic.config.json` and update help text ([1b00d3b](https://github.com/prismicio/cli/commit/1b00d3b30f02b624f688ee17ec2c55e41b845d6c))
* repo commands ([1b74f30](https://github.com/prismicio/cli/commit/1b74f30a0461b4e464c5b58b8beb4935cca2f391))
* update `repo create` messaging ([e7b69f3](https://github.com/prismicio/cli/commit/e7b69f333dc84dc0b7ce9b48f8f7602e55ff895e))


### Bug Fixes

* bind login server to 0.0.0.0 and restrict CORS origin ([5fed593](https://github.com/prismicio/cli/commit/5fed593b4e8a813ec929aa6aa2ac6f22e922cb24))
* guard against undefined command in tracking and token refresh ([#41](https://github.com/prismicio/cli/issues/41)) ([9861bb5](https://github.com/prismicio/cli/commit/9861bb5df017b1cd1f020245e3303a65094bf0b8))
* lower minimum Node.js engine requirement to &gt;=20 ([#43](https://github.com/prismicio/cli/issues/43)) ([f0c9487](https://github.com/prismicio/cli/commit/f0c9487021afc7268738f412dd43f9593ad2c337))
* update profile after login during init ([#45](https://github.com/prismicio/cli/issues/45)) ([ea38659](https://github.com/prismicio/cli/commit/ea386592ee79c115e1a448950c5a25976bfaaec7))
* use writeFileRecursive to ensure parent directories exist ([#44](https://github.com/prismicio/cli/issues/44)) ([52478dd](https://github.com/prismicio/cli/commit/52478dd357cc1c304a531656cb682b7df458442a))
