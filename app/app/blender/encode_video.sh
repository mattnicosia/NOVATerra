#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Encode Blender PNG sequence → WebM video for login background
#
# Usage:
#   ./encode_video.sh                   # Default: production renders
#   ./encode_video.sh /path/to/frames   # Custom frame directory
#
# Outputs:
#   app/public/chamber/chamber_orbit.webm  — VP9 compressed loop
#   app/public/chamber/chamber_poster.jpg  — First frame poster
# ──────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRAME_DIR="${1:-$SCRIPT_DIR/renders/production}"
OUTPUT_DIR="$SCRIPT_DIR/../public/chamber"

echo "NOVACORE Chamber — Video Encoding"
echo "================================="
echo "Frame dir: $FRAME_DIR"
echo "Output dir: $OUTPUT_DIR"

# Check frames exist
FRAME_COUNT=$(ls "$FRAME_DIR"/frame_*.png 2>/dev/null | wc -l | tr -d ' ')
echo "Found $FRAME_COUNT frames"

if [ "$FRAME_COUNT" -lt 10 ]; then
  echo "ERROR: Not enough frames. Wait for render to complete."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
  echo "Installing ffmpeg..."
  brew install ffmpeg
fi

# Encode VP9 WebM — optimized for web delivery
# Two-pass for best quality/size ratio
echo ""
echo "Pass 1/2: Analyzing..."
ffmpeg -y -framerate 30 \
  -i "$FRAME_DIR/frame_%04d.png" \
  -c:v libvpx-vp9 \
  -b:v 2M \
  -pass 1 \
  -an \
  -f null /dev/null 2>&1 | tail -5

echo ""
echo "Pass 2/2: Encoding..."
ffmpeg -y -framerate 30 \
  -i "$FRAME_DIR/frame_%04d.png" \
  -c:v libvpx-vp9 \
  -b:v 2M \
  -pass 2 \
  -an \
  -auto-alt-ref 1 \
  -lag-in-frames 25 \
  -row-mt 1 \
  "$OUTPUT_DIR/chamber_orbit.webm" 2>&1 | tail -5

# Also create an H.264 MP4 fallback for Safari
echo ""
echo "Encoding MP4 fallback..."
ffmpeg -y -framerate 30 \
  -i "$FRAME_DIR/frame_%04d.png" \
  -c:v libx264 \
  -preset slow \
  -crf 23 \
  -pix_fmt yuv420p \
  -an \
  "$OUTPUT_DIR/chamber_orbit.mp4" 2>&1 | tail -5

# Update poster from first frame
echo ""
echo "Creating poster image..."
sips -s format jpeg "$FRAME_DIR/frame_0001.png" \
  --out "$OUTPUT_DIR/chamber_poster.jpg" \
  -s formatOptions 85 2>/dev/null

# Report
echo ""
echo "Encoding complete!"
echo "================================="
ls -lh "$OUTPUT_DIR/chamber_orbit.webm" 2>/dev/null
ls -lh "$OUTPUT_DIR/chamber_orbit.mp4" 2>/dev/null
ls -lh "$OUTPUT_DIR/chamber_poster.jpg" 2>/dev/null
echo ""
echo "Add <source> tags to LoginMockupPage.jsx:"
echo '  <source src="/chamber/chamber_orbit.webm" type="video/webm" />'
echo '  <source src="/chamber/chamber_orbit.mp4" type="video/mp4" />'

# Cleanup pass logs
rm -f ffmpeg2pass-0.log 2>/dev/null
