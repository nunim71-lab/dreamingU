# 꿈탐정 몽록 아이콘 다시 그리기 (개발용, Pillow 필요): python3 tools/make-icon.py tools/icon.ico public/icon.png
# 탐정 모자를 쓰고 돋보기를 든 부엉이, 뒤에는 초승달과 별. 흰 스티커 테두리로 어떤 바탕화면에서도 잘 보이게 함.
import sys, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 2048
k = S / 1024
def P(*v): return [x * k for x in v]
def layer(): return Image.new('RGBA', (S, S), (0, 0, 0, 0))

NIGHT = (27, 31, 78, 255)
NIGHT2 = (52, 46, 120, 255)
BODY = (140, 98, 70, 255)
BODY_DARK = (104, 70, 50, 255)
BELLY = (232, 208, 170, 255)
FACE = (246, 230, 200, 255)
GOLD = (255, 205, 80, 255)
HAT = (120, 92, 60, 255)
HAT_DARK = (88, 66, 42, 255)
CHECK = (150, 118, 80, 255)
EYE = (32, 26, 50, 255)
BEAK = (245, 166, 35, 255)
GLASS = (190, 225, 255, 150)
RIM = (60, 50, 70, 255)

img = layer()
def comp(l):
    global img
    img = Image.alpha_composite(img, l)
def draw(fn):
    l = layer(); fn(ImageDraw.Draw(l)); comp(l)

# 밤하늘 동그라미
draw(lambda d: d.ellipse(P(92, 92, 932, 932), fill=NIGHT))
grad = layer(); gd = ImageDraw.Draw(grad)
for i in range(60):
    r = 420 - i * 5
    gd.ellipse(P(512 - r + 90, 512 - r - 120, 512 + r + 90, 512 + r - 120), fill=(NIGHT2[0], NIGHT2[1], NIGHT2[2], 6))
mask = layer(); ImageDraw.Draw(mask).ellipse(P(92, 92, 932, 932), fill=(255, 255, 255, 255))
grad = ImageChops.multiply(grad, mask); comp(grad)

# 초승달
moon = layer(); md = ImageDraw.Draw(moon)
md.ellipse(P(640, 150, 840, 350), fill=GOLD)
md.ellipse(P(690, 120, 890, 320), fill=(0, 0, 0, 0))
cut = layer(); ImageDraw.Draw(cut).ellipse(P(690, 120, 890, 320), fill=(255, 255, 255, 255))
moon = Image.composite(layer(), moon, cut.split()[3]); comp(moon)

# 별
def star(cx, cy, r, d):
    pts = []
    for i in range(8):
        rr = r if i % 2 == 0 else r * 0.32
        a = math.pi / 4 * i - math.pi / 2
        pts.append(((cx + rr * math.cos(a)) * k, (cy + rr * math.sin(a)) * k))
    d.polygon(pts, fill=(255, 245, 210, 255))
draw(lambda d: [star(250, 230, 26, d), star(330, 160, 14, d), star(860, 420, 16, d), star(180, 420, 12, d)])

# 몸통
draw(lambda d: d.ellipse(P(300, 400, 720, 900), fill=BODY))
draw(lambda d: d.ellipse(P(380, 560, 640, 880), fill=BELLY))
def belly_marks(d):
    for row, y in enumerate((620, 690, 760)):
        for j in range(3 - (row == 2)):
            x = 450 + j * 60 + (30 if row % 2 else 0)
            d.arc(P(x - 18, y - 12, x + 18, y + 12), 20, 160, fill=BODY_DARK, width=int(7 * k))
draw(belly_marks)
# 날개
draw(lambda d: d.ellipse(P(270, 520, 400, 840), fill=BODY_DARK))
draw(lambda d: d.ellipse(P(625, 520, 755, 840), fill=BODY_DARK))
# 발
draw(lambda d: [d.ellipse(P(420, 870, 490, 910), fill=BEAK), d.ellipse(P(530, 870, 600, 910), fill=BEAK)])

# 머리 (몸통보다 조금 넓게) + 귀깃
draw(lambda d: d.ellipse(P(285, 300, 740, 640), fill=BODY))
# 얼굴 원반
draw(lambda d: [d.ellipse(P(330, 390, 520, 580), fill=FACE), d.ellipse(P(505, 390, 695, 580), fill=FACE)])
# 눈: 왼쪽은 크게 뜨고, 오른쪽엔 돋보기 너머로 커 보이는 눈
draw(lambda d: [d.ellipse(P(375, 432, 475, 532), fill=EYE), d.ellipse(P(400, 450, 430, 480), fill=(255, 255, 255, 255))])
draw(lambda d: [d.ellipse(P(548, 432, 648, 532), fill=EYE), d.ellipse(P(573, 450, 603, 480), fill=(255, 255, 255, 255))])
# 부리
draw(lambda d: d.polygon([(P(512, 0)[0], P(0, 530)[0]), (P(482, 0)[0], P(0, 560)[0]), (P(512, 0)[0], P(0, 610)[0]), (P(542, 0)[0], P(0, 560)[0])], fill=BEAK))

# 탐정 모자 (사냥 모자: 앞뒤 챙 + 체크 무늬)
def hat(d):
    d.ellipse(P(290, 300, 735, 400), fill=HAT_DARK)           # 챙
    d.chord(P(330, 170, 695, 470), 180, 360, fill=HAT)         # 둥근 윗부분
    for i in range(6):                                         # 체크 무늬
        x = 360 + i * 60
        d.line(P(x, 210, x - 10, 320), fill=CHECK, width=int(8 * k))
    for y in (250, 290):
        d.line(P(350, y, 680, y), fill=CHECK, width=int(8 * k))
    d.rectangle(P(330, 312, 695, 322), fill=HAT_DARK)
    d.ellipse(P(495, 158, 530, 193), fill=HAT_DARK)            # 꼭지 단추
draw(hat)

# 돋보기 (오른쪽 날개가 들고 있음)
def lens(d):
    d.line(P(760, 790, 860, 900), fill=RIM, width=int(40 * k))
    d.ellipse(P(600, 600, 800, 800), outline=RIM, width=int(26 * k))
draw(lens)
gl = layer(); ImageDraw.Draw(gl).ellipse(P(613, 613, 787, 787), fill=GLASS); comp(gl)
draw(lambda d: d.arc(P(640, 640, 760, 760), 200, 260, fill=(255, 255, 255, 220), width=int(12 * k)))

# 흰 스티커 테두리 + 그림자
alpha = img.split()[3]
outline = alpha.filter(ImageFilter.MaxFilter(int(28 * k) | 1))
sticker = Image.new('RGBA', (S, S), (255, 255, 255, 255)); sticker.putalpha(outline)
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 110)); shadow.putalpha(outline.point(lambda v: v * 0.45))
shadow = shadow.filter(ImageFilter.GaussianBlur(14 * k)).transform((S, S), Image.AFFINE, (1, 0, 0, 0, 1, -10 * k))
final = Image.alpha_composite(Image.alpha_composite(layer(), shadow), sticker)
final = Image.alpha_composite(final, img)
final = final.resize((256, 256), Image.LANCZOS)

ico, png = sys.argv[1], sys.argv[2]
final.save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
final.save(png)
print('saved', ico, png)
