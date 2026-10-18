# Don't Blink

A webcam horror game that runs entirely in the browser. It only moves when your eyes are closed.

Before you play, a perfectly normal "verify you're human" check slowly stops being normal.

## How it plays

1. **The check.** A boring CAPTCHA asks for traffic lights. Then faces, and one of the faces is a snapshot of you. Then the grid becomes your live webcam, it tells you you got it wrong, and asks you to select all squares with *two people*. Finally: "Are you alone right now?"
2. **Calibration.** The game learns what your eyes look like open, so blink detection works for everyone.
3. **The hallway.** A tall figure stands at the far end. Every time you blink, the lights cut out and it lurches closer. Looking away or keeping your eyes shut does not save you.
4. **The relief.** When it gets close enough, it vanishes. Silence.
5. **Behind you.** It fades in behind you on the security camera view in the corner, composited *behind* your body using person segmentation. The next blink, or the moment you turn around to check and turn back, it gets you.

## Leaderboard

Before each round the player types a name. After the scare, the end screen shows a leaderboard of everyone who played in this browser tab, ranked by time with the longest survival at the top. Each name gets one row that keeps that player's best time. **Try again** skips the name prompt and updates the same row, and **Next player** runs the whole experience again for someone new. Scores live only in memory: closing or refreshing the tab clears them, and nothing is saved anywhere.

## Run it

It has to be served over `localhost` (or HTTPS) because it uses ES modules and the webcam.

```bash
cd dont-blink
python3 -m http.server 8000
# open http://localhost:8000 in Chrome or Edge
```

Any static server works (`npx serve`, VS Code Live Server, etc). No build step, no dependencies to install.

### Offline mode (do this before you demo)

By default MediaPipe and the models load from a CDN. Venue Wi-Fi is not your friend, so download them once:

```bash
./scripts/download-assets.sh
```

This fills `./vendor/` and the game uses it automatically.

## Demo tips

- **Headphones on the player.** Most of the scare is the sound. The silence before it matters as much as the scream.
- Sit facing the screen with your face lit. A dim room is spookier but the camera still needs to see your eyes.
- Let the judge play. Do not warn them about the CAPTCHA.
- The intro screen has a content warning. Keep it. It is the right thing to do and it does not ruin the scare.

## Debug and tuning

| URL | What it does |
| --- | --- |
| `?debug` | Shows live blink score, threshold, phase and FPS. Keys: **B** blink, **V** vanish, **H** behind, **S** scare |
| `?skip=captcha` | Jumps straight to the game |
| `?debug&skip=captcha` | Both, for fast iteration |
| `?preview` | Simulated webcam feed and click-to-blink, no camera needed |

Every gameplay number lives in [`src/config.js`](src/config.js): blink sensitivity, how far it moves per blink, how long the silence lasts, scare timing, volume.

If blinks are not registering, open `?debug` and watch the `blink` line. Your eyes-open score should sit well below `thr`, and a blink should jump above it. Lower `thresholdAboveBaseline` if blinks are missed, raise it if it triggers on its own.

If face tracking cannot load at all, the game falls back to manual mode where a click or **B** is a blink. If the camera itself will not start, the intro shows a **Play without a camera** button that swaps in a simulated webcam feed, so a demo never fully breaks.

## How it works

- **Blink detection:** [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) outputs 52 face blendshapes per frame. The game averages `eyeBlinkLeft` and `eyeBlinkRight`, calibrates a per player baseline, and uses a threshold with hysteresis to turn that into clean "eyes closed" and "eyes opened" events.
- **Behind you:** [MediaPipe Image Segmenter](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter) (multiclass selfie model) gives a person mask. The mirror view draws your webcam, then the figure, then only your pixels on top, so the figure really is standing behind you.
- **Art:** the hallway is drawn procedurally on a canvas. The stalker (three Slender Man poses, swapped each time it moves), the game's scare face and the CAPTCHA's Freddy Fazbear jump scare are images in `assets/`. If an image fails to load, the game falls back to the procedurally drawn figure and face in `src/monster.js`.
- **Image rights:** Freddy Fazbear is from Five Nights at Freddy's, the Drake pictures are photos of a real person, the sponsor and event logos belong to their companies, and the Slender Man and scare face images came from the web. That is fine for a hackathon demo, but before this repo goes public for Hacktoberfest, swap them for original or properly licensed art, or remove them and let the drawn fallbacks take over.
- **Sound:** every sound (drone, heartbeat, creaks, whisper, scream) is synthesized live with the Web Audio API. No audio files.
- **Privacy:** webcam frames never leave the browser. Nothing is recorded or uploaded.

## Project structure

```
index.html             screens: warning, CAPTCHA, game canvas, end
style.css              all styles (dark horror screens + the deliberately mundane CAPTCHA)
src/main.js            flow: warning -> CAPTCHA -> game -> end
src/captcha.js         the fake human check and its four rounds
src/game.js            game phases, hallway rendering, mirror cam, HUD
src/vision.js          MediaPipe loading, blink detector, person mask
src/monster.js         procedural figure and jump scare face
src/audio.js           synthesized sound engine
src/camera.js          webcam helpers
src/fakecam.js         simulated webcam for the preview and no-camera demo mode
src/config.js          every tunable number
src/assets.js          preloads the images in assets/
assets/                event and sponsor logos, Drake pictures, Slender Man poses, scare face, upside down face for the two people round, Freddy jump scare
scripts/download-assets.sh   offline copies of MediaPipe and models
```

## Contributing

This project is part of Hacktoberfest. See [CONTRIBUTING.md](CONTRIBUTING.md) for good first issues like adding a new monster, a new CAPTCHA round, or new sounds.

## Safety

The game contains a sudden loud noise and a frightening image. It avoids strobing: there is a single flash at the moment of the scare and the CAPTCHA glitch uses motion and color shifts, not bright and dark flicker. Respect `prefers-reduced-motion` if you add new effects.

## License

[MIT](LICENSE)
