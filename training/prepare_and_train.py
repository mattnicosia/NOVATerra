#!/usr/bin/env python3
"""
NOVATerra YOLO Training Pipeline

1. Split extracted data into train/val sets (80/20)
2. Create YOLO dataset config
3. Train YOLO v8 Nano
4. Export to ONNX for browser inference
"""

import os
import sys
import random
import shutil
from pathlib import Path
import yaml

DATA_DIR = Path("/Users/mattnicosia/Desktop/BLDG Estimator/training/data")
TRAIN_DIR = Path("/Users/mattnicosia/Desktop/BLDG Estimator/training/dataset")
MODEL_OUTPUT = Path("/Users/mattnicosia/Desktop/BLDG Estimator/training/models")

CLASSES = [
    "wall_linear",
    "wall_area",
    "floor_area",
    "ceiling_area",
    "roof_area",
    "door",
    "window",
    "fixture_plumbing",
    "fixture_electric",
    "fixture_hvac",
    "linear_misc",
    "area_misc",
    "count_misc",
    "site_linear",
    "site_area",
    "site_count",
    "foundation",
    "structural",
]

SPLIT_RATIO = 0.8  # 80% train, 20% val


def prepare_dataset():
    """Split data into train/val and create YOLO directory structure."""
    print("Preparing dataset...")

    # Create YOLO directory structure
    for split in ["train", "val"]:
        (TRAIN_DIR / split / "images").mkdir(parents=True, exist_ok=True)
        (TRAIN_DIR / split / "labels").mkdir(parents=True, exist_ok=True)

    # Get all image files
    images = sorted(list((DATA_DIR / "images").glob("*.jpg")))
    print(f"  Total images: {len(images)}")

    # Filter: only include images that have non-empty label files
    valid_images = []
    for img_path in images:
        label_path = DATA_DIR / "labels" / f"{img_path.stem}.txt"
        if label_path.exists() and label_path.stat().st_size > 0:
            valid_images.append(img_path)

    print(f"  Images with labels: {len(valid_images)}")

    # Shuffle and split
    random.seed(42)
    random.shuffle(valid_images)
    split_idx = int(len(valid_images) * SPLIT_RATIO)
    train_images = valid_images[:split_idx]
    val_images = valid_images[split_idx:]

    print(f"  Train: {len(train_images)}, Val: {len(val_images)}")

    # Copy files
    for split_name, split_images in [("train", train_images), ("val", val_images)]:
        for img_path in split_images:
            # Copy image
            shutil.copy2(img_path, TRAIN_DIR / split_name / "images" / img_path.name)
            # Copy label
            label_name = f"{img_path.stem}.txt"
            label_src = DATA_DIR / "labels" / label_name
            if label_src.exists():
                shutil.copy2(label_src, TRAIN_DIR / split_name / "labels" / label_name)

    # Create dataset YAML config
    dataset_config = {
        "path": str(TRAIN_DIR),
        "train": "train/images",
        "val": "val/images",
        "names": {i: name for i, name in enumerate(CLASSES)},
        "nc": len(CLASSES),
    }

    config_path = TRAIN_DIR / "dataset.yaml"
    with open(config_path, "w") as f:
        yaml.dump(dataset_config, f, default_flow_style=False)

    print(f"  Config saved: {config_path}")
    return config_path


def train_model(config_path):
    """Train YOLO v8 Nano on the dataset."""
    from ultralytics import YOLO

    MODEL_OUTPUT.mkdir(parents=True, exist_ok=True)

    print("\n" + "=" * 60)
    print("TRAINING YOLO v8 Nano")
    print("=" * 60)

    # Load pre-trained YOLOv8 Nano (smallest, fastest — runs in browser)
    model = YOLO("yolov8n.pt")

    # Train
    results = model.train(
        data=str(config_path),
        epochs=100,            # 100 epochs — early stopping will kick in
        imgsz=640,             # Standard YOLO input size
        batch=8,               # Small batch for MacBook memory
        patience=20,           # Stop if no improvement for 20 epochs
        device="mps",          # Use Apple Silicon GPU (Metal Performance Shaders)
        workers=4,
        project=str(MODEL_OUTPUT),
        name="nova_takeoff_v1",
        exist_ok=True,
        # Augmentation for construction drawings
        hsv_h=0.0,            # No hue shift (drawings are black/white)
        hsv_s=0.0,            # No saturation shift
        hsv_v=0.2,            # Slight brightness variation
        degrees=0.0,          # No rotation (plans are always upright)
        translate=0.1,        # Slight translation
        scale=0.3,            # Scale variation (different zoom levels)
        flipud=0.0,           # No vertical flip (plans have orientation)
        fliplr=0.5,           # Horizontal flip OK (buildings are symmetric-ish)
        mosaic=0.5,           # Mosaic augmentation
        mixup=0.0,            # No mixup (confuses line drawings)
        verbose=True,
    )

    print(f"\nTraining complete!")
    print(f"Best model: {MODEL_OUTPUT}/nova_takeoff_v1/weights/best.pt")

    return results


def export_to_onnx():
    """Export trained model to ONNX for browser inference."""
    from ultralytics import YOLO

    best_model_path = MODEL_OUTPUT / "nova_takeoff_v1" / "weights" / "best.pt"
    if not best_model_path.exists():
        print(f"No trained model found at {best_model_path}")
        return

    print("\n" + "=" * 60)
    print("EXPORTING TO ONNX")
    print("=" * 60)

    model = YOLO(str(best_model_path))

    # Export to ONNX (for ONNX Runtime Web in browser)
    model.export(
        format="onnx",
        imgsz=640,
        simplify=True,
        dynamic=False,        # Fixed input size for browser
        opset=12,             # Compatible with ONNX Runtime Web
    )

    onnx_path = best_model_path.with_suffix(".onnx")
    if onnx_path.exists():
        size_mb = onnx_path.stat().st_size / (1024 * 1024)
        print(f"ONNX model: {onnx_path} ({size_mb:.1f} MB)")

        # Copy to app public directory for browser loading
        app_model_dir = Path("/Users/mattnicosia/Desktop/BLDG Estimator/app/public/models")
        app_model_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(onnx_path, app_model_dir / "nova_takeoff_v1.onnx")
        print(f"Copied to app: {app_model_dir / 'nova_takeoff_v1.onnx'}")
    else:
        print("ONNX export failed — file not found")


def main():
    # Step 1: Prepare dataset
    config_path = prepare_dataset()

    # Step 2: Train
    train_model(config_path)

    # Step 3: Export to ONNX
    export_to_onnx()

    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print(f"  Dataset: {TRAIN_DIR}")
    print(f"  Model: {MODEL_OUTPUT}/nova_takeoff_v1/")
    print(f"  ONNX: app/public/models/nova_takeoff_v1.onnx")
    print(f"\nNext: wire into BlueprintTab.jsx for 'Scan Walls' button")


if __name__ == "__main__":
    main()
