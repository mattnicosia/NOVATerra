#!/usr/bin/env python3
"""
NOVATerra Label Migration — 18-class → 6-class

Reads existing YOLO labels from dataset/train/labels and dataset/val/labels,
remaps class IDs per config.yaml, and overwrites in place.

Also generates a report of class distribution before/after.

Usage:
    python3 relabel.py [--dry-run]
"""

import os
import sys
import yaml
from pathlib import Path
from collections import Counter

TRAINING_DIR = Path(__file__).parent
CONFIG_PATH = TRAINING_DIR / "config.yaml"
DATASET_DIR = TRAINING_DIR / "dataset"

OLD_CLASSES = [
    "wall_linear", "wall_area", "floor_area", "ceiling_area", "roof_area",
    "door", "window", "fixture_plumbing", "fixture_electric", "fixture_hvac",
    "linear_misc", "area_misc", "count_misc", "site_linear", "site_area",
    "site_count", "foundation", "structural",
]

NEW_CLASSES = [
    "schedule_table", "wall_linear", "floor_area",
    "door_window", "fixture", "annotation",
]


def load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def build_class_map(config):
    """Build old_id → new_id mapping from config."""
    migration = config["class_migration"]
    return {int(k): int(v) for k, v in migration.items()}


def process_label_file(label_path, class_map, dry_run=False):
    """Read a YOLO label file, remap classes, return stats."""
    old_counts = Counter()
    new_counts = Counter()
    new_lines = []
    dropped = 0

    with open(label_path) as f:
        lines = f.readlines()

    for line in lines:
        parts = line.strip().split()
        if len(parts) < 5:
            continue

        old_class = int(parts[0])
        old_counts[old_class] += 1

        if old_class in class_map:
            new_class = class_map[old_class]
            new_counts[new_class] += 1
            parts[0] = str(new_class)
            new_lines.append(" ".join(parts))
        else:
            dropped += 1

    if not dry_run:
        with open(label_path, "w") as f:
            f.write("\n".join(new_lines))
            if new_lines:
                f.write("\n")

    return old_counts, new_counts, dropped


def main():
    dry_run = "--dry-run" in sys.argv
    config = load_config()
    class_map = build_class_map(config)

    if dry_run:
        print("DRY RUN — no files will be modified\n")

    print("Class Migration Map:")
    for old_id, new_id in sorted(class_map.items()):
        print(f"  {old_id:2d} ({OLD_CLASSES[old_id]:20s}) → {new_id} ({NEW_CLASSES[new_id]})")
    print()

    total_old = Counter()
    total_new = Counter()
    total_files = 0
    total_dropped = 0

    for split in ["train", "val"]:
        labels_dir = DATASET_DIR / split / "labels"
        if not labels_dir.exists():
            print(f"  SKIP: {labels_dir} not found")
            continue

        label_files = sorted(labels_dir.glob("*.txt"))
        print(f"Processing {split}: {len(label_files)} label files")

        for lf in label_files:
            old_c, new_c, dropped = process_label_file(lf, class_map, dry_run)
            total_old += old_c
            total_new += new_c
            total_files += 1
            total_dropped += dropped

    print(f"\n{'='*60}")
    print(f"RESULTS: {total_files} files processed, {total_dropped} labels dropped")
    print(f"{'='*60}")

    print("\nBEFORE (18-class):")
    for cls_id in sorted(total_old.keys()):
        name = OLD_CLASSES[cls_id] if cls_id < len(OLD_CLASSES) else f"unknown_{cls_id}"
        print(f"  {cls_id:2d} {name:20s}: {total_old[cls_id]:6d} boxes")

    print(f"\nAFTER (6-class):")
    for cls_id in sorted(total_new.keys()):
        name = NEW_CLASSES[cls_id] if cls_id < len(NEW_CLASSES) else f"unknown_{cls_id}"
        pct = total_new[cls_id] / sum(total_new.values()) * 100
        print(f"  {cls_id} {name:20s}: {total_new[cls_id]:6d} boxes ({pct:.1f}%)")

    total_boxes = sum(total_new.values())
    print(f"\nTotal boxes: {total_boxes}")

    if dry_run:
        print("\n⚠️  DRY RUN — run without --dry-run to apply changes")


if __name__ == "__main__":
    main()
