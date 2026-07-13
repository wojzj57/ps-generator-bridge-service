# Module API Support Iteration Notes

## Goal

Add HTTP API entry points for built-in generator module capabilities that were
already exposed through WebSocket Protocol methods.

Status: completed and committed. This file is retained as an implementation
record; the public contract lives in the protocol and API route references.

## API Mapping

| WS method                           | HTTP route                                    | Status                                            |
| ----------------------------------- | --------------------------------------------- | ------------------------------------------------- |
| `action:autoCutout`                 | `POST /action/auto-cutout`                    | Added                                             |
| `action:removeBackground`           | `POST /action/remove-background`              | Added                                             |
| `document:current`                  | `GET /document/current`                       | Added                                             |
| `document:export`                   | `POST /document/export`                       | Added                                             |
| `document:save`                     | `POST /document/save`                         | Added                                             |
| `layer:getInfo`                     | `GET /layer/info`                             | Added                                             |
| `layer:getInfoById`                 | `GET /layer/by-id/{layerID}`                  | Added                                             |
| `layer:getInfoByIndex`              | `GET /layer/by-index/{layerIndex}`            | Added                                             |
| `layer:getCurrentPreview`           | `GET /layer/current-preview`                  | Added                                             |
| `layer:importImage`                 | `POST /layer/import-image`                    | Added                                             |
| `image:exportLayer`                 | `POST /image/export-layer`                    | Added                                             |
| `image:exportLayerWithSelectedPath` | `POST /image/export-layer-with-selected-path` | Added                                             |
| `image:getPreview`                  | `GET /image/preview/{layerSpec}`              | Added                                             |
| `image:exportDocument`              | `POST /image/export-document`                 | Added                                             |
| `selection:getArea`                 | `GET /selection/area`                         | Added                                             |
| `selection:getPath`                 | `GET /selection/path`                         | Added                                             |
| `selection:change`                  | none                                          | Not exposed over HTTP; use WS event subscription. |

## Batches

1. Read-only/query routes: document current, layer info/by-id/by-index/current
   preview, selection area/path.
2. Image routes: image export layer, export layer with selected path, preview,
   export document.
3. Side-effect routes: action auto cutout/remove background, layer import image,
   document export/save.

## Completed Changes

- Added module `@api` wrappers in:
  - `packages/generator/src/modules/action/index.ts`
  - `packages/generator/src/modules/document/index.ts`
  - `packages/generator/src/modules/layer/index.ts`
  - `packages/generator/src/modules/image/index.ts`
  - `packages/generator/src/modules/selection/index.ts`
- Added shared HTTP param parsing helpers in
  `packages/generator/src/modules/apiParams.ts`.
- Added HTTP error normalization in `packages/generator/src/server/index.ts`.
- Added route coverage in `packages/generator/test/moduleApi.test.ts`.
- Updated public HTTP API docs in English and Chinese.

## Recorded Validation

These results were recorded when the iteration was implemented:

- `pnpm --filter @ps-generator-bridge/generator typecheck` - passed.
- `pnpm --filter @ps-generator-bridge/generator exec vitest run test/moduleApi.test.ts --coverage=false` - passed.
- `pnpm --filter @ps-generator-bridge/generator test` - passed before and after
  the review fix.
- `pnpm exec prettier --check <iteration files>` - passed.
- `pnpm typecheck` - passed.
- `pnpm -r test` - passed.
- `pnpm test` - failed at the repository-wide `prettier --check .` step before
  tests ran. The formatter check reports 225 existing files outside this
  iteration's scope; this iteration did not format the whole repository to avoid
  unrelated churn.

## Review

`code-review` skill was used in local diff mode.

Finding:

- `POST /image/export-layer` and
  `POST /image/export-layer-with-selected-path` cast HTTP bodies to protocol
  params without validating required `layerSpec`, which could push a bad HTTP
  request into pixmap/JSX execution and produce unclear errors.

Resolution:

- Added route-level `layerSpec` validation in `ImageModule`.
- Added HTTP bad-request coverage for missing `layerSpec`.
- Re-ran focused module API tests, root typecheck, and generator tests.

## Remaining Work

None for this completed iteration.
