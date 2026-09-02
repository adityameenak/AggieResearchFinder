#!/usr/bin/env python3
"""
Generates the site's raster brand assets into ui/public/.

Run once (or after a palette/school change), then commit the output — Vercel
does NOT run this at build time:

    python3 scripts/gen_icons.py

Produces:
  favicon.ico            16/32/48 multi-size, for legacy browsers & bookmarks
  icon-192.png           PWA / Android
  icon-512.png           PWA / Android + schema.org logo
  icon-maskable-512.png  Android adaptive icon (safe-zone padding)
  apple-touch-icon.png   180x180, opaque (iOS ignores alpha)
  og/default.png         1200x630 social card for the platform
  og/<code>.png          1200x630 social card per school, in school colors

The mark is a magnifier whose lens holds a three-node research graph — it stays
legible at 16px because the glass is the dominant shape.
"""
from PIL import Image, ImageDraw, ImageFont
import os

HERE   = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(HERE, os.pardir, 'public')

INDIGO = (79, 70, 229)
INK    = (28, 25, 23)
CREAM  = (253, 252, 249)

SCHOOLS = {
    'tamu':    ('#500000', 'Aggie Research Finder',     'Texas A&M University',  '1,772'),
    'rice':    ('#00205B', 'Rice Research Finder',      'Rice University',       '607'),
    'ut':      ('#BF5700', 'UT Austin Research Finder', 'UT Austin',             '913'),
    'utd':     ('#154734', 'UT Dallas Research Finder', 'UT Dallas',             '542'),
    'mit':     ('#A31F34', 'MIT Research Finder',       'MIT',                   '857'),
    'harvard': ('#A51C30', 'Harvard Research Finder',   'Harvard University',    '147'),
}

FONT_DISPLAY = '/System/Library/Fonts/Supplemental/Georgia Bold.ttf'
FONT_BODY    = '/System/Library/Fonts/Supplemental/Arial.ttf'
FONT_BODY_B  = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def font(path, size):
    return ImageFont.truetype(path, size)


def draw_mark(size, bg, fg, radius_ratio=0.22, pad_ratio=0.0, nodes=True):
    """Rounded-square app icon with the magnifier mark centred in it."""
    S = size * 4  # supersample, downscale at the end
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = int(S * pad_ratio)
    box = (pad, pad, S - pad - 1, S - pad - 1)
    # bg=None leaves the ground transparent (used for the maskable icon, which
    # is composited onto a full-bleed square — any drawn edge would seam there).
    if bg is not None:
        d.rounded_rectangle(box, radius=int((S - 2 * pad) * radius_ratio), fill=bg)

    inner = S - 2 * pad
    cx = pad + inner * 0.435
    cy = pad + inner * 0.415
    r  = inner * 0.235
    w  = max(2, int(inner * 0.085))          # glass stroke

    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=fg, width=w)

    # Handle, drawn at 45deg out of the lower-right of the lens.
    hx0 = cx + r * 0.72
    hy0 = cy + r * 0.72
    hx1 = pad + inner * 0.805
    hy1 = pad + inner * 0.795
    d.line((hx0, hy0, hx1, hy1), fill=fg, width=w, joint='curve')
    d.ellipse((hx1 - w / 2, hy1 - w / 2, hx1 + w / 2, hy1 + w / 2), fill=fg)

    if nodes:
        # Three connected nodes inside the lens: "research", not "search".
        nr = inner * 0.036
        pts = [(cx - r * 0.44, cy + r * 0.30),
               (cx + r * 0.44, cy + r * 0.30),
               (cx,            cy - r * 0.46)]
        lw = max(1, int(inner * 0.016))
        for a in range(3):
            for b in range(a + 1, 3):
                d.line((*pts[a], *pts[b]), fill=fg, width=lw)
        for (px, py) in pts:
            d.ellipse((px - nr, py - nr, px + nr, py + nr), fill=fg)

    return img.resize((size, size), Image.LANCZOS)


def og_card(path, accent, title, subtitle, count, label):
    """1200x630 social card: accent bar, mark, title, subtitle, stat strip."""
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), CREAM)
    d = ImageDraw.Draw(img)

    d.rectangle((0, 0, W, 12), fill=accent)

    # Faint dot texture, echoing the app's hero background.
    for y in range(60, H, 28):
        for x in range(60, W, 28):
            d.point((x, y), fill=(232, 228, 220))

    mark = draw_mark(120, accent, CREAM, radius_ratio=0.24)
    img.paste(mark, (80, 92), mark)

    d.text((228, 112), 'STEM RESEARCH FINDER', font=font(FONT_BODY_B, 24), fill=accent)
    d.text((228, 152), 'stemresearchfinder.tech', font=font(FONT_BODY, 22), fill=(140, 134, 126))

    # Title, wrapped to the card width.
    f_title = font(FONT_DISPLAY, 68)
    words, lines, cur = title.split(), [], ''
    for word in words:
        trial = f"{cur} {word}".strip()
        if d.textlength(trial, font=f_title) > W - 160 and cur:
            lines.append(cur); cur = word
        else:
            cur = trial
    lines.append(cur)
    y = 268
    for line in lines[:2]:
        d.text((80, y), line, font=f_title, fill=INK)
        y += 82

    d.text((80, y + 10), subtitle, font=font(FONT_BODY, 30), fill=(110, 105, 98))

    # Stat strip along the bottom.
    d.line((80, H - 118, W - 80, H - 118), fill=(226, 221, 213), width=2)
    f_count, f_label, f_tag = font(FONT_BODY_B, 34), font(FONT_BODY, 26), font(FONT_BODY, 24)
    d.text((80, H - 92), count, font=f_count, fill=accent)
    cw = d.textlength(count, font=f_count)
    d.text((80 + cw + 12, H - 84), label, font=f_label, fill=(110, 105, 98))

    # The tagline is optional furniture — drop it rather than let it collide
    # with a long stat label (the platform card's label is the longest).
    tag = 'Search  ·  Match your resume  ·  Email advisors'
    left_end = 80 + cw + 12 + d.textlength(label, font=f_label)
    tag_x = W - 80 - d.textlength(tag, font=f_tag)
    if tag_x - left_end > 40:
        d.text((tag_x, H - 82), tag, font=f_tag, fill=(150, 144, 136))

    img.save(path, 'PNG', optimize=True)
    return path


def main():
    os.makedirs(os.path.join(PUBLIC, 'og'), exist_ok=True)
    out = []

    # ── Favicons (platform indigo) ───────────────────────────
    ico = [draw_mark(s, INDIGO, CREAM, nodes=(s >= 48)) for s in (16, 32, 48)]
    ico_path = os.path.join(PUBLIC, 'favicon.ico')
    ico[2].save(ico_path, format='ICO',
                sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
    out.append(ico_path)

    for name, size in (('icon-192.png', 192), ('icon-512.png', 512)):
        p = os.path.join(PUBLIC, name)
        draw_mark(size, INDIGO, CREAM).save(p, 'PNG', optimize=True)
        out.append(p)

    # Maskable: Android crops to a circle, so shrink the art into the safe zone.
    p = os.path.join(PUBLIC, 'icon-maskable-512.png')
    m = Image.new('RGBA', (512, 512), INDIGO + (255,))
    art = draw_mark(512, None, CREAM, pad_ratio=0.14)
    m.paste(art, (0, 0), art)
    m.save(p, 'PNG', optimize=True)
    out.append(p)

    # iOS strips alpha and applies its own mask — ship it square and opaque.
    p = os.path.join(PUBLIC, 'apple-touch-icon.png')
    a = Image.new('RGB', (180, 180), INDIGO)
    art = draw_mark(180, INDIGO, CREAM, radius_ratio=0.0)
    a.paste(art, (0, 0), art)
    a.save(p, 'PNG', optimize=True)
    out.append(p)

    # ── Social cards ─────────────────────────────────────────
    out.append(og_card(os.path.join(PUBLIC, 'og', 'default.png'), INDIGO,
                       'Find research labs and faculty advisors',
                       'Texas A&M · Rice · UT Austin · UT Dallas · MIT · Harvard',
                       '4,838', 'STEM professors across 6 universities'))

    for code, (hexv, brand, uni, count) in SCHOOLS.items():
        out.append(og_card(os.path.join(PUBLIC, 'og', f'{code}.png'), hexrgb(hexv),
                           brand, f'Research labs and faculty advisors at {uni}',
                           count, 'STEM professors and research labs'))

    for p in out:
        print(f'  {os.path.relpath(p, PUBLIC):32} {os.path.getsize(p) / 1024:7.1f} KB')


if __name__ == '__main__':
    main()
