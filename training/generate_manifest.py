#!/usr/bin/env python3
"""
Generate a JSON manifest of all training data for the admin dashboard.

Reads every image and label file in the dataset, extracts:
  - Project name (from filename)
  - Page number
  - Classes present and box counts
  - Split (train/val)

Outputs to app/public/models/training-manifest.json

Usage:
    python3 generate_manifest.py
"""

import json
from pathlib import Path
from collections import Counter, defaultdict

TRAINING_DIR = Path(__file__).parent
DATASET_DIR = TRAINING_DIR / "dataset"
INTAKE_DIR = TRAINING_DIR / "intake-template" / "plan-sets"
ARCHIVE_DIR = TRAINING_DIR / "archive" / "old-data" / "data"
CORPUS_DIR = TRAINING_DIR / "corpus" / "dropbox-estimating"
OUTPUT = TRAINING_DIR.parent / "app" / "public" / "models" / "training-manifest.json"

CLASSES = ["schedule_table", "wall_linear", "floor_area", "door_window", "fixture", "annotation"]


def parse_filename(stem):
    """Extract project name and page number from image filename."""
    # Pattern: ProjectName_p001 or ProjectName_p01
    parts = stem.rsplit("_p", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return parts[0].replace("_", " "), int(parts[1])
    # Intake pattern: intake_ProjectName_PdfName_p001
    if stem.startswith("intake_"):
        rest = stem[7:]  # strip "intake_"
        parts = rest.rsplit("_p", 1)
        if len(parts) == 2 and parts[1].isdigit():
            # Further split project from pdf name
            subparts = parts[0].split("_", 1)
            project = subparts[0].replace("_", " ") if len(subparts) > 0 else rest
            return f"[Intake] {project}", int(parts[1])
    return stem.replace("_", " "), 0


def read_label_file(path):
    """Read a YOLO label file and return class counts + total boxes."""
    counts = Counter()
    boxes = []
    with open(path) as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 5:
                cls_id = int(parts[0])
                counts[cls_id] += 1
                boxes.append({
                    "class": cls_id,
                    "x": round(float(parts[1]), 4),
                    "y": round(float(parts[2]), 4),
                    "w": round(float(parts[3]), 4),
                    "h": round(float(parts[4]), 4),
                })
    return counts, boxes


def scan_dataset():
    """Scan dataset/train and dataset/val for all images and labels."""
    images = []
    projects = defaultdict(lambda: {
        "name": "",
        "images": 0,
        "train": 0,
        "val": 0,
        "boxes": 0,
        "classCounts": Counter(),
        "pages": [],
    })

    for split in ["train", "val"]:
        img_dir = DATASET_DIR / split / "images"
        lbl_dir = DATASET_DIR / split / "labels"
        if not img_dir.exists():
            continue

        for img_path in sorted(img_dir.glob("*.jpg")):
            stem = img_path.stem
            project_name, page_num = parse_filename(stem)
            lbl_path = lbl_dir / f"{stem}.txt"

            class_counts = Counter()
            box_count = 0
            if lbl_path.exists():
                class_counts, boxes = read_label_file(lbl_path)
                box_count = len(boxes)

            img_record = {
                "filename": stem,
                "project": project_name,
                "page": page_num,
                "split": split,
                "boxes": box_count,
                "classCounts": {CLASSES[k]: v for k, v in class_counts.items() if k < len(CLASSES)},
            }
            images.append(img_record)

            # Aggregate to project
            p = projects[project_name]
            p["name"] = project_name
            p["images"] += 1
            p[split] += 1
            p["boxes"] += box_count
            p["classCounts"] += class_counts
            p["pages"].append(page_num)

    return images, projects


def scan_intake_projects():
    """List intake template projects and their PDFs."""
    intake_projects = []
    if not INTAKE_DIR.exists():
        return intake_projects

    for project_dir in sorted(INTAKE_DIR.iterdir()):
        if not project_dir.is_dir() or project_dir.name == "project-template":
            continue

        drawings_dir = project_dir / "drawings"
        pdfs = []
        if drawings_dir.exists():
            pdfs = [f.name for f in sorted(drawings_dir.glob("*.pdf"))]

        intake_projects.append({
            "name": project_dir.name,
            "pdfs": pdfs,
            "pdfCount": len(pdfs),
            "status": "ready",
        })

    return intake_projects


def scan_corpus():
    """Read corpus ingestion summary."""
    corpus_info = {
        "sources": [],
        "totalFiles": 0,
        "totalLineItems": 0,
    }

    # Check for master ingestion output
    master_dir = CORPUS_DIR / "master-ingestion-output"
    if master_dir.exists():
        # Read CSV row counts
        for csv_file in sorted(master_dir.glob("*.csv")):
            try:
                with open(csv_file) as f:
                    rows = sum(1 for _ in f) - 1  # subtract header
                corpus_info["sources"].append({
                    "file": csv_file.name,
                    "rows": max(0, rows),
                })
                if "line_item" in csv_file.name:
                    corpus_info["totalLineItems"] = max(0, rows)
                corpus_info["totalFiles"] += 1
            except Exception:
                pass

    # Read project list from projects.csv
    projects_csv = master_dir / "projects.csv"
    if projects_csv.exists():
        try:
            import csv
            with open(projects_csv) as f:
                reader = csv.DictReader(f)
                corpus_info["projects"] = []
                for row in reader:
                    name = row.get("project_name") or row.get("name") or row.get("Project") or ""
                    if name:
                        corpus_info["projects"].append(name)
        except Exception:
            pass

    return corpus_info


def main():
    print("Scanning training dataset...")
    images, projects = scan_dataset()

    print("Scanning intake template projects...")
    intake = scan_intake_projects()

    print("Scanning estimating corpus...")
    corpus = scan_corpus()

    # Build per-project summary
    project_list = []
    for name, data in sorted(projects.items(), key=lambda x: -x[1]["images"]):
        project_list.append({
            "name": data["name"],
            "images": data["images"],
            "train": data["train"],
            "val": data["val"],
            "boxes": data["boxes"],
            "avgBoxesPerImage": round(data["boxes"] / max(1, data["images"]), 1),
            "pageRange": [min(data["pages"]) if data["pages"] else 0, max(data["pages"]) if data["pages"] else 0],
            "classCounts": {CLASSES[k]: v for k, v in data["classCounts"].items() if k < len(CLASSES)},
        })

    # Global class totals
    global_counts = Counter()
    for img in images:
        for cls_name, count in img["classCounts"].items():
            global_counts[cls_name] += count

    # Load evaluation metrics if they exist
    evaluation = {}
    for model_name in ["nova_takeoff_v2", "nova_takeoff_v1"]:
        eval_path = TRAINING_DIR / "models" / model_name / "evaluation.json"
        if eval_path.exists():
            evaluation = json.loads(eval_path.read_text())
            evaluation["modelName"] = model_name
            break
        # Also try reading results.csv directly
        results_csv = TRAINING_DIR / "models" / model_name / "results.csv"
        if results_csv.exists() and not evaluation:
            import csv
            rows = []
            with open(results_csv) as f:
                reader = csv.DictReader(f)
                for row in reader:
                    rows.append(row)
            if rows:
                best = max(rows, key=lambda r: float(r.get("metrics/mAP50(B)", 0)))
                evaluation = {
                    "modelName": model_name,
                    "mAP50": round(float(best.get("metrics/mAP50(B)", 0)), 4),
                    "mAP50_95": round(float(best.get("metrics/mAP50-95(B)", 0)), 4),
                    "precision": round(float(best.get("metrics/precision(B)", 0)), 4),
                    "recall": round(float(best.get("metrics/recall(B)", 0)), 4),
                    "bestEpoch": int(best.get("epoch", 0)),
                    "totalEpochs": len(rows),
                    "trainingCurve": [{
                        "epoch": int(r.get("epoch", 0)),
                        "mAP50": round(float(r.get("metrics/mAP50(B)", 0)), 4),
                        "precision": round(float(r.get("metrics/precision(B)", 0)), 4),
                        "recall": round(float(r.get("metrics/recall(B)", 0)), 4),
                        "train_loss": round(float(r.get("train/box_loss", 0)) + float(r.get("train/cls_loss", 0)), 4),
                        "val_loss": round(float(r.get("val/box_loss", 0)) + float(r.get("val/cls_loss", 0)), 4),
                    } for r in rows],
                }
                break

    # Build manifest
    manifest = {
        "generated": __import__("datetime").datetime.now().isoformat(),
        "classes": CLASSES,
        "summary": {
            "totalImages": len(images),
            "trainImages": sum(1 for i in images if i["split"] == "train"),
            "valImages": sum(1 for i in images if i["split"] == "val"),
            "totalBoxes": sum(i["boxes"] for i in images),
            "avgBoxesPerImage": round(sum(i["boxes"] for i in images) / max(1, len(images)), 1),
            "projectCount": len(projects),
            "classTotals": dict(global_counts),
        },
        "evaluation": evaluation,
        "projects": project_list,
        "images": images,
        "intake": intake,
        "corpus": corpus,
    }

    # Write output
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w") as f:
        json.dump(manifest, f, indent=2)

    size_kb = OUTPUT.stat().st_size / 1024
    print(f"\nManifest written: {OUTPUT} ({size_kb:.0f} KB)")
    print(f"  {len(images)} images across {len(projects)} projects")
    print(f"  {sum(i['boxes'] for i in images)} total boxes")
    print(f"  Class distribution:")
    for cls_name in CLASSES:
        count = global_counts.get(cls_name, 0)
        pct = count / max(1, sum(global_counts.values())) * 100
        print(f"    {cls_name:20s}: {count:6d} ({pct:.1f}%)")


if __name__ == "__main__":
    main()
