# Sensory / Serpent

A single-screen cinematic interpretation of rattlesnake thermal sensing. The opening moves from the supplied close-up scale and eye references into a dark red-and-white heat view, where a warm animal and flowing infrared cues respond to pointer or hand movement.

## Run locally

Serve this folder from `localhost` or deploy it over HTTPS. Camera access is unavailable to pages opened directly as `file://`.

```sh
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Interactions

- The scene transitions from scales to the loreal pit and then to a thermal interpretation. Select **ENTER THERMAL VIEW** to skip ahead or use the replay control to start over.
- Move the pointer or touch the scene to follow the warm animal and heat trail.
- Expand **FIELD NOTE** for a short explanation of infrared sensing.
- Choose **OPEN CAMERA** to request camera permission. Open palm and pinch gestures move the heat target. The browser processes camera frames locally. Camera access requires HTTPS or localhost and an explicit browser permission.
- If camera permission cannot be obtained, the status card reports the browser error. If only the hand tracker fails to load, the live camera preview remains available and can retry the tracker.

The red and white thermal image is an artistic visualization; rattlesnakes detect infrared radiation with pit organs and do not see this human-style thermal palette.

## Deploy

This is a static site with no build step. Publish the project root with GitHub Pages or a static hosting provider such as Vercel.
