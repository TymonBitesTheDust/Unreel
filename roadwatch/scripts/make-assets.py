#!/usr/bin/env python3
"""Draws RoadWatch's icons and synthesises its alert sound.

    python3 scripts/make-assets.py      (needs Pillow: pip install pillow)

Outputs into assets/: icon.png, android-icon-foreground.png, android-icon-monochrome.png,
notification-icon.png and sounds/radar_alert.wav.
"""
import math
import struct
import wave
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
BRAND = (15, 118, 110, 255)
BRAND_DARK = (9, 78, 73, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
SS = 4  # supersampling for smooth edges


def shield_points(cx, cy, size):
    """A shield outline, `size` tall, centred on (cx, cy)."""
    w = size * 0.78
    top = cy - size / 2
    left, right = cx - w / 2, cx + w / 2
    shoulder = top + size * 0.10
    side_end = top + size * 0.52
    bottom = cy + size / 2
    pts = []
    # Top edge dips slightly in the middle.
    for i in range(21):
        t = i / 20
        x = left + (right - left) * t
        y = top + size * 0.05 * math.sin(math.pi * t) * 0.6
        pts.append((x, y if 0 < i < 20 else shoulder))
    pts.append((right, side_end))
    # Curved sides meeting at the bottom point (quadratic Béziers).
    for side in (1, -1):
        sx = right if side == 1 else cx
        for i in range(1, 31):
            t = i / 30
            if side == 1:
                p0, p1, p2 = (right, side_end), (right, bottom - size * 0.12), (cx, bottom)
            else:
                p0, p1, p2 = (cx, bottom), (left, bottom - size * 0.12), (left, side_end)
            x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t**2 * p2[0]
            y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t**2 * p2[1]
            pts.append((x, y))
        del sx
    return pts


def glyph(draw, cx, cy, size, fg, cutout):
    """White shield with radar waves cut into it."""
    draw.polygon(shield_points(cx, cy, size), fill=fg)
    rcx, rcy = cx, cy + size * 0.14
    width = max(1, int(size * 0.065))
    for r in (size * 0.16, size * 0.30):
        box = [rcx - r, rcy - r, rcx + r, rcy + r]
        draw.arc(box, start=222, end=318, fill=cutout, width=width)
    d = size * 0.07
    draw.ellipse([rcx - d, rcy - d, rcx + d, rcy + d], fill=cutout)


def render(px, background, glyph_scale, fg=WHITE, cutout=None):
    big = px * SS
    img = Image.new("RGBA", (big, big), background)
    draw = ImageDraw.Draw(img)
    glyph(draw, big / 2, big / 2, big * glyph_scale, fg, cutout if cutout is not None else background)
    return img.resize((px, px), Image.LANCZOS)


def gradient_icon(px):
    big = px * SS
    img = Image.new("RGBA", (big, big))
    draw = ImageDraw.Draw(img)
    for y in range(big):
        t = y / big
        col = tuple(int(BRAND[i] * (1 - t) + BRAND_DARK[i] * t) for i in range(3)) + (255,)
        draw.line([(0, y), (big, y)], fill=col)
    glyph(draw, big / 2, big / 2, big * 0.56, WHITE, BRAND)
    return img.resize((px, px), Image.LANCZOS)


def make_images():
    ASSETS.mkdir(exist_ok=True)
    gradient_icon(1024).save(ASSETS / "icon.png")
    # Android adaptive icons: keep the glyph inside the central safe zone.
    render(1024, CLEAR, 0.42, WHITE, BRAND).save(ASSETS / "android-icon-foreground.png")
    render(1024, CLEAR, 0.42, WHITE, CLEAR).save(ASSETS / "android-icon-monochrome.png")
    # Notification icons must be white on transparent.
    render(96, CLEAR, 0.86, WHITE, CLEAR).save(ASSETS / "notification-icon.png")


def make_sound():
    """Three rising beeps (≈0.65 s): distinct from phone notification tones, clear over road noise."""
    rate = 44100
    notes = [(880.0, 0.11), (None, 0.05), (1174.7, 0.11), (None, 0.05), (1568.0, 0.24)]
    samples = []
    for freq, dur in notes:
        n = int(rate * dur)
        for i in range(n):
            if freq is None:
                samples.append(0.0)
                continue
            t = i / rate
            # Fast attack, smooth release, to avoid clicks.
            env = min(1.0, i / (rate * 0.005)) * min(1.0, (n - i) / (rate * 0.03))
            tone = math.sin(2 * math.pi * freq * t) + 0.25 * math.sin(2 * math.pi * freq * 2 * t)
            samples.append(0.72 * env * tone / 1.25)
    out = ASSETS / "sounds"
    out.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out / "radar_alert.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples))


if __name__ == "__main__":
    make_images()
    make_sound()
    print("Wrote assets to", ASSETS)
