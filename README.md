# 🎃 Don't Blink

A webcam horror game for Hacktoberfest x Hack the 6ix. It only moves when your eyes are closed. Good luck with that.

## What happens 👻

First you prove you're human. Easy, right? Traffic lights, sponsors, a few faces... and then the CAPTCHA starts looking back at you. 👀

Then the real game starts. A tall figure waits at the end of a dark hallway, and every time you blink, it gets closer. Looking away won't save you either. Survive as long as you can to climb the leaderboard (if you can still read it).

It runs entirely in your browser. Your webcam footage never leaves your laptop.

## Summon it 🕯️

```bash
cd dont-blink
python3 -m http.server 8000
```

Open **http://localhost:8000** in Chrome. It has to be `localhost`, not `[::]` or a double-clicked file, or the webcam stays asleep.

**Wi-Fi spooky?** Run this once so the face tracking works offline:

```bash
bash scripts/download-assets.sh
```

## Demo tips 🦇

- Put headphones on the victim. Most of the scare is sound.
- Sit them close to the screen, facing a light.
- Don't warn them about the CAPTCHA.
- If the camera won't cooperate, hit **Play without a camera**.
- The leaderboard lasts until the tab is closed or refreshed, so don't refresh mid-event.

## For the mad scientists 🧪

- `?debug` shows the blink meter. Press **B** to blink, **V** to vanish, **S** to scare.
- `?skip=captcha` jumps straight to the hallway.
- `?preview` uses a fake webcam so you can test without one.
- Every scary number lives in `src/config.js`.

Built with MediaPipe for blink and body tracking, plain canvas for the hallway, and Web Audio for the creaks and heartbeats. No frameworks, no build step.

## Want to make it scarier? 🕸️

Pull requests welcome. New monsters, new CAPTCHA rounds, new sounds. See [CONTRIBUTING.md](CONTRIBUTING.md).

## The fine print 📜

The final scream is "Screamer Jumpscare" by freesound_community (via Pixabay). Freddy Fazbear belongs to Five Nights at Freddy's, the Drake photos are of a real person, the sponsor and event logos belong to their companies, and the other scary images came from free sources.

Code is [MIT](LICENSE). Don't blink. 💀
