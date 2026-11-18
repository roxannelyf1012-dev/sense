# SENSE — Experience the world through a rattlesnake

A single-screen, full-viewport particle experience. The opening particles transform from a recognizable rattlesnake head into overlapping scale rows, a vertical-pupil eye and loreal pit, then flow into four interactive sensory states. No raster animal artwork is used in the live experience; every form is assembled from animated particles.

## Run locally

Serve the project over localhost (camera access requires localhost or HTTPS):

```sh
python -m http.server 8000
```

Open <http://localhost:8000>.

## Interaction

- Select **INFRARED**, **CHEMICAL**, **VIBRATION**, or **SPATIAL** to morph the same particle field. Use keys `1` through `4` as an alternative.
- Move the pointer to reveal the warm-blooded prey signature, bend the forked chemical trails, send vibration ripples, or explore environmental depth.
- Open **FIELD NOTE** for one short explanation of the current sensory state.
- Select **HAND TRACKING** to request camera access. The camera is only opened after a click and browser permission. Gestures switch sensory modes and move the field pointer; processing stays in the browser.

The palette is limited to white, red, and blue. Shapes and colors are an interpretive visualization of biological sensing, not a literal image of a snake's visual experience. Infrared detection occurs in specialized pit organs; chemical samples are collected by the forked tongue; ground-borne vibration contributes mechanical cues; spatial awareness integrates multiple environmental signals.

## Publish

Static site; publish the project root with GitHub Pages, Vercel, or another static host. Camera access requires HTTPS on a published site.
