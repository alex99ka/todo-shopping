"""Draws assets/icon.png and assets/icon_foreground.png: a cream checklist in a
chestnut basket, in the recipe book's palette (warm brown gradient, cream,
chestnut, peach). Run: python tool/make_icon.py, then flutter_launcher_icons."""
from PIL import Image, ImageDraw

S = 4  # supersampling
N = 1024 * S
CREAM, PAGE2, CHESTNUT, RIM, PEACH = (255, 243, 224), (252, 229, 200), (111, 34, 20), (140, 52, 28), (235, 166, 124)
TOP_LEFT, BOTTOM_RIGHT = (196, 152, 110), (154, 113, 72)


def gradient():
    im = Image.new('RGB', (N, N))
    px = im.load()
    for y in range(0, N, S):
        for x in range(0, N, S):
            t = (x + y) / (2 * N)
            c = tuple(round(a + (b - a) * t) for a, b in zip(TOP_LEFT, BOTTOM_RIGHT))
            for dy in range(S):
                for dx in range(S):
                    px[x + dx, y + dy] = c
    return im.convert('RGBA')


def glyph(d, o=0, k=1.0):
    """The drawing, scaled by k around the centre and moved down by o (1024 units)."""
    def p(x, y):
        return ((512 + (x - 512) * k) * S, (512 + (y - 512) * k + o) * S)

    def r(v):
        return v * k * S

    # The handle, behind the list.
    d.arc([*p(250, 250), *p(774, 900)], 180, 360, fill=RIM, width=round(r(34)))
    # The list sticking out of the basket: a back page and a front page.
    d.rounded_rectangle([*p(352, 180), *p(700, 640)], r(30), fill=PAGE2)
    d.rounded_rectangle([*p(318, 210), *p(668, 660)], r(30), fill=CREAM)
    for i, y in enumerate((292, 384, 476)):
        done = i < 2
        d.rounded_rectangle([*p(362, y - 28), *p(418, y + 28)], r(12),
                            fill=CHESTNUT if done else None, outline=CHESTNUT, width=round(r(10)))
        if done:
            d.line([p(376, y + 1), p(386, y + 12), p(405, y - 12)], fill=CREAM, width=round(r(10)), joint='curve')
        d.line([p(446, y), p(620 - i * 40, y)], fill=PEACH, width=round(r(22)))
        for x in (446, 620 - i * 40):
            d.ellipse([*p(x - 11, y - 11), *p(x + 11, y + 11)], fill=PEACH)
    # The basket: the body narrowing down, woven, under a rim.
    d.rounded_rectangle([*p(262, 600), *p(762, 850)], r(36), fill=CHESTNUT)
    d.rectangle([*p(262, 600), *p(762, 700)], fill=CHESTNUT)
    for y in (680, 760):
        d.line([p(270, y), p(754, y)], fill=RIM, width=round(r(14)))
    for x in range(330, 720, 76):
        d.line([p(x, 630), p(x, 836)], fill=RIM, width=round(r(14)))
    d.rounded_rectangle([*p(226, 560), *p(798, 628)], r(34), fill=RIM)


icon = gradient()
glyph(ImageDraw.Draw(icon))
icon.resize((1024, 1024), Image.LANCZOS).save('assets/icon.png')

# Adaptive icon: the glyph alone, inside the 66% safe circle.
fg = Image.new('RGBA', (N, N), (0, 0, 0, 0))
glyph(ImageDraw.Draw(fg), o=-20, k=0.70)
fg.resize((1024, 1024), Image.LANCZOS).save('assets/icon_foreground.png')
print('ok')
