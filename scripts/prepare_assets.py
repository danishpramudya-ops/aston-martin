import glob
import os
import numpy as np
from PIL import Image, ImageFilter, ImageOps

ARTIFACT_DIR = r"C:\Users\WINDOWS 11\.gemini\antigravity\brain\92ba5073-4ccb-46b8-b219-20b914a61eed"
OUT_ROOT = r"c:\Users\WINDOWS 11\OneDrive\Desktop\PORTOFOLIO DANISH\aston-martin\public\assets\cars"
VOID_RGB = np.array([7.0, 9.0, 8.0], dtype=np.float32)  # #070908
TARGET_W, TARGET_H = 1376, 768


def find_latest(prefix: str) -> str:
    matches = sorted(glob.glob(os.path.join(ARTIFACT_DIR, f"{prefix}*.jpg")))
    if not matches:
        raise FileNotFoundError(f"Missing artifact matching {prefix}*.jpg")
    return matches[-1]


def normalize_cyclorama(img: Image.Image, target_bottom_ratio=0.80, top_fade_start=0.0, top_fade_end=0.0) -> Image.Image:
    """
    Normalizes dark cyclorama edges toward #070908, removes optional overhead studio softboxes,
    and anchors the vehicle horizontally centered and vertically aligned on a consistent ground line.
    """
    if img.size != (TARGET_W, TARGET_H):
        img = img.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)

    arr = np.array(img, dtype=np.float32)

    # Optional clean removal of overhead softbox fixtures (top_fade_end > 0)
    if top_fade_end > 0.0:
        yy = np.linspace(0.0, 1.0, TARGET_H)[:, None]
        # Only suppress bright pixels high up in the ceiling zone above the roofline
        lum = arr.mean(axis=2)
        ceiling_zone = np.clip((top_fade_end - yy) / max(1e-4, (top_fade_end - top_fade_start)), 0.0, 1.0)
        # Keep everything below ceiling fade intact
        arr = arr * (1.0 - ceiling_zone[..., None]) + VOID_RGB * ceiling_zone[..., None]

    # Measure car bounding box (pixels significantly brighter than studio void)
    lum = arr.mean(axis=2)
    car_mask = lum > 24.0
    # Restrict search slightly away from top 10% and outer 2% edges
    car_mask[: int(TARGET_H * 0.10), :] = False
    car_mask[:, : int(TARGET_W * 0.02)] = False
    car_mask[:, int(TARGET_W * 0.98) :] = False

    ys, xs = np.where(car_mask)
    if len(xs) > 500:
        min_x, max_x = int(xs.min()), int(xs.max())
        max_y = int(ys.max())
        cx = (min_x + max_x) // 2
        shift_x = (TARGET_W // 2) - cx
        target_bottom = int(TARGET_H * target_bottom_ratio)
        shift_y = target_bottom - max_y
        # Clamp shifts to subtle stabilization bounds so shadows stay natural
        shift_x = max(-90, min(90, shift_x))
        shift_y = max(-45, min(45, shift_y))
        if shift_x != 0 or shift_y != 0:
            shifted = np.full_like(arr, VOID_RGB)
            src_y0 = max(0, -shift_y)
            src_y1 = min(TARGET_H, TARGET_H - shift_y)
            dst_y0 = max(0, shift_y)
            dst_y1 = dst_y0 + (src_y1 - src_y0)

            src_x0 = max(0, -shift_x)
            src_x1 = min(TARGET_W, TARGET_W - shift_x)
            dst_x0 = max(0, shift_x)
            dst_x1 = dst_x0 + (src_x1 - src_x0)
            shifted[dst_y0:dst_y1, dst_x0:dst_x1] = arr[src_y0:src_y1, src_x0:src_x1]
            arr = shifted

    # Soft outer edge cyclorama fade so every angle blends invisibly into #070908
    yy, xx = np.mgrid[0:TARGET_H, 0:TARGET_W]
    nx = (xx / TARGET_W - 0.5) * 2.0
    ny = (yy / TARGET_H - 0.53) * 2.0
    elliptical = np.sqrt((nx / 0.96) ** 2 + (ny / 0.92) ** 2)
    edge_blend = np.clip((elliptical - 0.72) / 0.34, 0.0, 1.0)
    edge_blend = edge_blend ** 1.6
    arr = arr * (1.0 - edge_blend[..., None]) + VOID_RGB * edge_blend[..., None]

    out = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="RGB")


def save_frame(img: Image.Image, folder: str, filename: str):
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, filename)
    img.save(path, format="JPEG", quality=93, optimize=True)
    print("Saved:", path)


def patch_mirrored_badge(img: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    """Softly blurs/inpaints a tiny mirrored emblem region with surrounding silver tone."""
    arr = np.array(img, dtype=np.float32)
    x0, y0, x1, y1 = box
    patch = img.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(radius=4.5))
    arr[y0:y1, x0:x1] = np.array(patch, dtype=np.float32)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def process_valkyrie():
    out_dir = os.path.join(OUT_ROOT, "valkyrie")
    f000 = normalize_cyclorama(Image.open(find_latest("valkyrie_angle_000")))
    f045 = normalize_cyclorama(Image.open(find_latest("valkyrie_angle_045")))
    f090 = normalize_cyclorama(Image.open(find_latest("valkyrie_angle_090")))
    f135 = normalize_cyclorama(Image.open(find_latest("valkyrie_angle_135")))
    f180 = normalize_cyclorama(Image.open(find_latest("valkyrie_angle_180")))

    save_frame(f000, out_dir, "angle_000.jpg")
    save_frame(f045, out_dir, "angle_045.jpg")
    save_frame(f090, out_dir, "angle_090.jpg")
    save_frame(f135, out_dir, "angle_135.jpg")
    save_frame(f180, out_dir, "angle_180.jpg")
    save_frame(ImageOps.mirror(f135), out_dir, "angle_225.jpg")
    save_frame(ImageOps.mirror(f090), out_dir, "angle_270.jpg")
    save_frame(ImageOps.mirror(f045), out_dir, "angle_315.jpg")


def process_valhalla():
    out_dir = os.path.join(OUT_ROOT, "valhalla")
    f000 = normalize_cyclorama(Image.open(find_latest("valhalla_angle_000")))
    f045 = normalize_cyclorama(Image.open(find_latest("valhalla_angle_045")))
    f090 = normalize_cyclorama(Image.open(find_latest("valhalla_angle_090")))

    save_frame(f000, out_dir, "angle_000.jpg")
    save_frame(f045, out_dir, "angle_045.jpg")
    save_frame(f090, out_dir, "angle_090.jpg")
    save_frame(ImageOps.mirror(f090), out_dir, "angle_270.jpg")
    save_frame(ImageOps.mirror(f045), out_dir, "angle_315.jpg")


def process_vanquish():
    out_dir = os.path.join(OUT_ROOT, "vanquish")
    f000 = normalize_cyclorama(Image.open(find_latest("vanquish_angle_000")))
    f045 = normalize_cyclorama(Image.open(find_latest("vanquish_angle_045")))
    f090 = normalize_cyclorama(Image.open(find_latest("vanquish_angle_090")))

    f270 = patch_mirrored_badge(ImageOps.mirror(f090), (840, 405, 920, 445))
    f315 = patch_mirrored_badge(ImageOps.mirror(f045), (560, 415, 625, 455))

    save_frame(f000, out_dir, "angle_000.jpg")
    save_frame(f045, out_dir, "angle_045.jpg")
    save_frame(f090, out_dir, "angle_090.jpg")
    save_frame(f270, out_dir, "angle_270.jpg")
    save_frame(f315, out_dir, "angle_315.jpg")


def clean_db12_softboxes(cell: Image.Image, cut_y_ratio: float) -> Image.Image:
    """Replaces overhead studio lightbox rectangles cleanly with #070908 studio void."""
    w, h = cell.size
    arr = np.array(cell, dtype=np.float32)
    cut_y = int(h * cut_y_ratio)
    fade_h = max(22, int(h * 0.08))
    arr[:cut_y, :] = VOID_RGB
    for row in range(cut_y, min(h, cut_y + fade_h)):
        t = (row - cut_y) / fade_h
        arr[row, :] = VOID_RGB * (1.0 - t) + arr[row, :] * t
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def fit_proportionally_to_studio(img: Image.Image, scale_boost: float = 1.0) -> Image.Image:
    """Scales image proportionally (never stretching) and centers on a 1376x768 #070908 cyclorama with soft edge feathering."""
    src_w, src_h = img.size
    fit_scale = min(TARGET_W / src_w, TARGET_H / src_h) * scale_boost
    new_w = int(round(src_w * fit_scale))
    new_h = int(round(src_h * fit_scale))
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # Feather the outer 48px of the resized tile into VOID_RGB so no seam ever appears
    r_arr = np.array(resized, dtype=np.float32)
    feather = 54
    alpha_x = np.ones(new_w, dtype=np.float32)
    alpha_y = np.ones(new_h, dtype=np.float32)
    alpha_x[:feather] = np.linspace(0.0, 1.0, feather)
    alpha_x[-feather:] = np.linspace(1.0, 0.0, feather)
    alpha_y[:feather] = np.linspace(0.0, 1.0, feather)
    alpha_y[-feather:] = np.linspace(1.0, 0.0, feather)
    alpha = np.minimum(alpha_y[:, None], alpha_x[None, :])
    r_arr = r_arr * alpha[..., None] + VOID_RGB * (1.0 - alpha[..., None])
    feathered = Image.fromarray(np.clip(r_arr, 0, 255).astype(np.uint8))

    canvas = Image.new("RGB", (TARGET_W, TARGET_H), tuple(int(v) for v in VOID_RGB))
    paste_x = (TARGET_W - new_w) // 2
    paste_y = (TARGET_H - new_h) // 2
    canvas.paste(feathered, (paste_x, paste_y))
    return canvas


def process_db12():
    out_dir = os.path.join(OUT_ROOT, "db12")
    hero = Image.open(find_latest("test_db12_hero_png"))
    hero_clean = clean_db12_softboxes(hero, 0.145)
    f315 = normalize_cyclorama(hero_clean)

    grid = Image.open(find_latest("test_db12_turntable_grid_png"))
    gw, gh = grid.size
    cw, ch = gw // 3, gh // 2
    pad = 8

    def crop_cell(col_idx: int, row_idx: int, cut_top=0.205, scale_boost=0.98) -> Image.Image:
        x0 = col_idx * cw + pad
        y0 = row_idx * ch + pad
        x1 = (col_idx + 1) * cw - pad
        y1 = (row_idx + 1) * ch - pad
        c = grid.crop((x0, y0, x1, y1))
        c = clean_db12_softboxes(c, cut_top)
        c = fit_proportionally_to_studio(c, scale_boost=scale_boost)
        c = c.filter(ImageFilter.UnsharpMask(radius=1.0, percent=55, threshold=2))
        return normalize_cyclorama(c, target_bottom_ratio=0.79)

    f000 = crop_cell(0, 0, cut_top=0.205, scale_boost=0.98)
    f045 = crop_cell(1, 0, cut_top=0.22, scale_boost=0.98)
    f135 = crop_cell(2, 0, cut_top=0.215, scale_boost=0.98)
    f180 = crop_cell(0, 1, cut_top=0.205, scale_boost=0.98)
    f225 = patch_mirrored_badge(ImageOps.mirror(f135), (780, 325, 920, 380))

    save_frame(f000, out_dir, "angle_000.jpg")
    save_frame(f045, out_dir, "angle_045.jpg")
    save_frame(f135, out_dir, "angle_135.jpg")
    save_frame(f180, out_dir, "angle_180.jpg")
    save_frame(f225, out_dir, "angle_225.jpg")
    save_frame(f315, out_dir, "angle_315.jpg")


if __name__ == "__main__":
    process_valkyrie()
    process_valhalla()
    process_vanquish()
    process_db12()
    print("All studio turntable assets processed cleanly.")
