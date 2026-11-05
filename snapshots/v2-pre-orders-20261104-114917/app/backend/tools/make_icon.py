"""Draws the Ravisn app icon (a white R on a near-black rounded square) as a multi-size .ico."""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

out = Path(sys.argv[1])
size = 256
img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((8, 8, size - 8, size - 8), radius=56, fill=(29, 29, 31, 255))
font = None
for name in ("seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"):
    try:
        font = ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), 150)
        break
    except OSError:
        continue
font = font or ImageFont.load_default()
box = d.textbbox((0, 0), "R", font=font)
w, h = box[2] - box[0], box[3] - box[1]
d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1] - 4), "R", font=font, fill=(255, 255, 255, 255))
img.save(out, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(out)
