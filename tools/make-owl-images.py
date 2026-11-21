# 꿈꾸는부엉이 홍보용 큰 그림 만들기 (개발용, Pillow 필요): python3 tools/make-owl-images.py 홍보-이미지
# 앱 아이콘(make-icon.py)과 똑같은 부엉이를 크게 뽑음
#  - 꿈꾸는부엉이-2048-투명배경.png : 배경 없음 (다른 그림·문서 위에 얹기, 인쇄)
#  - 꿈꾸는부엉이-1080-밤하늘.png   : 밤하늘 색 정사각형 (카톡·인스타 프로필, SNS 게시물)
import os, sys, runpy, tempfile
from PIL import Image

out = sys.argv[1] if len(sys.argv) > 1 else '홍보-이미지'
os.makedirs(out, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
with tempfile.TemporaryDirectory() as tmp:
    # 아이콘 스크립트가 만드는 작은 파일들은 임시 폴더에 버림
    sys.argv = ['make-icon.py', os.path.join(tmp, 'icon.ico'), os.path.join(tmp, 'icon.png')]
    big = runpy.run_path(os.path.join(here, 'make-icon.py'))['big']  # 2048x2048, 투명 배경

big.save(os.path.join(out, '꿈꾸는부엉이-2048-투명배경.png'))
W = 2160
bg = Image.new('RGBA', (W, W), (13, 16, 41, 255))
owl = big.resize((1840, 1840), Image.LANCZOS)
bg.alpha_composite(owl, ((W - 1840) // 2, (W - 1840) // 2 + 30))
bg.convert('RGB').resize((1080, 1080), Image.LANCZOS).save(os.path.join(out, '꿈꾸는부엉이-1080-밤하늘.png'))
print('saved', out)
