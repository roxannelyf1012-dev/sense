# SENSE — Interactive Thermal Scanning

A single-scene rattlesnake particle artwork using the supplied serpent-head and scale images. Move the pointer to scan the artwork: the image beneath the lens shifts through a thermal palette and fades back when the pointer leaves.

## Run locally

Serve this folder over HTTP:

```sh
python -m http.server 8000
```

Open <http://localhost:8000> in a WebGL-capable browser.

## Publish

GitHub Actions deploys the site to GitHub Pages whenever a commit is pushed to `main`. The workflow is in `.github/workflows/deploy.yml`.

## Artwork assets

- `assets/serpent-particle-reference.png`
- `assets/scale-particle-reference.png`
- `assets/mouse-thermal-reference.png`
