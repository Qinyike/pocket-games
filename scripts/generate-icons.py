#!/usr/bin/env python3
"""生成 PWA 图标（开发期一次性脚本，需要 Pillow）。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)
S = 1024
COLORS = ['#ffb454', '#62e6ff', '#a78bfa', '#ff8e6e']


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def hex_rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def gradient(size, top, bottom):
    img = Image.new('RGBA', (1, size))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        draw.point((0, y), fill=lerp(top, bottom, y / max(1, size - 1)))
    return img.resize((size, size))


def rounded_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def make_icon(maskable=False, apple=False):
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bg = gradient(S, (18, 29, 54), (6, 11, 23))
    if maskable or apple:
        base.alpha_composite(bg)
    else:
        mask = rounded_mask(S, 220)
        base.paste(bg, (0, 0), mask)

    draw = ImageDraw.Draw(base)
    if not maskable:
        draw.rounded_rectangle((28, 28, S - 28, S - 28), radius=200, outline=(255, 255, 255, 26), width=3)

    # 中央 2x2 品牌方块
    gap = 46
    tile = 236 if not maskable else 190
    total = tile * 2 + gap
    left = (S - total) // 2
    top = (S - total) // 2
    if maskable:
        # 安全区内缩，避免被系统圆形/方形裁切。
        tile = 180
        gap = 40
        total = tile * 2 + gap
        left = (S - total) // 2
        top = (S - total) // 2

    # 柔和投影
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for i, color in enumerate(COLORS):
        x = left + (i % 2) * (tile + gap)
        y = top + (i // 2) * (tile + gap)
        sd.rounded_rectangle((x, y + 16, x + tile, y + tile + 16), radius=54, fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(34))
    base.alpha_composite(shadow)

    for i, color in enumerate(COLORS):
        x = left + (i % 2) * (tile + gap)
        y = top + (i // 2) * (tile + gap)
        c = hex_rgb(color)
        tile_img = gradient(tile, lerp(c, (255, 255, 255), 0.28), lerp(c, (0, 0, 0), 0.16))
        tile_mask = Image.new('L', (tile, tile), 0)
        ImageDraw.Draw(tile_mask).rounded_rectangle((0, 0, tile - 1, tile - 1), radius=54, fill=255)
        base.paste(tile_img, (x, y), tile_mask)
        d = ImageDraw.Draw(base)
        d.rounded_rectangle((x + 2, y + 2, x + tile - 2, y + tile - 2), radius=52, outline=(255, 255, 255, 70), width=2)
        d.rounded_rectangle((x + 14, y + 12, x + tile - 14, y + 38), radius=14, fill=(255, 255, 255, 42))

    if not maskable and not apple:
        base = base.crop((0, 0, S, S))
    return base


def main():
    icon = make_icon()
    icon.resize((512, 512), Image.LANCZOS).save(OUT / 'icon-512.png')
    icon.resize((192, 192), Image.LANCZOS).save(OUT / 'icon-192.png')
    icon.resize((32, 32), Image.LANCZOS).save(OUT / 'favicon-32.png')

    apple = make_icon(apple=True)
    apple.resize((180, 180), Image.LANCZOS).save(OUT / 'apple-touch-icon.png')

    maskable = make_icon(maskable=True)
    maskable.resize((512, 512), Image.LANCZOS).save(OUT / 'maskable-512.png')

    print('icons written to', OUT)


if __name__ == '__main__':
    main()
