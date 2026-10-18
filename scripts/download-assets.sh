#!/usr/bin/env bash
# Downloads MediaPipe and both models into ./vendor so the game runs without internet.
# Hackathon Wi-Fi is unreliable. Run this once before you demo.
#
# Needs: node/npm, curl, tar
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION="1.1.1"
MODELS="https://storage.googleapis.com/mediapipe-models"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Fetching @mediapipe/tasks-vision@${VERSION}..."
(cd "$tmp" && npm pack "@mediapipe/tasks-vision@${VERSION}" --silent >/dev/null && tar xzf ./*.tgz)

rm -rf vendor/tasks-vision
mkdir -p vendor/tasks-vision vendor/models
cp "$tmp/package/vision_bundle.mjs" vendor/tasks-vision/
cp -r "$tmp/package/wasm" vendor/tasks-vision/

echo "Fetching face landmarker model..."
curl -fL --progress-bar -o vendor/models/face_landmarker.task \
  "${MODELS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

echo "Fetching selfie segmentation model..."
curl -fL --progress-bar -o vendor/models/selfie_multiclass_256x256.tflite \
  "${MODELS}/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"

echo "Done. The game will pick up ./vendor automatically."
