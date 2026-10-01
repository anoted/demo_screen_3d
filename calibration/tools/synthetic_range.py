# How small can the lab board get in the image and still be detected?
import cv2, numpy as np
d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_6X6_250)
board = cv2.aruco.CharucoBoard((9, 7), 0.0235, 0.013, d)
det = cv2.aruco.CharucoDetector(board)
big = board.generateImage((9*200, 7*200), marginSize=100)   # 200 px per square
for cell in [6, 5, 4, 3.5, 3, 2.5, 2, 1.5]:
    sq = cell * 8 / (13/23.5)                # px per square for this px/cell
    s = sq / 200
    img = cv2.resize(big, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    img = cv2.GaussianBlur(img, (0, 0), 0.6)  # mild camera softness
    img = np.clip(img.astype(np.float32) + np.random.normal(0, 4, img.shape), 0, 255).astype(np.uint8)
    cc, ci, mc, mi = det.detectBoard(img)
    print(f"{cell:>4} px/cell  square {sq:5.1f} px  markers {0 if mi is None else len(mi):2}/31  corners {0 if ci is None else len(ci):2}/48")
