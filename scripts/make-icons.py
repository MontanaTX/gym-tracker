#!/usr/bin/env python3
"""Generate app icons without PIL: solid background + simple barbell."""
import os, struct, zlib

BG, PLATE, BAR = (13, 17, 23), (63, 185, 80), (240, 246, 252)

def make(size, path):
    px = [[BG] * size for _ in range(size)]
    def rect(x0, y0, x1, y1, c):
        for y in range(max(0, int(y0)), min(size, int(y1))):
            for x in range(max(0, int(x0)), min(size, int(x1))):
                px[y][x] = c
    cy = size / 2
    rect(size * .12, cy - size * .03, size * .88, cy + size * .03, BAR)  # bar
    for cx, h in ((.24, .46), (.35, .34)):                              # plates, both sides
        for side in (cx, 1 - cx):
            rect(size * side - size * .045, cy - size * h / 2,
                 size * side + size * .045, cy + size * h / 2, PLATE)
    raw = b''.join(b'\x00' + b''.join(bytes(px[y][x]) for x in range(size)) for y in range(size))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(path, os.path.getsize(path), 'bytes')

os.makedirs('icons', exist_ok=True)
make(180, 'icons/icon-180.png')
make(512, 'icons/icon-512.png')
