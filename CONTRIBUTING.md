# Contributing to Don't Blink

Thanks for helping make this scarier. Pull requests of any size are welcome, and this repo participates in Hacktoberfest.

## Getting set up

```bash
git clone <your fork>
cd dont-blink
python3 -m http.server 8000
```

Open `http://localhost:8000/?debug&skip=captcha` while you work. In debug mode you can press **B** to blink, **V** to make it vanish, **H** to bring it behind you and **S** to trigger the scare, so you can test every phase without a webcam.

There is no build step and no framework. Plain ES modules, canvas and Web Audio.

## Good first issues

- **New monster.** Add a draw function to `src/monster.js` (same signature as `drawFigure`) and a way to pick it in `src/config.js`.
- **New scare face.** Another variant of `drawScareFace`, picked at random.
- **New CAPTCHA round.** Add a round to `src/captcha.js`. Ideas: "select all squares where it is looking at you", a slider puzzle where the piece is an eye, a text field that autocompletes the player's thoughts.
- **New sounds.** Add a synthesized sound to `src/audio.js` (door slam, distant footsteps, a music box) and use it in the hallway.
- **Difficulty modes.** Easy / normal / nightmare presets for the values in `src/config.js`.
- **Reaction capture.** Optionally save a webcam still from the moment of the scare and show it on the end screen (only with explicit consent, and never uploaded).
- **Better hallway.** Flickering doors, a second figure that is only visible on the security cam, footprints that appear on the floor.
- **Accessibility.** A setting to lower the scare volume, and honoring `prefers-reduced-motion` for the scare shake.

## Guidelines

- Keep it asset free when you can: draw with canvas, synthesize with Web Audio. If you add an asset, it must be your own work or properly licensed, with credit in the README.
- No strobing effects. Avoid anything that flashes bright and dark more than about three times a second.
- Webcam data stays in the browser. No uploads, no analytics.
- The CAPTCHA uses a made up brand ("HumanCheck"). Do not restyle it to imitate a real verification product.
- Put new tunable numbers in `src/config.js` with a comment.
