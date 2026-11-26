# Channel Queue changelog

## v2.0.0
_2026-11-26_ (CodeKunde fork)

 * **New package name:** `@buttercup-fork/channel-queue` on npm (import from it instead of `@buttercup/channel-queue`), staged from GitHub Actions through trusted publishing with provenance (`publish.yml`, started by hand); the package name `@buttercup/channel-queue` stays upstream's
 * **Breaking**: an ES module now (`"type": "module"`, `exports`), built for ES2020; requires NodeJS 22+. CI runs on branch pushes only (Node 22 and 24)
 * `prepare` script, so installing from a git URL builds `dist/` (B-585: without it, a git install had no `dist` and failed)
 * Dependencies: `layerr` 3 and `eventemitter3` 5, the versions the apps use (B-589); dev tooling TypeScript 6, mocha 12, chai 6, `chai-as-promised` 8, sinon 22, Prettier 3 (also checking the TypeScript sources), rimraf 6; `husky` and `lint-staged` dropped; `jsdoc-to-markdown` dropped (its `handlebars` dependency had a critical advisory, B-562), `API.md` is kept by hand; `npm audit` clean
 * A test pins what the package exports to the apps
 * README: install from `buttercup-fork`, no npm badge
 * `author` email is `buttercup@codekunde.net` (was upstream's `info@buttercup.pw`, B-509)
 * **Breaking**: `clear()` rejects the promise of every task it removes with `ErrorCode.TaskCleared` (new); before, those promises never settled and an `await` on one hung for good. A caller that kept no promise gets no unhandled rejection (B-587)
 * **Breaking**: `ParallelChannel.parallelism` throws unless set to a number of at least 1 (a fraction is rounded down); `NaN` or a string used to stop the channel for good. `createParallelChannel(name, parallelism)` applies the same check (0 used to fall back to 2) and creates no channel when it refuses (B-586)
 * `ParallelChannel`: a task added while the channel runs starts at once in a free slot instead of waiting for a running task to end; `tasksThrow = false` and `waitForEmpty({ throwForFailures })` now work as on `Channel` (B-586)
 * `waitForEmpty({ throwForFailures })` reports each failure once instead of on every later wait, and keeps at most 100 unreported failures (B-587)
 * A time limit's timer is cleared when the task fails, not only when it succeeds (B-561)
 * `enqueue` puts the task into its place with a binary search instead of sorting the whole queue each time; the order is unchanged (B-590)
 * `ChannelQueue` accepts any channel name, `hasOwnProperty` and `__proto__` included (B-590)
 * README: NodeJS 22, time limits (they do not stop the task), what `clear()` does, that an unhandled failing task ends a NodeJS process, stacking; API.md updated to match (B-588)

## v1.5.0
_2024-12-11_

 * [#14](https://github.com/buttercup/channel-queue/pull/14) Fix ESM builds with `eventemitter3` correct import

## v1.4.0
_2023-11-12_

 * Support for preventing enqueued tasks from throwing

## v1.3.0
_2023-11-06_

 * Support throwing error on `waitForEmpty` if task failed, using `throwForFailures` option

## v1.2.0
_2022-04-20_

 * Timeout support for enqueued tasks

## v1.1.1
_2022-04-19_

 * **Bugfix**:
   * `ParallelChannel#waitForEmpty` fired before last callbacks finished

## v1.1.0
_2022-04-14_

 * `Channel#waitForEmpty` and `ParallelChannel#waitForEmpty` helpers

## v1.0.1
_2021-05-30_

 * Fix `enqueue` signature

## v1.0.0
_2021-05-21_

 * Convert to Typescript
 * **Breaking changes**:
   * New type interfaces replace symbols: _see the readme_
   * No default exports: All exports are now named: _see the readme_

## v0.5.0
_2019-11-26_

 * `Channel#clear(priorityType)` for clearing only items with a certain priority type

## v0.4.0
_2019-05-17_

 * `Channel#clear()` for clearing queued items

## v0.3.0
_2018-02-09_

 * Parallelism

## v0.2.2
_2017-10-21_

 * Stacked items support
