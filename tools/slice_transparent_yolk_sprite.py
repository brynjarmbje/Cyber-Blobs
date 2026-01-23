from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional, Tuple

from PIL import Image


@dataclass(frozen=True)
class SliceResult:
    name: str
    cell_box: Tuple[int, int, int, int]
    crop_box: Tuple[int, int, int, int]
    out_size: Tuple[int, int]


def alpha_bbox(img: Image.Image, thr: int = 8) -> Optional[Tuple[int, int, int, int]]:
    """Return bbox of pixels with alpha > thr."""
    a = img.getchannel('A')
    m = a.point(lambda v: 255 if v > thr else 0)
    return m.getbbox()


def main() -> None:
    src = 'assets/Yolk_buttons_transp-bg.png'
    out_dir = 'assets/yolk_buttons_sliced'

    im = Image.open(src).convert('RGBA')
    W, H = im.size

    # Expected grid for this sprite: 3 columns x 2 rows, 512x512 per cell.
    cols, rows = 3, 2
    cell_w, cell_h = W // cols, H // rows
    if cell_w * cols != W or cell_h * rows != H:
        raise SystemExit(f'Unexpected sprite size {W}x{H} for grid {cols}x{rows}')

    os.makedirs(out_dir, exist_ok=True)

    results: list[SliceResult] = []

    for r in range(rows):
        for c in range(cols):
            x0, y0 = c * cell_w, r * cell_h
            cell_box = (x0, y0, x0 + cell_w, y0 + cell_h)
            cell = im.crop(cell_box)

            bbox = alpha_bbox(cell, thr=8)
            if not bbox:
                crop = (0, 0, cell_w, cell_h)
                out = cell
            else:
                pad = 10
                bx0, by0, bx1, by1 = bbox
                bx0 = max(0, bx0 - pad)
                by0 = max(0, by0 - pad)
                bx1 = min(cell_w, bx1 + pad)
                by1 = min(cell_h, by1 + pad)
                crop = (bx0, by0, bx1, by1)
                out = cell.crop(crop)

            name = f'btn_r{r+1}_c{c+1}.png'
            out_path = os.path.join(out_dir, name)
            out.save(out_path)
            results.append(SliceResult(name=name, cell_box=cell_box, crop_box=crop, out_size=out.size))

    print(f'wrote {len(results)} files to {out_dir}')
    for res in results:
        print(res.name, 'cell', res.cell_box, 'crop', res.crop_box, 'out', res.out_size)


if __name__ == '__main__':
    main()
