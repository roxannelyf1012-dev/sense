# SENSE — Interactive Thermal Scanning

A single-scene rattlesnake particle artwork using the supplied serpent-head and scale images. Move the pointer to scan the artwork: the image beneath the lens shifts through a black, dark-red, red, orange, yellow and white thermal palette, then fades back to its original colours when the pointer leaves.

## Run locally

Serve this folder over HTTP:

```sh
python -m http.server 8000
```

Open <http://localhost:8000> in a WebGL-capable browser.

## Artwork assets

- `assets/serpent-particle-reference.png`
- `assets/scale-particle-reference.png`
