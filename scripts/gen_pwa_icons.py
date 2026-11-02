#!/usr/bin/env python3
"""Generate simple DeusGolf home-screen icons (stdlib only).

Run from the repo root:
    python3 scripts/gen_pwa_icons.py
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "icons"
BG = (31, 77, 43, 255)  # #1f4d2b
FAIRWAY = (127, 179, 90, 255)
GREEN = (196, 239, 149, 255)
BUNKER = (236, 220, 164, 255)
FLAG = (210, 40, 40, 255)
WHITE = (255, 255, 255, 255)
POLE = (244, 247, 242, 255)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def in_tri(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    d1, d2, d3 = sign((px, py), a, b), sign((px, py), b, c), sign((px, py), c, a)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def design(u, v):
    """Icon artwork in unit coordinates, y down."""
    def dist(x, y):
        return math.hypot(u - x, v - y)

    col = BG
    d = dist(0.50, 0.54)
    if d < 0.40:
        col = FAIRWAY if d < 0.385 else mix(BG, FAIRWAY, (0.40 - d) / 0.015)
    gd = dist(0.50, 0.46)
    if gd < 0.155:
        col = GREEN if gd < 0.145 else mix(col, GREEN, (0.155 - gd) / 0.01)
    if dist(0.33, 0.60) < 0.048:
        col = BUNKER
    if dist(0.64, 0.73) < 0.055:
        col = (20, 70, 36, 255)
    bd = dist(0.62, 0.705)
    if bd < 0.052:
        col = WHITE if bd < 0.046 else mix(col, WHITE, (0.052 - bd) / 0.006)
        if bd < 0.02 and u < 0.61 and v < 0.70:
            col = (255, 255, 255, 255)
    if abs(u - 0.47) < 0.014 and 0.24 <= v <= 0.66:
        col = POLE
    if in_tri(u, v, (0.484, 0.25), (0.73, 0.335), (0.484, 0.42)):
        col = FLAG
    if dist(0.47, 0.66) < 0.02:
        col = (18, 48, 26, 255)
    return col


def sample(u, v, motif):
    if motif != 1:
        u = 0.5 + (u - 0.5) / motif
        v = 0.5 + (v - 0.5) / motif
        if u < -0.05 or v < -0.05 or u > 1.05 or v > 1.05:
            return BG
    return design(u, v)


def render(size, motif):
    pixels = bytearray(size * size * 4)
    n = 3 if size >= 128 else 2
    for y in range(size):
        for x in range(size):
            acc = [0, 0, 0, 0]
            for j in range(n):
                for i in range(n):
                    u = (x + (i + 0.5) / n) / size
                    v = (y + (j + 0.5) / n) / size
                    c = sample(u, v, motif)
                    for k in range(4):
                        acc[k] += c[k]
            o = (y * size + x) * 4
            div = n * n
            for k in range(4):
                pixels[o + k] = acc[k] // div
    return bytes(pixels)


def write_png(path, size, rgba):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + rgba[y * size * 4:(y + 1) * size * 4] for y in range(size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = {
        "favicon-32.png": (32, 1),
        "apple-touch-icon.png": (180, 1),
        "icon-192.png": (192, 1),
        "icon-512.png": (512, 1),
        "icon-maskable-192.png": (192, 0.78),
        "icon-maskable-512.png": (512, 0.78),
    }
    for name, (size, motif) in jobs.items():
        write_png(OUT / name, size, render(size, motif))
        print(name, size)


if __name__ == "__main__":
    main()
