# Asset provenance and regeneration

`assets/manifest.json` tracks runtime asset paths, SHA-256, permission status and source identifiers. `config/asset-sources.json` records the download URLs, checksums, providers and permission evidence for the Natural Earth archives and Solar System Scope images.

## Current map and texture permissions

All files under `assets/geo/`, the population globe's textures and the relief map derive from public-domain Natural Earth data. The population globe's city lights are an illustration derived from populated places. The factory grid is original procedural material under MIT. Orbital Relay uses three 2K equirectangular JPEGs by Solar System Scope for its day, night and cloud layers. Both the page and its exports credit the publisher and describe the adaptations. [Original textures](https://www.solarsystemscope.com/textures/) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Natural Earth geometries follow the upstream dataset's generalized boundaries. Admin-1 regions for Taiwan, Hong Kong and Macao are dissolved into the existing demo groups; other names are mapped to stable display identifiers. A shared-edge simplification at 0.018° keeps adjacent borders aligned. The outline is dissolved from the same polygons. The relief retains the existing Mercator extent and design dimensions so material placement, glow, side depth and hover coordinates remain aligned.

## Reproduce from verified archives

Optional requirements: **Python 3.12+**, curl and the normal project environment. Rendering/building the committed site still uses only the standard requirements.

```bash
npm run setup
.venv/bin/python -m pip install -r requirements-assets.txt
.venv/bin/python scripts/prepare_assets.py
npm run build
```

On Windows use `.venv\Scripts\python.exe`. The generator stores downloads in ignored `.local/asset-sources/` and verifies every SHA-256 before processing. An offline repeat uses `--offline --cache /path/to/verified/archives`. Cached filenames use the source identifier with the original `.zip` or `.jpg` extension.

The generator rebuilds the 34-region GeoJSON, merged outline and world background, colour-adjusts the day texture, calculates a normal/detail field, renders illustrative city emission, reprojects relief with bilinear sampling, and generates a periodic factory grid. Upstream versions differ between themes. In particular the relief archive identifies itself as 2.0.0 despite its download page's 3.2.0 label; the archive checksum is authoritative.

The generator updates the checksums of the files it owns. For a separately captured preview, compute its new hash with `python -c "import hashlib,pathlib; print(hashlib.sha256(pathlib.Path('assets/previews/population.webp').read_bytes()).hexdigest())"` and update only that inventory row after reviewing its source.

After an intentional change, update inventory checksums, validate permissions and inspect both map screens, factory day/night, Home and offline exports. `npm test` checks paths, source permissions, checksums, province coverage and the absence of retired asset bytes. Do not silently update a source checksum merely to make a download succeed; review the new provider/version first.

## Other art and previews

The transparent population header and factory fallback illustration remain existing ImageGen-generated project art. They are separate from the cleared geographic sources and the code MIT grant. See [third-party notices](../THIRD_PARTY_NOTICES.md). The old generated grid has been replaced with reproducible original geometry in a texture.

Preview images and GIFs are recordings of actual pages. Population GIF intentionally shows continuous globe rotation; inspection GIF intentionally shows province hover and tooltip changes. Keep these focused, without mode switching or dialogs. Raw frames belong under ignored `.local/`; commit final optimized assets. Ensure all textures have loaded before recording. Capture real PNG/WebP bytes rather than renaming JPEG files.
