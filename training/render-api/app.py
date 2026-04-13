#!/usr/bin/env python3
"""
NOVATerra Vector Extraction API — Render Deployment
════════════════════════════════════════════════════

Endpoints:
  POST /extract   — Extract walls + rooms from a PDF page
  POST /analyze   — Classify all pages in a PDF
  POST /segment   — Segment sheet into regions (title block, viewports, notes)
  GET  /health    — Health check

Deploy: Push to Render as a Python Web Service
  Build: pip install -r requirements.txt
  Start: gunicorn app:app --bind 0.0.0.0:$PORT --timeout 120
"""

import os
import sys
import base64
import tempfile
import traceback

from flask import Flask, request, jsonify
from flask_cors import CORS

# Add parent directory so we can import from vector_poc.py
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vector_poc import run_poc, segment_sheet

app = Flask(__name__)
CORS(app)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "novaterra-vector-api"})


@app.route("/extract", methods=["POST"])
def extract():
    """Extract walls + rooms from a single PDF page."""
    try:
        data = request.get_json()
        pdf_b64 = data.get("pdf_base64", "")
        page_num = data.get("page_num", 0)

        # Decode PDF
        if pdf_b64.startswith("data:"):
            pdf_b64 = pdf_b64.split(",", 1)[1]
        pdf_bytes = base64.b64decode(pdf_b64)

        # Write to temp file (run_poc expects a file path)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(pdf_bytes)
            tmp_path = f.name

        try:
            result = run_poc(tmp_path, page_num)
            return jsonify(result)
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/analyze", methods=["POST"])
def analyze():
    """Classify all pages in a PDF."""
    try:
        data = request.get_json()
        pdf_b64 = data.get("pdf_base64", "")

        if pdf_b64.startswith("data:"):
            pdf_b64 = pdf_b64.split(",", 1)[1]
        pdf_bytes = base64.b64decode(pdf_b64)

        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total = len(doc)

        # Import the page classification function
        from vector_poc import find_floor_plan_pages

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(pdf_bytes)
            tmp_path = f.name

        try:
            pages = find_floor_plan_pages(tmp_path)
            floor_plans = [p for p in pages if p.get("confidence", 0) > 0.5]
            return jsonify({
                "total_pages": total,
                "pages": pages,
                "floor_plans": floor_plans,
                "floor_plan_count": len(floor_plans),
                "summary": f"{len(floor_plans)} floor plans out of {total} pages",
            })
        finally:
            os.unlink(tmp_path)
            doc.close()

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/segment", methods=["POST"])
def segment():
    """Segment a sheet into semantic regions (title block, viewports, notes)."""
    try:
        data = request.get_json()
        pdf_b64 = data.get("pdf_base64", "")
        page_num = data.get("page_num", 0)

        if pdf_b64.startswith("data:"):
            pdf_b64 = pdf_b64.split(",", 1)[1]
        pdf_bytes = base64.b64decode(pdf_b64)

        result = segment_sheet(pdf_bytes, page_num)
        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
