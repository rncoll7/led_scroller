#!/bin/sh
# Regenerates the PWA icons in public/ from the SVG sources in assets/. Needs rsvg-convert (librsvg).
set -e
cd "$(dirname "$0")/.."

command -v rsvg-convert >/dev/null || { echo "rsvg-convert não encontrado: instale o pacote librsvg" >&2; exit 1; }

mkdir -p public
rsvg-convert -w 192 -h 192 assets/icon.svg -o public/pwa-192x192.png
rsvg-convert -w 512 -h 512 assets/icon.svg -o public/pwa-512x512.png
rsvg-convert -w 512 -h 512 assets/icon-maskable.svg -o public/maskable-icon-512x512.png
rsvg-convert -w 180 -h 180 assets/icon-maskable.svg -o public/apple-touch-icon.png
cp assets/icon.svg public/favicon.svg
echo "Ícones gerados em public/"
