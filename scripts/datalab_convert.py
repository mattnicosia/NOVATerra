#!/usr/bin/env python3
"""
Datalab API — Convert PDF/images to markdown via hosted Chandra OCR.

Usage:
  python scripts/datalab_convert.py <input_file> [--output-dir <dir>] [--api-key <key>]

The API key can also be set via DATALAB_API_KEY env var.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("Installing requests...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests

BASE_URL = "https://www.datalab.to/api/v1"


def convert_file(file_path: str, api_key: str, output_format: str = "markdown", page_range: str = None) -> dict:
    """Submit a file for conversion and poll for results."""
    url = f"{BASE_URL}/marker"

    headers = {"X-Api-Key": api_key}

    with open(file_path, "rb") as f:
        files = {"file": (os.path.basename(file_path), f, "application/pdf")}
        data = {
            "output_format": output_format,
            "force_ocr": False,
            "paginate_output": True,
        }
        if page_range:
            data["page_range"] = page_range

        print(f"Uploading {file_path}...")
        resp = requests.post(url, headers=headers, files=files, data=data)

    if resp.status_code != 200:
        print(f"Error {resp.status_code}: {resp.text}")
        sys.exit(1)

    result = resp.json()
    request_id = result.get("request_id")
    if not request_id:
        # Synchronous response — results are inline
        return result

    # Async — poll for results
    print(f"Request ID: {request_id}")
    check_url = f"{BASE_URL}/marker/{request_id}"

    max_polls = 120  # 10 minutes max
    for i in range(max_polls):
        time.sleep(5)
        check_resp = requests.get(check_url, headers=headers)

        if check_resp.status_code != 200:
            print(f"Poll error {check_resp.status_code}: {check_resp.text}")
            continue

        check_data = check_resp.json()
        status = check_data.get("status", "unknown")

        if status == "complete":
            print(f"Conversion complete! (polled {i + 1} times)")
            return check_data
        elif status == "error":
            print(f"Conversion failed: {check_data}")
            sys.exit(1)
        else:
            elapsed = (i + 1) * 5
            print(f"  Status: {status} ({elapsed}s elapsed)...")

    print("Timed out waiting for results.")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Convert PDF/images via Datalab API")
    parser.add_argument("input_file", help="Path to PDF or image file")
    parser.add_argument("--output-dir", default=None, help="Output directory (default: same as input)")
    parser.add_argument("--api-key", default=None, help="Datalab API key (or set DATALAB_API_KEY)")
    parser.add_argument("--page-range", default=None, help="Page range (e.g., '0-4' for first 5 pages)")
    parser.add_argument("--format", default="markdown", choices=["markdown", "json", "html"], help="Output format")
    args = parser.parse_args()

    # Resolve API key
    api_key = args.api_key or os.environ.get("DATALAB_API_KEY")
    if not api_key:
        print("Error: Provide --api-key or set DATALAB_API_KEY environment variable.")
        print("Sign up at https://www.datalab.to to get an API key.")
        sys.exit(1)

    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"File not found: {input_path}")
        sys.exit(1)

    # Output directory
    output_dir = Path(args.output_dir) if args.output_dir else input_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)

    # Convert
    result = convert_file(str(input_path), api_key, args.format, args.page_range)

    # Save results
    stem = input_path.stem

    # Save markdown/html
    if "markdown" in result:
        md_path = output_dir / f"{stem}_ocr.md"
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(result["markdown"])
        print(f"Saved: {md_path}")

    if result.get("html"):
        html_path = output_dir / f"{stem}_ocr.html"
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(result["html"])
        print(f"Saved: {html_path}")

    # Save full JSON response
    json_path = output_dir / f"{stem}_ocr_meta.json"
    # Remove large binary fields before saving
    meta = {k: v for k, v in result.items() if k not in ("images",)}
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, default=str)
    print(f"Saved: {json_path}")

    # Save images if present
    if "images" in result and result["images"]:
        import base64
        img_dir = output_dir / f"{stem}_images"
        img_dir.mkdir(exist_ok=True)
        for img_name, img_b64 in result["images"].items():
            img_data = base64.b64decode(img_b64)
            img_path = img_dir / img_name
            with open(img_path, "wb") as f:
                f.write(img_data)
        print(f"Saved {len(result['images'])} images to {img_dir}/")

    # Print summary
    md_text = result.get("markdown", "")
    print(f"\n{'='*60}")
    print(f"Pages: {result.get('metadata', {}).get('pages', '?')}")
    print(f"Output length: {len(md_text):,} chars")
    print(f"{'='*60}")
    print(f"\nFirst 2000 chars of output:\n")
    print(md_text[:2000])


if __name__ == "__main__":
    main()
