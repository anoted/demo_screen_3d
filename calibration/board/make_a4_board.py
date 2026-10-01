# Throwaway: A4 landscape ChArUco board, 7x5 squares of 38 mm, 28 mm DICT_4X4_50 markers.
import cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont
DPI = 600; MM = DPI / 25.4
COLS, ROWS, SQ, MK = 7, 5, 38, 28
page = np.full((round(210 * MM), round(297 * MM)), 255, np.uint8)
board = cv2.aruco.CharucoBoard((COLS, ROWS), SQ / 1000, MK / 1000,
                               cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50))
bw, bh = round(COLS * SQ * MM), round(ROWS * SQ * MM)
img = board.generateImage((bw, bh), marginSize=0, borderBits=1)
x0, y0 = (page.shape[1] - bw) // 2, (page.shape[0] - bh) // 2  # centred: 15.5 mm sides, 10 mm top/bottom
page[y0:y0 + bh, x0:x0 + bw] = img
# Label rotated in the right-hand 15.5 mm margin, clear of printer edge limits.
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', round(2.6 * MM))
text = (f'ChArUco {COLS}x{ROWS} - square {SQ} mm - marker {MK} mm - DICT_4X4_50 - '
        f'print at 100% (Actual size) - check: {COLS} squares = {COLS*SQ} mm')
label = Image.new('L', (bh, round(4 * MM)), 255)
ImageDraw.Draw(label).text((0, 0), text, fill=0, font=font)
label = np.array(label.rotate(90, expand=True))
lx = x0 + bw + round(5 * MM)
page[y0:y0 + label.shape[0], lx:lx + label.shape[1]] = label
pil = Image.fromarray(page).convert('RGB')
pil.save(f'{__import__("os").path.dirname(__file__)}/charuco_a4_7x5_38mm_4x4.pdf', resolution=DPI)
print('board', bw / MM, 'x', bh / MM, 'mm; page', page.shape[1] / MM, 'x', page.shape[0] / MM, 'mm')
