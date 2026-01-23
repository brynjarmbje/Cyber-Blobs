from PIL import Image
import numpy as np

PATH = 'assets/Yolk_buttons.png'

im = Image.open(PATH).convert('RGB')
arr = np.asarray(im).astype(np.float32)

# Heuristic segmentation (works best when background is dark and buttons are bright):
r = arr[:, :, 0]
g = arr[:, :, 1]
b = arr[:, :, 2]
lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

# Find "foreground" (button-ish) pixels.
thr = max(55.0, float(np.percentile(lum, 80)))
mask = lum > thr

row_strength = mask.mean(axis=1)
col_strength = mask.mean(axis=0)

def segments(strength: np.ndarray, min_strength: float, min_len: int):
    segs = []
    start = None
    for i, v in enumerate(strength):
        if v >= min_strength and start is None:
            start = i
        if (v < min_strength or i == len(strength) - 1) and start is not None:
            end = i if v < min_strength else i + 1
            if end - start >= min_len:
                segs.append((start, end))
            start = None
    return segs

row_segs = segments(row_strength, min_strength=0.06, min_len=40)
col_segs = segments(col_strength, min_strength=0.06, min_len=40)

print('path', PATH)
print('size', im.size)
print('lum percentile 80', float(np.percentile(lum, 80)))
print('thr', thr)
print('row segments', row_segs)
print('col segments', col_segs)

# For each row segment, estimate a bounding box by finding strong columns within that band.
boxes = []
for (y0, y1) in row_segs:
    band = mask[y0:y1, :]
    cs = band.mean(axis=0)
    band_cols = segments(cs, min_strength=0.08, min_len=80)
    if not band_cols:
        continue
    x0, x1 = band_cols[0][0], band_cols[-1][1]
    boxes.append((int(x0), int(y0), int(x1), int(y1)))
print('boxes (x0,y0,x1,y1)', boxes)
