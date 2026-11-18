# Sensory / Serpent

An immersive, full-screen particle experience about rattlesnake sensory perception. The site is built with HTML, CSS, and a real-time Canvas 2D particle simulation. It has no build step or third-party runtime dependencies.

## Run locally

Open `index.html` in a modern browser, or serve this folder with any static file server:

```sh
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Explore

- Use the top navigation or Continue control to move between the introduction and four sensory systems.
- In Thermal, drag the small amber heat source through the field.
- In Chemical, trigger the forked tongue sampling animation.
- In Vibration, choose an intensity and click or tap the ground to send a wave.
- In Spatial, explore the combined thermal, chemical, and vibration fields.
- Use the motion control to pause the simulation. The system reduced-motion preference is honored by default.
- Open **Did you know?** for six short field observations.

Particle density and pixel ratio are capped responsively to keep the simulation usable on smaller and lower-resolution devices. The visualization is an artistic interpretation; thermal particles do not represent a literal image formed in a snake's vision.

## Deploy

This is a static site. It can be published from the repository root with GitHub Pages (Settings → Pages → Deploy from a branch, select `main` and `/ (root)`), or imported into Vercel as a static project with no build command and `.` as the output directory.
