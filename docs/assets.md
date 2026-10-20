# Asset provenance and recording

`assets/manifest.json` tracks source, permission status and SHA-256 of runtime assets. `review-required` means the project has not established redistribution clearance; it does not mean the file is covered by the root MIT license. Source terms and complete dependency notices are linked from [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

The transparent population header, factory fallback illustration and black/white grid were generated with ImageGen during this project. Available original prompts are retained in `docs/licensing/`; historical generation does not provide an exclusive-rights or third-party-clearance guarantee. Runtime geometry in the wind/factory scenes is procedurally authored, with an exported factory GLB.

Preview images and GIFs are recordings of actual pages. Population GIF intentionally shows continuous globe rotation; inspection GIF intentionally shows province hover and tooltip changes. Keep these interactions focused. Do not replace them with mode switching or dialogs. Avoid recording private datasets or browser account details.

To refresh a preview: serve the current build, choose a fixed viewport, wait for textures and shaders, capture a screenshot, and convert it to a real PNG/WebP. Record short interaction frames at a consistent rate and encode a looping GIF with a generated palette. Do not merely rename JPEG bytes to `.png`. Keep raw frames under ignored `.local/`, and commit only the final optimized asset. Update the relevant `assets/manifest.json` checksum when runtime preview images change.
