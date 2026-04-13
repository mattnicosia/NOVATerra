#!/usr/bin/env python3
"""
NOVATerra Label Review — Human-in-the-Loop QA
═════════════════════════════════════════════

Reviews auto-labeled training data by showing overlay images and
prompting for keep/discard decisions.

For each labeled image:
  1. Generate or show the overlay visualization
  2. Display class breakdown and box count
  3. User decides: keep, discard, or flag for edit
  4. Decisions logged to review_log.json
  5. Discarded images moved to dataset/discarded/

Usage:
    python3 review_labels.py                    # Review all unreviewed
    python3 review_labels.py --source intake    # Review only intake labels
    python3 review_labels.py --stats            # Show review stats
    python3 review_labels.py --undo FILENAME    # Restore a discarded image

Requires: pip install pillow
"""

import os
import sys
import json
import shutil
import subprocess
from pathlib import Path
from collections import Counter
from datetime import datetime

TRAINING_DIR = Path(__file__).parent
DATASET_DIR = TRAINING_DIR / "dataset"
VIZ_DIR = TRAINING_DIR / "visualizations"
DISCARD_DIR = DATASET_DIR / "discarded"
LOG_PATH = TRAINING_DIR / "review_log.json"

CLASSES = ["schedule_table", "wall_linear", "floor_area", "door_window", "fixture", "annotation"]
CLASS_COLORS = {
    0: "\033[91m",  # red
    1: "\033[92m",  # green
    2: "\033[94m",  # blue
    3: "\033[95m",  # magenta
    4: "\033[93m",  # yellow
    5: "\033[96m",  # cyan
}
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"


def load_log():
    if LOG_PATH.exists():
        return json.loads(LOG_PATH.read_text())
    return {"reviewed": {}, "stats": {"kept": 0, "discarded": 0, "flagged": 0}}


def save_log(log):
    LOG_PATH.write_text(json.dumps(log, indent=2))


def read_label(label_path):
    """Read YOLO label file, return class counts and box details."""
    counts = Counter()
    boxes = []
    with open(label_path) as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 5:
                cls_id = int(parts[0])
                counts[cls_id] += 1
                boxes.append({
                    "class": cls_id,
                    "cx": float(parts[1]),
                    "cy": float(parts[2]),
                    "w": float(parts[3]),
                    "h": float(parts[4]),
                })
    return counts, boxes


def generate_viz(img_path, label_path, output_path):
    """Generate a visualization overlay showing bounding boxes."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("  PIL not available — install with: pip install pillow")
        return False

    img = Image.open(str(img_path))
    draw = ImageDraw.Draw(img)
    w, h = img.size

    colors = {
        0: "#FF4444", 1: "#44FF44", 2: "#4488FF",
        3: "#FF44FF", 4: "#FFFF44", 5: "#44FFFF",
    }

    counts, boxes = read_label(label_path)
    for box in boxes:
        color = colors.get(box["class"], "#FFFFFF")
        cx, cy, bw, bh = box["cx"] * w, box["cy"] * h, box["w"] * w, box["h"] * h
        x1, y1 = cx - bw/2, cy - bh/2
        x2, y2 = cx + bw/2, cy + bh/2
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        label = f"{CLASSES[box['class']]} " if box["class"] < len(CLASSES) else f"cls{box['class']} "
        draw.text((x1 + 2, y1 + 2), label, fill=color)

    img.save(str(output_path), "JPEG", quality=85)
    return True


def open_image(path):
    """Open image with the system default viewer."""
    if sys.platform == "darwin":
        subprocess.run(["open", str(path)], check=False)
    elif sys.platform == "linux":
        subprocess.run(["xdg-open", str(path)], check=False)
    elif sys.platform == "win32":
        os.startfile(str(path))


def review_image(stem, split, log):
    """Review a single labeled image. Returns action taken."""
    img_path = DATASET_DIR / split / "images" / f"{stem}.jpg"
    lbl_path = DATASET_DIR / split / "labels" / f"{stem}.txt"

    if not img_path.exists() or not lbl_path.exists():
        return None

    counts, boxes = read_label(lbl_path)
    total_boxes = sum(counts.values())

    # Generate visualization
    VIZ_DIR.mkdir(parents=True, exist_ok=True)
    viz_path = VIZ_DIR / f"{stem}_review.jpg"
    if not viz_path.exists():
        generate_viz(img_path, lbl_path, viz_path)

    # Display info
    print(f"\n{'═' * 60}")
    print(f"  {BOLD}{stem}{RESET}")
    print(f"  Split: {split}  |  Boxes: {total_boxes}")
    print(f"  Classes:")
    for cls_id in sorted(counts.keys()):
        name = CLASSES[cls_id] if cls_id < len(CLASSES) else f"unknown_{cls_id}"
        color = CLASS_COLORS.get(cls_id, "")
        print(f"    {color}{cls_id} {name:20s}: {counts[cls_id]:4d} boxes{RESET}")

    # Empty classes in this image
    present = set(counts.keys())
    missing = set(range(6)) - present
    if missing:
        missing_names = [CLASSES[i] for i in sorted(missing)]
        print(f"  {DIM}Not in image: {', '.join(missing_names)}{RESET}")

    # Open visualization
    if viz_path.exists():
        open_image(viz_path)

    # Prompt
    print(f"\n  [k] Keep  [d] Discard  [f] Flag for edit  [s] Skip  [q] Quit")
    while True:
        choice = input(f"  > ").strip().lower()
        if choice in ("k", "d", "f", "s", "q"):
            break
        print(f"  Invalid choice. Use k/d/f/s/q")

    if choice == "q":
        return "quit"

    if choice == "s":
        return "skip"

    # Record decision
    action = {"k": "kept", "d": "discarded", "f": "flagged"}[choice]
    log["reviewed"][stem] = {
        "action": action,
        "split": split,
        "boxes": total_boxes,
        "classes": {CLASSES[k] if k < len(CLASSES) else str(k): v for k, v in counts.items()},
        "timestamp": datetime.now().isoformat(),
    }
    log["stats"][action] = log["stats"].get(action, 0) + 1

    if choice == "d":
        # Move to discarded
        DISCARD_DIR.mkdir(parents=True, exist_ok=True)
        (DISCARD_DIR / "images").mkdir(exist_ok=True)
        (DISCARD_DIR / "labels").mkdir(exist_ok=True)
        shutil.move(str(img_path), str(DISCARD_DIR / "images" / img_path.name))
        shutil.move(str(lbl_path), str(DISCARD_DIR / "labels" / lbl_path.name))
        print(f"  {DIM}Moved to discarded/{RESET}")

    if choice == "f":
        print(f"  {DIM}Flagged for editing — will revisit{RESET}")

    save_log(log)
    return action


def show_stats(log):
    """Display review statistics."""
    stats = log["stats"]
    reviewed = log["reviewed"]
    total = len(reviewed)

    print(f"\n{'═' * 50}")
    print(f"  REVIEW STATISTICS")
    print(f"{'═' * 50}")
    print(f"  Total reviewed:  {total}")
    print(f"  Kept:            {stats.get('kept', 0)}")
    print(f"  Discarded:       {stats.get('discarded', 0)}")
    print(f"  Flagged:         {stats.get('flagged', 0)}")

    if total > 0:
        pct_kept = stats.get('kept', 0) / total * 100
        print(f"\n  Acceptance rate: {pct_kept:.1f}%")

    # Count unreviewed
    all_labels = set()
    for split in ["train", "val"]:
        lbl_dir = DATASET_DIR / split / "labels"
        if lbl_dir.exists():
            all_labels |= {p.stem for p in lbl_dir.glob("*.txt")}
    unreviewed = all_labels - set(reviewed.keys())
    print(f"  Unreviewed:      {len(unreviewed)}")


def undo_discard(filename, log):
    """Restore a discarded image back to the dataset."""
    stem = Path(filename).stem
    entry = log["reviewed"].get(stem)
    if not entry or entry["action"] != "discarded":
        print(f"  {stem} was not discarded")
        return

    split = entry["split"]
    src_img = DISCARD_DIR / "images" / f"{stem}.jpg"
    src_lbl = DISCARD_DIR / "labels" / f"{stem}.txt"
    dst_img = DATASET_DIR / split / "images" / f"{stem}.jpg"
    dst_lbl = DATASET_DIR / split / "labels" / f"{stem}.txt"

    if src_img.exists():
        shutil.move(str(src_img), str(dst_img))
    if src_lbl.exists():
        shutil.move(str(src_lbl), str(dst_lbl))

    del log["reviewed"][stem]
    log["stats"]["discarded"] = max(0, log["stats"].get("discarded", 0) - 1)
    save_log(log)
    print(f"  Restored {stem} to {split}/")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Review auto-labeled training data")
    parser.add_argument("--source", help="Filter by source (e.g., 'intake')")
    parser.add_argument("--stats", action="store_true", help="Show review stats")
    parser.add_argument("--undo", help="Restore a discarded image")
    parser.add_argument("--split", default="all", choices=["train", "val", "all"])
    args = parser.parse_args()

    log = load_log()

    if args.stats:
        show_stats(log)
        return

    if args.undo:
        undo_discard(args.undo, log)
        return

    # Collect unreviewed images
    unreviewed = []
    splits = ["train", "val"] if args.split == "all" else [args.split]
    for split in splits:
        lbl_dir = DATASET_DIR / split / "labels"
        if not lbl_dir.exists():
            continue
        for lbl_path in sorted(lbl_dir.glob("*.txt")):
            stem = lbl_path.stem
            if stem in log["reviewed"]:
                continue
            if args.source and args.source not in stem:
                continue
            unreviewed.append((stem, split))

    if not unreviewed:
        print("No unreviewed images found.")
        show_stats(log)
        return

    print(f"\n{len(unreviewed)} images to review")
    print(f"Overlay images open in your system viewer.\n")

    for i, (stem, split) in enumerate(unreviewed):
        print(f"  [{i+1}/{len(unreviewed)}]", end="")
        result = review_image(stem, split, log)
        if result == "quit":
            print(f"\n  Stopped. {i} of {len(unreviewed)} reviewed.")
            break

    show_stats(log)
    print(f"\nReview log saved to {LOG_PATH}")

    # Clear label caches
    for cache in DATASET_DIR.rglob("labels.cache"):
        cache.unlink()
        print(f"  Cleared cache: {cache}")


if __name__ == "__main__":
    main()
