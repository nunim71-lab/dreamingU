# 꿈탐정 몽록 아이콘 다시 그리기 (개발용, Pillow 필요): python3 tools/make-icon.py tools/icon.ico public/icon.png
# 밤하늘 앞의 신비로운 하얀 부엉이: 은빛 깃털, 금빛으로 빛나는 눈, 이마의 작은 별, 뒤에는 초승달과 별빛.
# 흰 스티커 테두리로 어떤 바탕화면에서도 잘 보이게 함.
import sys, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 2048
k = S / 1024
def P(*v): return [x * k for x in v]
def layer(): return Image.new('RGBA', (S, S), (0, 0, 0, 0))

NIGHT = (20, 18, 58, 255)
WHITE = (248, 249, 255, 255)
SHADE = (214, 218, 238, 255)
SHADE2 = (188, 194, 226, 255)
SPECK = (150, 160, 205, 255)
GOLD = (255, 204, 92, 255)
GOLD_DEEP = (236, 150, 40, 255)
PUPIL = (18, 14, 40, 255)
BEAK = (96, 92, 120, 255)
VIOLET = (190, 160, 255, 255)

img = layer()
def comp(l):
    global img
    img = Image.alpha_composite(img, l)
def draw(fn, blur=0):
    l = layer(); fn(ImageDraw.Draw(l))
    if blur: l = l.filter(ImageFilter.GaussianBlur(blur * k))
    comp(l)
def glow(cx, cy, r, color, alpha, blur):
    draw(lambda d: d.ellipse(P(cx - r, cy - r, cx + r, cy + r), fill=color[:3] + (alpha,)), blur)

circle_mask = layer(); ImageDraw.Draw(circle_mask).ellipse(P(92, 92, 932, 932), fill=(255, 255, 255, 255))
def clip(l): return ImageChops.multiply(l, circle_mask)

# 밤하늘 + 은은한 보랏빛 안개
draw(lambda d: d.ellipse(P(92, 92, 932, 932), fill=NIGHT))
sky = layer(); sd = ImageDraw.Draw(sky)
sd.ellipse(P(150, 380, 870, 1100), fill=(90, 70, 170, 120))
sd.ellipse(P(560, 80, 980, 500), fill=(60, 80, 170, 90))
comp(clip(sky.filter(ImageFilter.GaussianBlur(90 * k))))

# 별빛
random.seed(7)
stars = layer(); st = ImageDraw.Draw(stars)
for _ in range(70):
    x, y = random.uniform(120, 900), random.uniform(120, 900)
    r = random.choice((1.6, 2.2, 2.8, 3.6))
    st.ellipse(P(x - r, y - r, x + r, y + r), fill=(255, 250, 235, random.randint(120, 230)))
comp(clip(stars))
def twinkle(cx, cy, r, d):
    pts = []
    for i in range(8):
        rr = r if i % 2 == 0 else r * 0.22
        a = math.pi / 4 * i - math.pi / 2
        pts.append(((cx + rr * math.cos(a)) * k, (cy + rr * math.sin(a)) * k))
    d.polygon(pts, fill=(255, 248, 225, 255))
for (x, y, r) in ((230, 250, 30), (330, 170, 15), (860, 470, 18), (175, 470, 13)):
    glow(x, y, r * 1.2, (255, 240, 200), 90, 12)
    draw(lambda d, x=x, y=y, r=r: twinkle(x, y, r, d))

# 초승달 (빛나게)
glow(745, 245, 110, GOLD, 70, 40)
moon = layer(); md = ImageDraw.Draw(moon)
md.ellipse(P(650, 150, 840, 340), fill=(255, 226, 150, 255))
cut = layer(); ImageDraw.Draw(cut).ellipse(P(700, 122, 890, 312), fill=(255, 255, 255, 255))
moon = Image.composite(layer(), moon, cut.split()[3]); comp(moon)

# 부엉이 뒤의 달무리 같은 빛
glow(512, 600, 300, (200, 190, 255), 70, 60)

# 몸통
draw(lambda d: d.ellipse(P(318, 430, 706, 915), fill=WHITE))
draw(lambda d: [d.ellipse(P(285, 520, 410, 860), fill=SHADE), d.ellipse(P(614, 520, 739, 860), fill=SHADE)])  # 날개
draw(lambda d: [d.arc(P(300, 560, 420, 880), 100, 200, fill=SHADE2, width=int(10 * k)),
                d.arc(P(604, 560, 724, 880), -20, 80, fill=SHADE2, width=int(10 * k))])
# 깃털 무늬 (은빛 반점)
def specks(d):
    for row, y in enumerate((640, 705, 770, 835)):
        n = 4 if row % 2 == 0 else 3
        for j in range(n):
            x = 512 + (j - (n - 1) / 2) * 62
            d.arc(P(x - 16, y - 9, x + 16, y + 9), 25, 155, fill=SPECK, width=int(6 * k))
draw(specks)
draw(lambda d: [d.ellipse(P(430, 895, 480, 925), fill=SHADE2), d.ellipse(P(544, 895, 594, 925), fill=SHADE2)])  # 발

# 머리 + 귀깃(부엉이의 뾰족한 귀)
draw(lambda d: [d.polygon([tuple(P(330, 380)), tuple(P(300, 230)), tuple(P(420, 330))], fill=WHITE),
                d.polygon([tuple(P(694, 380)), tuple(P(724, 230)), tuple(P(604, 330))], fill=WHITE)])
draw(lambda d: [d.line(P(318, 250, 360, 345), fill=SHADE2, width=int(8 * k)),
                d.line(P(706, 250, 664, 345), fill=SHADE2, width=int(8 * k))])
draw(lambda d: d.ellipse(P(290, 290, 734, 650), fill=WHITE))
# 얼굴 원반 (하트 모양 테두리)
draw(lambda d: [d.ellipse(P(330, 360, 522, 600), outline=SHADE, width=int(10 * k)),
                d.ellipse(P(502, 360, 694, 600), outline=SHADE, width=int(10 * k))])

# 이마의 작은 보랏빛 별
glow(512, 372, 30, VIOLET, 150, 12)
draw(lambda d: twinkle(512, 372, 22, d))

# 눈: 금빛으로 빛나는 큰 눈
for cx, side in ((420, 1), (604, -1)):
    glow(cx, 478, 92, GOLD, 150, 26)
    draw(lambda d, cx=cx: d.ellipse(P(cx - 62, 416, cx + 62, 540), fill=GOLD_DEEP))
    draw(lambda d, cx=cx: d.ellipse(P(cx - 54, 424, cx + 54, 532), fill=GOLD))
    # 홍채의 빛살 무늬
    def rays(d, cx=cx):
        for i in range(24):
            a = math.pi * 2 * i / 24
            d.line(P(cx + 32 * math.cos(a), 478 + 32 * math.sin(a), cx + 50 * math.cos(a), 478 + 50 * math.sin(a)), fill=(255, 236, 170, 160), width=int(3 * k))
    draw(rays)
    draw(lambda d, cx=cx: d.ellipse(P(cx - 29, 449, cx + 29, 507), fill=PUPIL))
    draw(lambda d, cx=cx: [d.ellipse(P(cx - 22, 456, cx - 6, 472), fill=(255, 255, 255, 255)),
                           d.ellipse(P(cx + 10, 488, cx + 17, 495), fill=(255, 255, 255, 200))])
    # 살짝 내려온 눈꺼풀 (안쪽이 조금 더 낮아 신비롭고 깊은 눈빛)
    outer, inner = cx - 70 * side, cx + 70 * side
    lid = layer(); ImageDraw.Draw(lid).polygon([tuple(P(outer, 400)), tuple(P(inner, 400)), tuple(P(inner, 452)), tuple(P(outer, 436))], fill=WHITE)
    eye = layer(); ImageDraw.Draw(eye).ellipse(P(cx - 63, 415, cx + 63, 541), fill=(255, 255, 255, 255))
    comp(ImageChops.multiply(lid, eye))
    draw(lambda d, o=outer, i=inner: d.line(P(o + 8 * side, 437, i - 8 * side, 451), fill=SHADE2, width=int(7 * k)))

# 부리
draw(lambda d: d.polygon([tuple(P(512, 528)), tuple(P(490, 556)), tuple(P(512, 600)), tuple(P(534, 556))], fill=BEAK))

# 발밑에 흐르는 꿈의 안개
mist = layer(); mdraw = ImageDraw.Draw(mist)
for (x0, y0, x1, y1, a) in ((120, 820, 560, 960, 170), (440, 850, 920, 980, 150), (250, 880, 780, 1000, 190)):
    mdraw.ellipse(P(x0, y0, x1, y1), fill=(225, 220, 255, a))
comp(clip(mist.filter(ImageFilter.GaussianBlur(22 * k))))

# 흰 스티커 테두리 + 그림자
alpha = img.split()[3]
outline = alpha.filter(ImageFilter.MaxFilter(int(28 * k) | 1))
sticker = Image.new('RGBA', (S, S), (255, 255, 255, 255)); sticker.putalpha(outline)
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 110)); shadow.putalpha(outline.point(lambda v: v * 0.45))
shadow = shadow.filter(ImageFilter.GaussianBlur(14 * k))
final = Image.alpha_composite(Image.alpha_composite(layer(), shadow), sticker)
final = Image.alpha_composite(final, img)
final = final.resize((256, 256), Image.LANCZOS)

ico, png = sys.argv[1], sys.argv[2]
final.save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
final.save(png)
print('saved', ico, png)
