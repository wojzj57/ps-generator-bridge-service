## Commit Messages

Follow Conventional Commits:

- `feat: add new feature`
- `fix: fix bug`
- `docs: update documentation`
- `test: add tests`
- `refactor: refactor code`
- `chore: update dependencies`

All commits should include DCO sign-off:

```text
Signed-off-by: Your Name <your.email@example.com>
```

Use `git commit -s` to add sign-off automatically.

## Pull Request Checks

Every pull request targeting `master` must pass the repository CI before it is
merged. CI runs once on the pull request and checks:

- formatting with `pnpm format:check`;
- TypeScript types with `pnpm typecheck`;
- unit tests and per-package coverage with `pnpm test:ci`;
- package builds with `pnpm build`;
- published package contents with `pnpm pack:check`; and
- public documentation with `pnpm docs:build`.

The SDK, Generator, and CLI coverage thresholds are enforced independently:

| Metric     | Minimum |
| ---------- | ------: |
| Lines      |     80% |
| Functions  |     80% |
| Statements |     80% |
| Branches   |     70% |

CI uses Ubuntu and unit-test seams. It does not launch Photoshop, read the
Windows registry, or run the real `generator-core` smoke harness.

Regular feature and maintenance pull requests must not contain release state:

- Do not add a Changeset.
- Do not change a publishable package's `version` field.
- Do not edit a package `CHANGELOG.md`.
- Do not apply the `release` label.

Package changes accumulate on `master` until a dedicated version pull request
is prepared.

## Version and Release Pull Requests

Releases use one dedicated, manually initiated version pull request. Merging a
version pull request labeled `release` authorizes the release workflow to build
the publishable packages and publish them to npm. No other pull request may
publish a package.

The SDK and Generator are a fixed Changesets group. They must always be
released together with the same version. The CLI is versioned independently.

### Instructions for AI agents

When asked to prepare a version update, follow this procedure exactly. Do not
publish from a feature branch and do not add release metadata to an ordinary
feature pull request.

1. Start from a clean, current `master` branch:

   ```bash
   git switch master
   git pull --ff-only origin master
   git status --short
   ```

2. Create a dedicated release branch. Use a stable name such as
   `release/2026-07-12` or one that identifies the intended package versions:

   ```bash
   git switch -c release/<name>
   ```

3. Inspect the commits and package changes since the latest published tags.
   Determine the required semantic-version bump for every affected package:

   - `patch` for backward-compatible fixes;
   - `minor` for backward-compatible features; and
   - `major` for breaking public API or protocol changes.

   Do not infer a release solely from changed file paths. Read the commits,
   public API changes, protocol changes, and package dependency relationships.

4. Run `pnpm changeset`. Select every package that should be released, choose
   its bump level, and write concise English release notes that describe user-
   visible behavior. If either the SDK or Generator is selected, select both
   with compatible bump levels because they are a fixed group.

   ```bash
   pnpm changeset
   ```

5. Consume the generated Changeset and update package versions, package
   changelogs, and dependency metadata:

   ```bash
   pnpm version-packages
   ```

6. Inspect the generated diff before making any manual correction:

   ```bash
   git status --short
   git diff -- packages/*/package.json packages/*/CHANGELOG.md pnpm-lock.yaml
   ```

   Confirm all of the following:

   - at least one publishable package version increased;
   - every bumped package has a matching `CHANGELOG.md` entry;
   - SDK and Generator have the same version and were bumped together;
   - CLI changed only when its own release content requires it;
   - no generated `.changeset/*.md` file remains; and
   - no unrelated source or documentation changes entered the release branch.

7. Run the same checks required by pull-request CI:

   ```bash
   pnpm install --frozen-lockfile
   pnpm format:check
   pnpm typecheck
   pnpm test:ci
   pnpm build
   pnpm pack:check
   pnpm docs:build
   ```

8. Commit only the generated version, changelog, and lockfile changes. Use the
   conventional release commit with DCO sign-off:

   ```bash
   git add packages/sdk/package.json packages/sdk/CHANGELOG.md \
     packages/generator/package.json packages/generator/CHANGELOG.md \
     pnpm-lock.yaml
   git commit -s -m "chore: version packages" \
     -m "Prepare the selected package versions and changelog entries for the next npm release."
   ```

   The example stages an SDK and Generator release. For a CLI-only release,
   explicitly stage `packages/cli/package.json` and
   `packages/cli/CHANGELOG.md` instead. Omit `pnpm-lock.yaml` when it did not
   change. Stage only paths that actually changed. Never use `git add .` or
   `git add -A`.

9. Push the release branch, create a pull request targeting `master`, and add
   the GitHub label `release`. The label is release authorization metadata; it
   is not a commit, a Changeset, or part of the version history.

10. Wait for both required checks, `Quality` and `Release intent`, to pass.
    Merge only after the generated versions and changelogs have been reviewed.

11. Do not run `pnpm release` locally. Merging the labeled version pull request
    triggers the trusted release workflow from the resulting `master` push. The
    workflow checks out the merged commit, installs dependencies, rebuilds
    packages, checks package contents, and publishes through Changesets.

Each npm package's Trusted Publisher must point to the GitHub repository
`wojzj57/ps-generator-bridge-service` and workflow filename `release.yml`.
Package publishing must stay on the workflow's `push` or `workflow_dispatch`
contexts; `pull_request_target` does not provide an npm-compatible trusted
publishing identity.

### Release validation and recovery

The `Release intent` check enforces these rules:

- an unlabeled pull request cannot change versions or package changelogs;
- a pull request labeled `release` must increase at least one package version;
- a release branch must contain the current `master` tip;
- every bumped package must update its changelog;
- SDK and Generator must remain on the same version and move together;
- Changeset files must be consumed before the pull request is opened; and
- a release pull request cannot contain source, test, or documentation edits.

If publishing fails after merge, inspect the npm registry before taking action.
If no package was published, rerun the failed GitHub Actions release job. When
the workflow definition or its OIDC trigger caused the failure, merge the
workflow fix first and manually dispatch the corrected workflow with the
original release PR commit pair:

```bash
gh workflow run release.yml --ref master \
  -f base_sha=<release-pr-base-sha> \
  -f release_sha=<release-pr-merge-sha>
```

The manual run requires `release_sha` to be part of the current `master`,
validates `base_sha..release_sha`, and checks out that exact release commit
before publishing. If only some packages were published, do not reuse versions
that already exist on npm and do not rerun blindly; prepare a corrective version
pull request for the remaining packages.
