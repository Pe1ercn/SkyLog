"""Generate the SkyLog app icon (PNG + ICO) with Pillow."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)

# Diagonal sky gradient.
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
pixels = img.load()
start = (47, 109, 246)
end = (125, 211, 252)
for y in range(SIZE):
    for x in range(SIZE):
        t = max(0.0, min(1.0, (x * 0.55 + y * 0.75) / (SIZE * 1.3)))
        r = int(start[0] + (end[0] - start[0]) * t)
        g = int(start[1] + (end[1] - start[1]) * t)
        b = int(start[2] + (end[2] - start[2]) * t)
        pixels[x, y] = (r, g, b, 255)

# Rounded-square mask.
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=230, fill=255)
img.putalpha(mask)

# Soft top-left light.
shine = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sd = ImageDraw.Draw(shine)
sd.ellipse((-220, -320, 760, 520), fill=(255, 255, 255, 54))
shine = shine.filter(ImageFilter.GaussianBlur(80))
img = Image.alpha_composite(img, shine)

draw = ImageDraw.Draw(img, "RGBA")

# Great-circle route: a smooth quadratic arc from bottom-left to top-right.
route_points = []
for i in range(201):
    t = i / 200
    x = 180 + (820 - 180) * t
    y = 780 - (780 - 300) * t - 195 * math.sin(math.pi * t)
    route_points.append((x, y))

route_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
route_draw = ImageDraw.Draw(route_layer)
route_draw.line(route_points, fill=(255, 255, 255, 255), width=26)
for x, y in route_points:
    route_draw.ellipse((x - 13, y - 13, x + 13, y + 13), fill=(255, 255, 255, 255))
glow = route_layer.filter(ImageFilter.GaussianBlur(20))
glow_alpha = glow.getchannel("A").point(lambda value: int(value * 0.5))
glow.putalpha(glow_alpha)
img = Image.alpha_composite(img, glow)
img = Image.alpha_composite(img, route_layer)
draw = ImageDraw.Draw(img, "RGBA")

# Waypoint dots along the arc.
for i in (18, 55, 92, 129, 166):
    x, y = route_points[i]
    r = 17
    draw.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, 255))
    draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(47, 109, 246, 255))

# Paper-plane silhouette near the upper-right end, rotated 23 degrees.
plane = [
    (-104, 0),
    (86, -74),
    (30, 4),
    (86, 74),
]
angle = math.radians(-23)
cx, cy = 792, 250
rotated = []
for px, py in plane:
    rx = px * math.cos(angle) - py * math.sin(angle)
    ry = px * math.sin(angle) + py * math.cos(angle)
    rotated.append((cx + rx, cy + ry))
shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sd2 = ImageDraw.Draw(shadow)
sd2.polygon([(x + 6, y + 14) for x, y in rotated], fill=(15, 35, 95, 60))
shadow = shadow.filter(ImageFilter.GaussianBlur(18))
img = Image.alpha_composite(img, shadow)
draw = ImageDraw.Draw(img, "RGBA")
draw.polygon(rotated, fill=(255, 255, 255, 250))
# Fold line.
draw.line([rotated[2], (cx - 2, cy + 12)], fill=(47, 109, 246, 110), width=7)

# Tiny accent sparkle.
for x, y, r in ((248, 300, 9), (306, 250, 5), (900, 744, 7)):
    draw.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, 190))

img.save(BUILD / "icon.png", "PNG")
img.save(
    BUILD / "icon.ico",
    sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
)
print("wrote", BUILD / "icon.png", BUILD / "icon.ico")
