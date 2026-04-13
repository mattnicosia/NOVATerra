#!/usr/bin/env python3
"""
NOVATerra YOLO Training Pipeline (v2 — 6-class system)
═══════════════════════════════════════════════════════

1. Validate dataset integrity (images ↔ labels match)
2. Report class distribution with balance warnings
3. Train YOLOv8 Nano on 6-class construction drawing dataset
4. Export to ONNX for browser inference (onnxruntime-web)
5. Copy ONNX model to app/public/models/

Classes:
  0: schedule_table  — tables, schedules, legends
  1: wall_linear     — wall line segments
  2: floor_area      — floors, slabs, ceiling areas
  3: door_window     — doors and windows
  4: fixture         — plumbing, electrical, HVAC
  5: annotation      — dimensions, notes, callouts

Usage:
    python3 prepare_and_train.py              # Full pipeline
    python3 prepare_and_train.py --validate   # Validate only
    python3 prepare_and_train.py --export     # Export only (skip training)
    python3 prepare_and_train.py --epochs 50  # Custom epochs
"""

import os
import sys
import json
import shutil
from pathlib import Path
from collections import Counter
import yaml

TRAINING_DIR = Path(__file__).parent
DATASET_DIR = TRAINING_DIR / "dataset"
MODEL_DIR = TRAINING_DIR / "models"
APP_DIR = TRAINING_DIR.parent / "app"
APP_MODELS_DIR = APP_DIR / "public" / "models"

CLASSES = ["schedule_table", "wall_linear", "floor_area", "door_window", "fixture", "annotation"]
NC = len(CLASSES)


def validate_dataset():
    """Check dataset integrity — images have labels, labels have images."""
    print("=" * 60)
    print("VALIDATING DATASET")
    print("=" * 60)

    issues = []
    total_stats = Counter()
    total_images = 0

    for split in ["train", "val"]:
        img_dir = DATASET_DIR / split / "images"
        lbl_dir = DATASET_DIR / split / "labels"

        if not img_dir.exists():
            issues.append(f"Missing: {img_dir}")
            continue

        images = {p.stem for p in img_dir.glob("*.jpg")}
        labels = {p.stem for p in lbl_dir.glob("*.txt")}

        # Images without labels
        no_labels = images - labels
        if no_labels:
            issues.append(f"{split}: {len(no_labels)} images without labels")

        # Labels without images
        no_images = labels - images
        if no_images:
            issues.append(f"{split}: {len(no_images)} labels without images")

        # Count class distribution
        split_stats = Counter()
        for lbl_file in sorted(lbl_dir.glob("*.txt")):
            with open(lbl_file) as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        cls_id = int(parts[0])
                        split_stats[cls_id] += 1

        total_images += len(images & labels)
        total_stats += split_stats

        print(f"\n  {split}: {len(images)} images, {len(labels)} labels")
        for cls_id in range(NC):
            count = split_stats.get(cls_id, 0)
            print(f"    {cls_id} {CLASSES[cls_id]:20s}: {count:6d} boxes")

    print(f"\n  TOTAL: {total_images} valid image-label pairs")
    total_boxes = sum(total_stats.values())
    print(f"\n  Class distribution (overall):")
    for cls_id in range(NC):
        count = total_stats.get(cls_id, 0)
        pct = (count / total_boxes * 100) if total_boxes > 0 else 0
        bar = "█" * int(pct / 2) + "░" * (50 - int(pct / 2))
        status = "⚠ EMPTY" if count == 0 else ("⚠ LOW" if pct < 5 else "✓")
        print(f"    {cls_id} {CLASSES[cls_id]:20s}: {count:6d} ({pct:5.1f}%) {bar} {status}")

    if issues:
        print(f"\n  Issues found:")
        for issue in issues:
            print(f"    ⚠ {issue}")

    # Balance warnings
    empty_classes = [CLASSES[i] for i in range(NC) if total_stats.get(i, 0) == 0]
    if empty_classes:
        print(f"\n  ⚠ CRITICAL: Empty classes: {', '.join(empty_classes)}")
        print(f"    Run autolabel.py to generate training data for these classes.")

    return total_stats, total_images, issues


def update_dataset_yaml():
    """Ensure dataset.yaml matches current config."""
    config = {
        "path": str(DATASET_DIR),
        "train": "train/images",
        "val": "val/images",
        "nc": NC,
        "names": {i: name for i, name in enumerate(CLASSES)},
    }

    yaml_path = DATASET_DIR / "dataset.yaml"
    with open(yaml_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)

    print(f"\n  Updated {yaml_path}")
    return yaml_path


def train_model(config_path, epochs=100, resume=False):
    """Train YOLOv8 Nano on the 6-class dataset."""
    from ultralytics import YOLO

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    print("\n" + "=" * 60)
    print("TRAINING YOLOv8 NANO — 6-CLASS CONSTRUCTION DRAWING DETECTOR")
    print("=" * 60)

    # Resume from last checkpoint if requested
    if resume:
        last_path = MODEL_DIR / "nova_takeoff_v2" / "weights" / "last.pt"
        if last_path.exists():
            print(f"  Resuming from {last_path}")
            model = YOLO(str(last_path))
        else:
            print(f"  No checkpoint found, starting fresh")
            model = YOLO("yolov8n.pt")
    else:
        model = YOLO("yolov8n.pt")

    results = model.train(
        data=str(config_path),
        epochs=epochs,
        imgsz=640,
        batch=8,
        patience=20,
        device="cpu",  # CPU — MPS has shape mismatch bugs in TAL loss
        workers=4,
        project=str(MODEL_DIR),
        name="nova_takeoff_v2",
        exist_ok=True,
        # Construction drawing augmentation
        hsv_h=0.0,       # No hue shift (drawings are grayscale)
        hsv_s=0.0,       # No saturation shift
        hsv_v=0.2,       # Slight brightness variation
        degrees=0.0,     # No rotation (plans are always oriented)
        translate=0.1,   # Slight translation
        scale=0.3,       # Scale variation (different zoom levels)
        flipud=0.0,      # No vertical flip
        fliplr=0.5,      # Horizontal flip OK
        mosaic=0.5,      # Mosaic augmentation
        mixup=0.0,       # No mixup (confuses line drawings)
        copy_paste=0.0,  # No copy-paste
        # Class balancing
        cls=1.0,         # Classification loss weight
        box=7.5,         # Box regression loss weight
        verbose=True,
    )

    print(f"\nTraining complete!")
    print(f"Best model: {MODEL_DIR}/nova_takeoff_v2/weights/best.pt")

    # ── Extract and persist evaluation metrics ──
    try:
        metrics = extract_training_metrics()
        if metrics:
            import json
            metrics_path = MODEL_DIR / "nova_takeoff_v2" / "evaluation.json"
            with open(metrics_path, "w") as f:
                json.dump(metrics, f, indent=2)
            print(f"\n  Evaluation metrics saved: {metrics_path}")
            print(f"    mAP50: {metrics.get('mAP50', 'N/A')}")
            print(f"    mAP50-95: {metrics.get('mAP50_95', 'N/A')}")
            print(f"    Precision: {metrics.get('precision', 'N/A')}")
            print(f"    Recall: {metrics.get('recall', 'N/A')}")
    except Exception as e:
        print(f"  Warning: Could not extract metrics: {e}")

    return results


def extract_training_metrics():
    """Parse results.csv and extract final/best training metrics."""
    import csv

    results_csv = MODEL_DIR / "nova_takeoff_v2" / "results.csv"
    if not results_csv.exists():
        return None

    rows = []
    with open(results_csv) as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    if not rows:
        return None

    # Find best epoch by mAP50
    best_epoch = max(rows, key=lambda r: float(r.get("metrics/mAP50(B)", 0)))
    last_epoch = rows[-1]

    # Build training curve data (loss + metrics per epoch)
    training_curve = []
    for row in rows:
        training_curve.append({
            "epoch": int(row.get("epoch", 0)),
            "train_box_loss": round(float(row.get("train/box_loss", 0)), 4),
            "train_cls_loss": round(float(row.get("train/cls_loss", 0)), 4),
            "val_box_loss": round(float(row.get("val/box_loss", 0)), 4),
            "val_cls_loss": round(float(row.get("val/cls_loss", 0)), 4),
            "mAP50": round(float(row.get("metrics/mAP50(B)", 0)), 4),
            "mAP50_95": round(float(row.get("metrics/mAP50-95(B)", 0)), 4),
            "precision": round(float(row.get("metrics/precision(B)", 0)), 4),
            "recall": round(float(row.get("metrics/recall(B)", 0)), 4),
        })

    metrics = {
        "mAP50": round(float(best_epoch.get("metrics/mAP50(B)", 0)), 4),
        "mAP50_95": round(float(best_epoch.get("metrics/mAP50-95(B)", 0)), 4),
        "precision": round(float(best_epoch.get("metrics/precision(B)", 0)), 4),
        "recall": round(float(best_epoch.get("metrics/recall(B)", 0)), 4),
        "bestEpoch": int(best_epoch.get("epoch", 0)),
        "totalEpochs": len(rows),
        "finalTrainLoss": round(
            float(last_epoch.get("train/box_loss", 0)) +
            float(last_epoch.get("train/cls_loss", 0)) +
            float(last_epoch.get("train/dfl_loss", 0)), 4
        ),
        "finalValLoss": round(
            float(last_epoch.get("val/box_loss", 0)) +
            float(last_epoch.get("val/cls_loss", 0)) +
            float(last_epoch.get("val/dfl_loss", 0)), 4
        ),
        "trainingCurve": training_curve,
    }

    return metrics


def export_to_onnx():
    """Export trained model to ONNX for browser inference via onnxruntime-web."""
    from ultralytics import YOLO

    # Try v2 first, fall back to v1
    best_path = MODEL_DIR / "nova_takeoff_v2" / "weights" / "best.pt"
    if not best_path.exists():
        best_path = MODEL_DIR / "nova_takeoff_v1" / "weights" / "best.pt"
    if not best_path.exists():
        print("No trained model found. Run training first.")
        return None

    print("\n" + "=" * 60)
    print("EXPORTING TO ONNX (for onnxruntime-web)")
    print("=" * 60)

    model = YOLO(str(best_path))

    # Export to ONNX with settings optimized for browser
    model.export(
        format="onnx",
        imgsz=640,
        simplify=True,      # Simplify graph for faster inference
        dynamic=False,       # Fixed input size — simpler for browser
        opset=12,            # Compatible with onnxruntime-web
        half=False,          # Full precision (no FP16 in browser ONNX RT)
    )

    onnx_path = best_path.with_suffix(".onnx")
    if not onnx_path.exists():
        print("ONNX export failed — file not found")
        return None

    size_mb = onnx_path.stat().st_size / (1024 * 1024)
    print(f"  ONNX model: {onnx_path} ({size_mb:.1f} MB)")

    # Copy to app/public/models/
    APP_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    dest = APP_MODELS_DIR / "nova_takeoff_v2.onnx"
    shutil.copy2(onnx_path, dest)
    print(f"  Copied to: {dest}")

    # Also generate a metadata JSON for the browser loader
    # Load evaluation metrics if available
    eval_metrics = {}
    eval_path = MODEL_DIR / "nova_takeoff_v2" / "evaluation.json"
    if not eval_path.exists():
        eval_path = best_path.parent.parent / "evaluation.json"
    if eval_path.exists():
        eval_metrics = json.loads(eval_path.read_text())

    metadata = {
        "model": "nova_takeoff_v2",
        "format": "onnx",
        "opset": 12,
        "input_size": 640,
        "num_classes": NC,
        "classes": CLASSES,
        "source_weights": str(best_path.name),
        "size_mb": round(size_mb, 1),
        "status": "deployed",
        "exported": __import__("datetime").datetime.now().isoformat(),
        "evaluation": eval_metrics,
    }
    meta_path = APP_MODELS_DIR / "nova_takeoff_v2.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"  Metadata: {meta_path}")
    if eval_metrics.get("mAP50"):
        print(f"  Includes evaluation: mAP50={eval_metrics['mAP50']}, precision={eval_metrics.get('precision', 'N/A')}")

    return dest


def main():
    import argparse
    parser = argparse.ArgumentParser(description="NOVATerra YOLO training pipeline")
    parser.add_argument("--validate", action="store_true", help="Validate dataset only")
    parser.add_argument("--export", action="store_true", help="Export ONNX only (skip training)")
    parser.add_argument("--epochs", type=int, default=100, help="Training epochs")
    parser.add_argument("--resume", action="store_true", help="Resume from last checkpoint")
    args = parser.parse_args()

    # Step 1: Validate
    stats, n_images, issues = validate_dataset()

    if args.validate:
        return

    # Step 2: Update dataset.yaml
    config_path = update_dataset_yaml()

    if args.export:
        # Skip training, just export
        onnx_path = export_to_onnx()
        if onnx_path:
            print(f"\n✓ ONNX model ready at {onnx_path}")
        return

    # Check for empty classes
    empty = [CLASSES[i] for i in range(NC) if stats.get(i, 0) == 0]
    if empty:
        print(f"\n⚠ WARNING: Classes with zero examples: {', '.join(empty)}")
        print(f"  Training will proceed but model won't learn these classes.")
        print(f"  Run autolabel.py first to generate data for missing classes.")
        resp = input("  Continue anyway? [y/N] ")
        if resp.lower() != "y":
            return

    # Step 3: Train
    train_model(config_path, epochs=args.epochs, resume=args.resume)

    # Step 4: Export
    onnx_path = export_to_onnx()

    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print(f"  Dataset: {DATASET_DIR} ({n_images} images)")
    print(f"  Model: {MODEL_DIR}/nova_takeoff_v2/")
    if onnx_path:
        print(f"  ONNX: {onnx_path}")
    print(f"\n  Next: The browser will auto-load from app/public/models/nova_takeoff_v2.onnx")


if __name__ == "__main__":
    main()
