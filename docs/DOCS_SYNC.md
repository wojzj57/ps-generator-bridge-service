# Docs Sync

Public docs have been reviewed through code commit:

`a4c51fc44852d1af7a00bbf63f05398b6b6fd314`

## Scope

Public documentation in `docs/` should reflect user-facing behavior in:

- `packages/sdk`
- `packages/generator`
- `packages/testkit`
- package README files

Private notes are intentionally out of scope.

## Update Procedure

When updating docs after code changes:

1. Read the commit above.
2. Run `git diff --name-only <commit>..HEAD`.
3. Review source, tests, package exports, and package README changes for user-facing behavior.
4. Update public docs in `docs/`.
5. Replace the commit above with the latest code commit whose docs have been reviewed.

