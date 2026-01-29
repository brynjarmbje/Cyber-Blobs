from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


def make_border_only_frame(
    src_path: Path,
    dst_path: Path,
    *,
    square_crop: bool = True,
    tol: int = 45,
    grey_delta_max: int = 18,
    max_brightness: int = 140,
    safety_fill_ratio: float = 0.80,
) -> dict:
    img = Image.open(src_path).convert("RGBA")

    if square_crop:
        w, h = img.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))

    w, h = img.size
    px = img.load()

    seed = (w // 2, h // 2)
    seed_r, seed_g, seed_b, seed_a = px[seed]

    def is_interior(r: int, g: int, b: int, a: int) -> bool:
        if a == 0:
            return False
        # Near-grey only (avoid cutting cyan/orange border details)
        if max(abs(r - g), abs(g - b), abs(r - b)) > grey_delta_max:
            return False
        # Must be close to the seed interior color
        if max(abs(r - seed_r), abs(g - seed_g), abs(b - seed_b)) > tol:
            return False
        # Must be fairly dark
        if (r + g + b) / 3 > max_brightness:
            return False
        return True

    visited = bytearray(w * h)

    def idx(x: int, y: int) -> int:
        return y * w + x

    q: deque[tuple[int, int]] = deque([seed])
    filled = 0
    max_fill = int(w * h * safety_fill_ratio)

    while q:
        x, y = q.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = idx(x, y)
        if visited[i]:
            continue
        visited[i] = 1

        r, g, b, a = px[x, y]
        if not is_interior(r, g, b, a):
            continue

        px[x, y] = (r, g, b, 0)
        filled += 1

        if filled > max_fill:
            break

        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst_path)

    return {
        "src": str(src_path),
        "dst": str(dst_path),
        "size": (w, h),
        "seed": (seed_r, seed_g, seed_b, seed_a),
        "filled_pixels": filled,
    }


if __name__ == "__main__":
    src = Path(__file__).resolve().parents[1] / "assets" / "yolk_target_frame.png"
    dst = Path(__file__).resolve().parents[1] / "assets" / "yolk_target_frame_border.png"

    info = make_border_only_frame(src, dst)
    print(info)
