# ExtendScript ambient type declarations

Ambient (`declare`) type declarations for the Photoshop ExtendScript runtime DOM
— the global `app`, `File`/`Folder`, `Document`, `Layer`, `RGBColor`, the enum
constants, and so on. Sourced from the Photoshop scripting reference
(https://theiviaxx.github.io/photoshop-docs/).

## Status: reference only — not compiled

These declarations are **not wired into any `tsconfig`**. The packaged `.jsx`
files under `jsx/` are authored as plain ExtendScript and are not type-checked by
the build (`tsconfig.json` includes only `src`, `test`, and `jsx/polyfills`).

They are kept here as:

- a reference while hand-writing `.jsx` files, and
- ready material for a future opt-in JSX type-checking pass (a separate
  `tsconfig` with `allowJs`/`checkJs` over `jsx/**/*.jsx` that loads these
  globals).

Because every file uses `declare` (global) declarations, they must **not** be
added to a `tsconfig` that compiles consumer-facing code — doing so would inject
`app`, `File`, `RGBColor`, etc. into that project's global scope. To use them
manually, reference the barrel from a single jsx-authoring `tsconfig`:

```jsonc
// e.g. a dedicated jsx/tsconfig.json (not created yet)
{
  "compilerOptions": { "allowJs": true, "checkJs": true, "noEmit": true },
  "include": ["**/*.jsx", "types/extendscript/index.d.ts"],
}
```

`index.d.ts` is the triple-slash aggregator that pulls in every sibling `.d.ts`.
