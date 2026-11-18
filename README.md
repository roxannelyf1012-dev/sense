# Sensory / Serpent

A single-screen interactive field guide to rattlesnake perception. Heat, chemical traces, and ground-borne vibration remain together in one Canvas particle simulation; gestures reveal and perturb each signal in the shared environment.

## Run locally

Open `index.html` in a modern browser, or serve this folder with a static server:

```sh
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Gestures

- Move through the field to disturb nearby particles.
- Drag the small amber source to move the thermal cue.
- Press and hold in the field to trigger a forked tongue sampling gesture.
- Tap or click to send a ground vibration pulse. Set its strength in the side panel.
- Use the pause control or the operating-system reduced-motion preference to reduce animation.

The visualization is an artistic interpretation, not a literal view through a snake's eyes. The forked tongue is described as a chemical sampling structure; the exact mechanisms of trail following remain an active research question.

## Research references

- Gracheva et al. (2010), [Molecular basis of infrared detection by snakes](https://www.nature.com/articles/nature08943), *Nature*.
- Parker, Young & Kardong (2008), [The forked tongue and edge detection in snakes](https://pubmed.ncbi.nlm.nih.gov/18298279/), *Journal of Comparative Psychology*.
- Friedel, Young & van Hemmen (2008), [Auditory localization of ground-borne vibrations in snakes](https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.100.048701), *Physical Review Letters*.
- Zdenek et al. (2023), [How snakes respond to airborne and groundborne sounds](https://pmc.ncbi.nlm.nih.gov/articles/PMC9928108/).

## Deploy

This is a static site with no build step. Publish the repository root with GitHub Pages or import it into Vercel as a static project.
