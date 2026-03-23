#!/usr/bin/env python3
"""
NOVATerra Training Data Extractor

Processes PlanSwift/OST takeoff PDFs into YOLO training data.
Each PDF page has a floor plan with a single colored overlay = one training example.

Pipeline:
1. Convert PDF pages to images (via pdftoppm)
2. Separate clean drawing (black lines) from colored overlay (takeoff regions)
3. Detect overlay bounding boxes
4. Extract legend text for class labels
5. Output YOLO-format annotations

Usage:
    python3 extract_training_data.py /path/to/takeoffs/ /path/to/output/
"""

import os
import sys
import json
import numpy as np
import cv2
from pdf2image import convert_from_path
from pathlib import Path

# YOLO classes we want to detect
CLASSES = [
    "wall_linear",      # 0 - wall segments (LF)
    "wall_area",         # 1 - wall areas (SF)
    "floor_area",        # 2 - flooring/slab areas (SF)
    "ceiling_area",      # 3 - ceiling areas (SF)
    "roof_area",         # 4 - roofing areas (SF)
    "door",              # 5 - door counts (EA)
    "window",            # 6 - window counts (EA)
    "fixture_plumbing",  # 7 - plumbing fixtures (EA)
    "fixture_electric",  # 8 - electrical fixtures (EA)
    "fixture_hvac",      # 9 - HVAC equipment (EA)
    "linear_misc",       # 10 - misc linear (trim, conduit, piping)
    "area_misc",         # 11 - misc area (siding, cladding)
    "count_misc",        # 12 - misc counts
    "site_linear",       # 13 - site work linear (silt fence, etc.)
    "site_area",         # 14 - site work area
    "site_count",        # 15 - site work count
    "foundation",        # 16 - foundation elements
    "structural",        # 17 - structural elements
]

# Keywords to classify takeoff items into YOLO classes
CLASS_KEYWORDS = {
    0: ["wall", "partition", "drywall", "gwb", "framing", "stud"],
    1: ["wall area", "wall cladding", "siding", "exterior wall"],
    2: ["floor", "slab", "vct", "carpet", "tile", "epoxy", "concrete slab", "sog"],
    3: ["ceiling", "act", "acoustic", "gypsum ceiling"],
    4: ["roof", "shingle", "membrane", "flashing", "roofing"],
    5: ["door", "hollow metal", "hm frame"],
    6: ["window", "glazing", "storefront", "curtainwall"],
    7: ["plumbing", "toilet", "sink", "lav", "urinal", "water heater", "faucet"],
    8: ["electric", "outlet", "switch", "light", "fixture", "panel", "receptacle", "sensor", "smoke", "speaker"],
    9: ["hvac", "diffuser", "grille", "duct", "air handler", "condenser", "fan", "thermostat", "mini split"],
    10: ["trim", "base", "molding", "conduit", "pipe", "piping", "handrail", "guardrail", "aluminum"],
    11: ["cladding", "backsplash", "frp", "wainscot", "paneling"],
    12: ["access panel", "fire extinguisher", "signage", "bollard"],
    13: ["silt fence", "tree protection", "erosion", "sediment"],
    14: ["disturbance", "staging", "stockpile"],
    15: ["inlet", "construction entrance", "manhole"],
    16: ["footing", "foundation", "frost wall", "spread footing", "grade beam"],
    17: ["steel", "beam", "column", "joist", "header", "lvl", "structural"],
}


def classify_item(legend_text):
    """Classify a takeoff item into a YOLO class based on keywords."""
    text = legend_text.lower()
    for class_id, keywords in CLASS_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                return class_id
    return 12  # default to count_misc


def extract_overlay_mask(image_rgb):
    """
    Separate colored overlay from black line drawing.

    Construction drawings are black lines on white background.
    Takeoff overlays are saturated colors (blue, red, green, purple, yellow, cyan).

    Returns: binary mask where 1 = overlay region, 0 = drawing/background
    """
    hsv = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2HSV)

    # Overlay pixels have high saturation (> 40) and are not too dark or too bright
    # Black lines: S=0, V=0-50
    # White background: S=0, V=200-255
    # Colored overlay: S>40, V>50
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]

    # Mask: saturated pixels that aren't pure white or pure black
    overlay_mask = (saturation > 30) & (value > 40) & (value < 250)

    # Clean up noise with morphological operations
    kernel = np.ones((5, 5), np.uint8)
    overlay_mask = overlay_mask.astype(np.uint8) * 255
    overlay_mask = cv2.morphologyEx(overlay_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    overlay_mask = cv2.morphologyEx(overlay_mask, cv2.MORPH_OPEN, kernel, iterations=1)

    return overlay_mask


def extract_clean_drawing(image_rgb, overlay_mask):
    """
    Remove the colored overlay to get the clean black-line drawing.
    Replace overlay pixels with white background.
    """
    clean = image_rgb.copy()
    clean[overlay_mask > 0] = [255, 255, 255]  # Replace overlay with white
    return clean


def find_overlay_bboxes(overlay_mask, min_area=500):
    """
    Find bounding boxes of overlay regions.
    Returns list of (x, y, w, h) tuples.
    """
    contours, _ = cv2.findContours(overlay_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    bboxes = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        bboxes.append((x, y, w, h))

    return bboxes


def bbox_to_yolo(bbox, img_w, img_h):
    """Convert (x, y, w, h) to YOLO format (center_x, center_y, w, h) normalized 0-1."""
    x, y, w, h = bbox
    cx = (x + w / 2) / img_w
    cy = (y + h / 2) / img_h
    nw = w / img_w
    nh = h / img_h
    return cx, cy, nw, nh


def save_segmentation_mask(overlay_mask, output_path):
    """Save the overlay mask as a segmentation label image."""
    cv2.imwrite(str(output_path), overlay_mask)


def process_pdf(pdf_path, output_dir, dpi=150):
    """
    Process a single PDF into training data.

    For each page:
    1. Render to image
    2. Extract overlay mask
    3. Generate clean drawing (input image)
    4. Generate YOLO annotations (labels)
    5. Save segmentation mask
    """
    pdf_name = Path(pdf_path).stem
    print(f"\n{'='*60}")
    print(f"Processing: {pdf_name}")
    print(f"{'='*60}")

    # Create output subdirectories
    images_dir = output_dir / "images"
    labels_dir = output_dir / "labels"
    masks_dir = output_dir / "masks"
    clean_dir = output_dir / "clean_drawings"
    overlay_dir = output_dir / "overlays"

    for d in [images_dir, labels_dir, masks_dir, clean_dir, overlay_dir]:
        d.mkdir(parents=True, exist_ok=True)

    # Convert PDF to images
    try:
        pages = convert_from_path(str(pdf_path), dpi=dpi)
    except Exception as e:
        print(f"  ERROR converting PDF: {e}")
        return 0

    print(f"  {len(pages)} pages")

    processed = 0
    skipped = 0

    for i, page_img in enumerate(pages):
        page_num = i + 1
        img_rgb = np.array(page_img)
        img_h, img_w = img_rgb.shape[:2]

        # Extract overlay mask
        overlay_mask = extract_overlay_mask(img_rgb)

        # Check if this page has meaningful overlay content
        overlay_pixels = np.sum(overlay_mask > 0)
        overlay_pct = overlay_pixels / (img_w * img_h) * 100

        if overlay_pct < 0.05:
            # Less than 0.05% overlay — probably a blank page or legend-only
            skipped += 1
            continue

        if overlay_pct > 60:
            # More than 60% overlay — probably the full drawing is colored (not useful)
            skipped += 1
            continue

        # Generate file names
        base_name = f"{pdf_name}_p{page_num:03d}"

        # Find bounding boxes for YOLO
        bboxes = find_overlay_bboxes(overlay_mask)

        if not bboxes:
            skipped += 1
            continue

        # Determine class from overlay characteristics
        # For now, use a generic class — we'll refine with legend OCR later
        # Large bboxes (>10% of image) = area measurement
        # Small bboxes (<1% of image) = count
        # Elongated bboxes (aspect ratio > 5:1) = linear

        yolo_lines = []
        for bbox in bboxes:
            x, y, w, h = bbox
            area_pct = (w * h) / (img_w * img_h) * 100
            aspect = max(w, h) / (min(w, h) + 1)

            if area_pct > 5:
                class_id = 2  # floor_area (large region)
            elif aspect > 8:
                class_id = 0  # wall_linear (elongated)
            elif area_pct < 0.5:
                class_id = 12  # count_misc (small)
            else:
                class_id = 10  # linear_misc (medium)

            cx, cy, nw, nh = bbox_to_yolo(bbox, img_w, img_h)
            yolo_lines.append(f"{class_id} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")

        # Save original image (with overlay — this is what the model sees during inference)
        page_img.save(str(images_dir / f"{base_name}.jpg"), "JPEG", quality=90)

        # Save clean drawing (overlay removed)
        clean = extract_clean_drawing(img_rgb, overlay_mask)
        cv2.imwrite(str(clean_dir / f"{base_name}_clean.jpg"), cv2.cvtColor(clean, cv2.COLOR_RGB2BGR))

        # Save overlay mask (for segmentation training)
        save_segmentation_mask(overlay_mask, masks_dir / f"{base_name}_mask.png")

        # Save overlay-only image (for visualization)
        overlay_only = np.zeros_like(img_rgb)
        overlay_only[overlay_mask > 0] = img_rgb[overlay_mask > 0]
        cv2.imwrite(str(overlay_dir / f"{base_name}_overlay.jpg"), cv2.cvtColor(overlay_only, cv2.COLOR_RGB2BGR))

        # Save YOLO labels
        with open(labels_dir / f"{base_name}.txt", "w") as f:
            f.write("\n".join(yolo_lines))

        processed += 1
        if processed % 25 == 0:
            print(f"  ... processed {processed} pages")

    print(f"  Done: {processed} training examples, {skipped} skipped")
    return processed


def main():
    if len(sys.argv) < 2:
        input_dir = Path("/Users/mattnicosia/Matt Nicosia Dropbox/BLDG/BLDG Estimator/Takeoffs")
        output_dir = Path("/Users/mattnicosia/Desktop/BLDG Estimator/training/data")
    else:
        input_dir = Path(sys.argv[1])
        output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("./training_data")

    if not input_dir.exists():
        print(f"Input directory not found: {input_dir}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    # Find all PDFs (skip processed folder)
    pdfs = sorted([f for f in input_dir.glob("*.pdf") if f.is_file()])

    print(f"Found {len(pdfs)} PDFs to process")
    print(f"Output: {output_dir}")
    print()

    total_examples = 0
    manifest = []

    for pdf_path in pdfs:
        count = process_pdf(pdf_path, output_dir)
        total_examples += count
        manifest.append({
            "file": pdf_path.name,
            "examples": count,
        })

    # Save manifest
    with open(output_dir / "manifest.json", "w") as f:
        json.dump({
            "total_pdfs": len(pdfs),
            "total_examples": total_examples,
            "classes": CLASSES,
            "files": manifest,
        }, f, indent=2)

    print(f"\n{'='*60}")
    print(f"COMPLETE: {total_examples} training examples from {len(pdfs)} PDFs")
    print(f"Output: {output_dir}")
    print(f"{'='*60}")

    # Move processed PDFs
    processed_dir = input_dir / "processed"
    processed_dir.mkdir(exist_ok=True)
    for pdf_path in pdfs:
        dest = processed_dir / pdf_path.name
        pdf_path.rename(dest)
        print(f"  Moved: {pdf_path.name} → processed/")


if __name__ == "__main__":
    main()
