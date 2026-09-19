"""
Turn the generated logo PNG into the web assets the app uses.

The source's "transparency" is a drawn grey checkerboard - every pixel is
opaque - so the background has to be detected rather than read from the alpha
channel. Everything neutral (no hue) and light is background; the artwork is
either coloured (the wheel and cane) or dark (the two lines of type).

Two things that went wrong the first time, kept from happening again:

  - Bounding boxes are measured at source resolution, not on a resized copy.
    Resampling smears alpha outward, so a box measured afterwards grows to
    most of the canvas.
  - Downsampling is premultiplied. Transparent pixels still carry their old
    checkerboard colour; resize them unpremultiplied and that grey bleeds into
    every edge as a halo.
"""
import sys
import numpy as np
from PIL import Image

src_path, out_dir = sys.argv[1], sys.argv[2]

im = Image.open(src_path).convert("RGBA")
rgb = np.array(im)[..., :3].astype(np.int16)

spread = rgb.max(axis=2) - rgb.min(axis=2)      # 0 for any grey
bg = (spread <= 14) & (rgb.min(axis=2) >= 205)  # neutral AND light
art = ~bg

ys, xs = np.where(art)
print(f"source {im.size}   artwork rows {ys.min()}-{ys.max()} cols {xs.min()}-{xs.max()}")


def resize_rgba(arr, width):
    """Downsample RGBA with alpha premultiplied, so nothing bleeds."""
    a = arr[..., 3:4].astype(np.float32) / 255.0
    pre = np.concatenate([arr[..., :3].astype(np.float32) * a, a * 255.0], axis=2)
    h = max(1, round(pre.shape[0] * width / pre.shape[1]))
    small = np.array(
        Image.fromarray(pre.astype(np.uint8), "RGBA").resize((width, h), Image.LANCZOS)
    ).astype(np.float32)
    al = small[..., 3:4] / 255.0
    out = np.zeros_like(small)
    np.divide(small[..., :3], al, out=out[..., :3], where=al > 0.004)
    out[..., 3:4] = small[..., 3:4]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


full = np.array(im)
full[..., 3] = np.where(art, 255, 0)

# --- where does the wheel stop and the type start? -------------------------
# Scan down from the top of the artwork for the first run of blank rows.
rowhits = art.sum(axis=1)
gap = next(
    y for y in range(ys.min() + 20, art.shape[0] - 40)
    if (rowhits[y:y + 40] == 0).all()
)
print(f"wheel ends at source row {gap}")

# --- the full lockup -------------------------------------------------------
# 1400px covers the 228 CSS px the login card shows it at, on a 3x display.
pad = 8
lock = full[max(0, ys.min() - pad):ys.max() + 1 + pad,
            max(0, xs.min() - pad):xs.max() + 1 + pad]
lock_img = resize_rgba(lock, 1400)
lock_img.save(f"{out_dir}/logo-lockup.v3.png", optimize=True)
print("lockup", lock_img.size)

# --- the mark on its own ---------------------------------------------------
wy, wx = np.where(art[:gap])
mark = full[wy.min():wy.max() + 1, wx.min():wx.max() + 1]
print("mark", (mark.shape[1], mark.shape[0]))

# Square it, so it holds its shape as a favicon or an avatar.
side = max(mark.shape[0], mark.shape[1])
sq = np.zeros((side, side, 4), np.uint8)
oy, ox = (side - mark.shape[0]) // 2, (side - mark.shape[1]) // 2
sq[oy:oy + mark.shape[0], ox:ox + mark.shape[1]] = mark

resize_rgba(sq, 512).save(f"{out_dir}/logo-mark.v3.png", optimize=True)
resize_rgba(sq, 64).save(f"{out_dir}/logo-mark-64.v3.png", optimize=True)
print("mark squared to", side)
