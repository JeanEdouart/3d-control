# Gesture Particles

Interactive 3D particle sculptures built with Three.js and webcam hand tracking.

## Features

- Real-time 3D particle system
- Template switching:
  - Heart bloom
  - Flower burst
  - Saturn rings
  - Buddha statue
  - Fireworks
  - Nebula
- Color picker for particle tint
- Live camera preview with hand landmarks overlay
- Separate gesture roles for left and right hands

## Controls

- Right hand: open/close to zoom the particle form
- Left hand: pinch thumb and index, then move to rotate
- Use `Calibrate base` to reset the neutral zoom reference
- Click a template button to morph the sculpture shape
- Use the color picker to change the particle color

## Run

1. Start a local server in the `gesture-particles` folder.
2. Open the page in a modern browser.
3. Click `Enable camera`.
4. Allow camera permission when prompted.

Example:

```bash
npx http-server
```

## Notes

- The app uses MediaPipe Hands from a CDN for hand tracking.
- Best results come from a well-lit environment with both hands visible.
- If the handedness feels inverted, use the on-screen `Assign` indicator and recalibrate the base.

