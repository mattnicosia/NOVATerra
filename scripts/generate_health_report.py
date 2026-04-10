#!/usr/bin/env python3
"""Generate NOVATerra Codebase Architecture Improvement Report PDF."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
import os

# ── Colors (dark professional theme on white PDF) ──
DARK = HexColor("#1a1a2e")
ACCENT = HexColor("#6C63FF")
ACCENT_LIGHT = HexColor("#8B83FF")
GREEN = HexColor("#30D158")
RED = HexColor("#FF3B30")
ORANGE = HexColor("#FF9500")
BLUE = HexColor("#60A5FA")
MUTED = HexColor("#6B7280")
LIGHT_BG = HexColor("#F8F9FA")
TABLE_HEADER_BG = HexColor("#1E1E3F")
TABLE_ALT_BG = HexColor("#F0F0F8")
WHITE = HexColor("#FFFFFF")
BORDER = HexColor("#E5E7EB")

OUTPUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "NOVATerra_Codebase_Health_Report.pdf")

# ── Styles ──
styles = {}

styles["title"] = ParagraphStyle(
    "Title", fontName="Helvetica-Bold", fontSize=24, leading=30,
    textColor=DARK, spaceAfter=4, alignment=TA_LEFT
)
styles["subtitle"] = ParagraphStyle(
    "Subtitle", fontName="Helvetica", fontSize=12, leading=16,
    textColor=MUTED, spaceAfter=20, alignment=TA_LEFT
)
styles["h1"] = ParagraphStyle(
    "H1", fontName="Helvetica-Bold", fontSize=16, leading=22,
    textColor=DARK, spaceBefore=20, spaceAfter=10
)
styles["h2"] = ParagraphStyle(
    "H2", fontName="Helvetica-Bold", fontSize=13, leading=18,
    textColor=ACCENT, spaceBefore=14, spaceAfter=6
)
styles["h3"] = ParagraphStyle(
    "H3", fontName="Helvetica-Bold", fontSize=11, leading=15,
    textColor=DARK, spaceBefore=10, spaceAfter=4
)
styles["body"] = ParagraphStyle(
    "Body", fontName="Helvetica", fontSize=9.5, leading=13.5,
    textColor=DARK, spaceAfter=6
)
styles["bullet"] = ParagraphStyle(
    "Bullet", fontName="Helvetica", fontSize=9.5, leading=13.5,
    textColor=DARK, spaceAfter=3, leftIndent=16, bulletIndent=6,
    bulletFontName="Helvetica", bulletFontSize=8
)
styles["code"] = ParagraphStyle(
    "Code", fontName="Courier", fontSize=8.5, leading=12,
    textColor=HexColor("#374151"), spaceAfter=4, leftIndent=12,
    backColor=LIGHT_BG
)
styles["caption"] = ParagraphStyle(
    "Caption", fontName="Helvetica-Oblique", fontSize=8, leading=11,
    textColor=MUTED, spaceAfter=8
)
styles["footer"] = ParagraphStyle(
    "Footer", fontName="Helvetica", fontSize=7, leading=9,
    textColor=MUTED, alignment=TA_CENTER
)


def make_table(headers, rows, col_widths=None):
    """Create a styled table."""
    data = [headers] + rows
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("ALIGN", (0, 0), (-1, 0), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEBELOW", (0, 0), (-1, 0), 1.5, ACCENT),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), TABLE_ALT_BG))
    t.setStyle(TableStyle(style_cmds))
    return t


def accent(text):
    return f'<font color="#{ACCENT.hexval()[2:]}">{text}</font>'


def bold(text):
    return f"<b>{text}</b>"


def green(text):
    return f'<font color="#30D158">{text}</font>'


def red(text):
    return f'<font color="#FF3B30">{text}</font>'


def build_report():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    story = []
    W = doc.width

    # ── Title Page ──
    story.append(Spacer(1, 1.5 * inch))
    story.append(Paragraph("NOVATerra", styles["title"]))
    story.append(Paragraph("Codebase Architecture Improvement Report", ParagraphStyle(
        "TitleSub", fontName="Helvetica", fontSize=18, leading=24, textColor=ACCENT, spaceAfter=12
    )))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Two-Sweep Decomposition: April 4, 2026", styles["subtitle"]))
    story.append(Spacer(1, 0.5 * inch))

    # Scorecard summary box
    summary_data = [
        ["Metric", "Before", "After", "Delta"],
        ["God file lines (3 files)", "7,911", "4,094", "-48%"],
        ["New focused modules", "0", "22", "+22 files"],
        ["Low-cohesion clusters", "8", "7", "-1"],
        ["predictiveEngine cross-calls", "21", "0", "-21"],
        ["Breaking changes", "-", "0", "Zero"],
        ["Build status", "Clean", "Clean", "No regressions"],
    ]
    story.append(make_table(summary_data[0], summary_data[1:], col_widths=[W*0.4, W*0.18, W*0.18, W*0.24]))
    story.append(Spacer(1, 20))
    story.append(Paragraph("Prepared by Claude Opus 4.6 for Matt Nicosia / BLDG Estimating", styles["caption"]))

    story.append(PageBreak())

    # ── Executive Summary ──
    story.append(Paragraph("Executive Summary", styles["h1"]))
    bullets = [
        f"{bold('3 god files decomposed')}: ResourcePage.jsx, cloudSync.js, usePersistence.js",
        f"{bold('Total reduction')}: 7,911 -> 4,094 lines across god files ({accent('-48%')})",
        f"{bold('22 new focused modules')} created with clear single responsibilities",
        f"{bold('2 bug fixes')}: company profiles persistence, cloud sync duplication",
        f"{bold('2 architectural improvements')}: Resources cluster split, predictiveEngine decoupling",
        f"{bold('Zero breaking changes')} -- all functions re-exported for backwards compatibility",
        f"{bold('Build passes clean')} throughout both sweeps (8s build time)",
    ]
    for b in bullets:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {b}", styles["bullet"]))

    story.append(Spacer(1, 12))

    # ── Bugs Identified & Fixed ──
    story.append(Paragraph("Bugs Identified &amp; Fixed", styles["h1"]))

    story.append(Paragraph("1. Company Profile Persistence", styles["h2"]))
    story.append(Paragraph(
        f"{bold('Problem')}: The CompanyProfilesSection UI component was {red('commented out')} in SettingsPage.jsx "
        "(lines 181-191), completely breaking the persistence chain. Users had no way to create or edit company profiles.",
        styles["body"]
    ))
    story.append(Paragraph(
        "The store (masterDataStore), auto-save hook, IndexedDB persistence, and cloud sync logic were all "
        "correctly wired -- the only missing piece was the UI entry point.",
        styles["body"]
    ))
    story.append(Paragraph(
        f"{bold('Fix')}: Uncommented the component. All required props (logoFileRef, handleLogoUpload, "
        "updateCompanyInfo, companyReadOnly) were already defined in the parent scope.",
        styles["body"]
    ))

    story.append(Paragraph("2. Cloud Sync Project Duplication", styles["h2"]))
    story.append(Paragraph(
        f"{bold('Problem')}: Solo-to-org migration in useCloudSync.js {red('replaced')} org estimates with solo "
        "estimates instead of merging them. The line <font face='Courier' size='8.5'>cloudEstimates = soloEstimates</font> "
        "(line 388) performed a complete replacement.",
        styles["body"]
    ))
    story.append(Paragraph(
        "If both the org cloud and solo cloud had data, org-scoped estimates were silently dropped, "
        "causing data loss during migration.",
        styles["body"]
    ))
    story.append(Paragraph(
        f"{bold('Fix')}: Changed to merge by estimate_id. Solo estimates not already present in the org list "
        "get appended. Both estimate data and index entries are now merged.",
        styles["body"]
    ))

    story.append(PageBreak())

    # ── Sweep 1 ──
    story.append(Paragraph("Sweep 1: Phase 1 -- SAFE Extractions", styles["h1"]))
    story.append(Paragraph("10 modules extracted with zero functional risk. Pure utilities and self-contained components.", styles["body"]))

    story.append(Paragraph("ResourcePage.jsx (4,256 -> 3,476 lines, -18%)", styles["h2"]))
    rp1_data = [
        ["Extraction", "New File", "Lines", "Risk"],
        ["Date utilities (toDateStr, parseDateStr, addDays)", "utils/dateHelpers.js", "24", "SAFE"],
        ["Color utilities (SCHEDULE_COLORS, getStatusColors, etc.)", "utils/resourceColors.js", "39", "SAFE"],
        ["ScheduleLegend + GanttRangeNav", "components/resources/ScheduleControls.jsx", "62", "SAFE"],
        ["ByHoursView + ProgressBar + EstimateRow", "components/resources/ByHoursView.jsx", "226", "SAFE"],
        ["ByDueDateView (weekly grouping, urgency colors)", "components/resources/ByDueDateView.jsx", "248", "SAFE"],
        ["ResourceGuideModal + constants", "components/resources/ResourceGuideModal.jsx", "189", "SAFE"],
    ]
    story.append(make_table(rp1_data[0], rp1_data[1:], col_widths=[W*0.38, W*0.34, W*0.1, W*0.18]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("cloudSync.js (1,265 -> 1,164 lines, -8%)", styles["h2"]))
    cs1_data = [
        ["Extraction", "New File", "Lines", "Risk"],
        ["Auth/scope (getUserId, getScope, applyScope, isReady, mark*)", "utils/cloudSync-auth.js", "46", "SAFE"],
        ["Retry (withRetry, isPermanentError, concurrency gate)", "utils/cloudSync-retry.js", "61", "SAFE"],
    ]
    story.append(make_table(cs1_data[0], cs1_data[1:], col_widths=[W*0.38, W*0.34, W*0.1, W*0.18]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("usePersistence.js (2,390 -> 2,061 lines, -14%)", styles["h2"]))
    up1_data = [
        ["Extraction", "New File", "Lines", "Risk"],
        ["10 global save functions (saveMasterData, saveSettings, etc.)", "hooks/persistenceGlobal.js", "147", "SAFE"],
        ["resetAllStores + PDF ops + dirty flags + upload queue", "hooks/persistenceCleanup.js", "221", "SAFE"],
    ]
    story.append(make_table(up1_data[0], up1_data[1:], col_widths=[W*0.38, W*0.34, W*0.1, W*0.18]))

    story.append(PageBreak())

    # ── Sweep 2 ──
    story.append(Paragraph("Sweep 2: Phase 2 -- MODERATE Extractions + Architectural Fixes", styles["h1"]))
    story.append(Paragraph("12 modules extracted. Components with store dependencies, complex state, and cross-module coupling.", styles["body"]))

    story.append(Paragraph("ResourcePage.jsx (3,476 -> 2,704 lines, -22% additional)", styles["h2"]))
    rp2_data = [
        ["Extraction", "New File", "Lines", "Risk"],
        ["EstimatorContextMenu (right-click, click-outside)", "components/resources/EstimatorContextMenu.jsx", "153", "MODERATE"],
        ["ProjectQuickActions (progress/assignment popover)", "components/resources/ProjectQuickActions.jsx", "369", "MODERATE"],
        ["BoardView (Kanban drag-drop + ProjectCard)", "components/resources/BoardView.jsx", "469", "MODERATE"],
        ["ScheduleSettings (manager config popover)", "components/resources/ScheduleSettings.jsx", "243", "MODERATE"],
        ["MyWorkloadView (estimator-role gated view)", "components/resources/MyWorkloadView.jsx", "337", "MODERATE"],
    ]
    story.append(make_table(rp2_data[0], rp2_data[1:], col_widths=[W*0.38, W*0.34, W*0.1, W*0.18]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("cloudSync.js (1,164 -> 200 lines, -83% additional)", styles["h2"]))
    cs2_data = [
        ["Extraction", "New File", "Lines", "Risk"],
        ["Blob handling (compress, upload, download, hydrate)", "utils/cloudSync-blobs.js", "~300", "MODERATE"],
        ["Push ops (pushData, pushEstimate, deleteEstimate)", "utils/cloudSync-push.js", "~180", "MODERATE"],
        ["Pull ops (11 pull functions, scope/fallback logic)", "utils/cloudSync-pull.js", "~400", "MODERATE"],
    ]
    story.append(make_table(cs2_data[0], cs2_data[1:], col_widths=[W*0.38, W*0.34, W*0.1, W*0.18]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("usePersistence.js (2,061 -> 1,190 lines, -42% additional)", styles["h2"]))
    up2_data = [
        ["Extraction", "New File", "Lines", "Risk"],
        ["loadEstimate + saveEstimate (fallback chain, guards)", "hooks/persistenceEstimate.js", "700", "MODERATE"],
        ["recoverFromCloud (scope-blind emergency recovery)", "hooks/persistenceRecovery.js", "206", "MODERATE"],
    ]
    story.append(make_table(up2_data[0], up2_data[1:], col_widths=[W*0.38, W*0.34, W*0.1, W*0.18]))

    story.append(PageBreak())

    # ── Architectural Fixes ──
    story.append(Paragraph("Architectural Fixes", styles["h1"]))

    story.append(Paragraph("Resources Cluster Split (Cohesion Fix)", styles["h2"]))
    story.append(Paragraph(
        f"{bold('Problem')}: databaseStore had {red('0.45 cohesion')} -- the weakest major cluster in the codebase. "
        "It sat on the busiest highway (27 execution flows through Api -> Resources -> Storage). "
        "13 UI state fields (dbSearch, dbExpandedDivs, createDbItem, editDbItem, pickerForItemId, overwriteModal, etc.) "
        "were mixed with core data CRUD operations.",
        styles["body"]
    ))
    story.append(Paragraph(
        f"{bold('Fix')}: Created {accent('databaseUiStore.js')} (65 lines) containing all 13 UI state fields and their setters. "
        "Updated 6 consumer files (CostDatabasePage, EstimatePage, AssembliesPage, DatabasePickerModal, "
        "ItemDetailPanel, tradeGroupings). databaseStore.js reduced from 312 to 277 lines, now purely data + CRUD.",
        styles["body"]
    ))

    story.append(Spacer(1, 12))

    story.append(Paragraph("predictiveEngine Decoupling", styles["h2"]))
    story.append(Paragraph(
        f"{bold('Problem')}: {red('21 direct cross-calls')} from predictiveEngine.js to pdfExtractor.js. "
        "Schedule region detection was called 5x defensively across different functions. "
        "Tag filtering logic was split across both files with no clear ownership.",
        styles["body"]
    ))
    story.append(Paragraph(
        f"{bold('Fix')}: Created {accent('extractionAdapter.js')} as a clean interface layer:",
        styles["body"]
    ))
    adapter_bullets = [
        f"{bold('isPointInSchedule()')} -- replaces 8 scattered isInScheduleRegion calls",
        f"{bold('getOrDetectScheduleRegions()')} -- replaces defensive getScheduleRegions || detectScheduleRegions pattern",
        f"{bold('getTagInstancesOnPlan()')} -- wraps findPlanTagInstances with optional schedule filtering",
        f"{bold('isValidTag')} -- renamed re-export of isLikelyTag for clarity",
        "Re-exports extractPageData, findNearestTag, findAdjacentText directly",
    ]
    for b in adapter_bullets:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {b}", styles["bullet"]))
    story.append(Paragraph(
        f"predictiveEngine now has {green('zero direct imports')} from pdfExtractor. "
        "pdfExtractor.js was not modified.",
        styles["body"]
    ))

    story.append(PageBreak())

    # ── Final Scorecard ──
    story.append(Paragraph("Final Scorecard", styles["h1"]))

    final_data = [
        ["Metric", "Before Session", "After Session", "Delta"],
        ["ResourcePage.jsx", "4,256 lines", "2,704 lines", "-36%"],
        ["cloudSync.js", "1,265 lines", "200 lines", "-84%"],
        ["usePersistence.js", "2,390 lines", "1,190 lines", "-50%"],
        ["God file total", "7,911 lines", "4,094 lines", "-48%"],
        ["New focused modules", "0", "22", "+22 files"],
        ["Low-cohesion clusters", "8", "7", "-1"],
        ["predictiveEngine cross-calls", "21", "0", "-21"],
        ["Build status", "Clean", "Clean", "No regressions"],
        ["Breaking changes", "-", "0", "All re-exported"],
    ]
    story.append(make_table(final_data[0], final_data[1:], col_widths=[W*0.32, W*0.22, W*0.22, W*0.24]))

    story.append(Spacer(1, 20))

    # ── Remaining Work ──
    story.append(Paragraph("Remaining Work (Not Touched)", styles["h1"]))
    story.append(Paragraph("These items were identified but intentionally deferred due to high risk or tight coupling.", styles["body"]))

    remaining_data = [
        ["Item", "Lines", "Risk", "Blocker"],
        ["GanttChart (in ResourcePage)", "~1,200", "RISKY", "Needs custom hook refactor for drag state machine"],
        ["usePersistenceLoad (orchestrator)", "~1,050", "RISKY", "Needs dependency injection; touches 25+ stores"],
        ["Realtime helpers (cloudSync)", "~130", "RISKY", "Heavy store coupling + dynamic imports"],
        ["CostDatabasePage.jsx", "2,703", "MODERATE", "Next decomposition candidate"],
        ["TakeoffLeftPanel.jsx", "2,643", "MODERATE", "Complex panel, future candidate"],
        ["Storage bottleneck (40+ flow fan-in)", "-", "STRUCTURAL", "Acceptable for offline-first; needs error handling"],
    ]
    story.append(make_table(remaining_data[0], remaining_data[1:], col_widths=[W*0.28, W*0.1, W*0.14, W*0.48]))

    story.append(Spacer(1, 30))
    story.append(Paragraph(
        "NOVATerra Codebase Architecture Improvement Report -- April 4, 2026 -- "
        "Generated by Claude Opus 4.6 for BLDG Estimating",
        styles["footer"]
    ))

    doc.build(story)
    print(f"Report saved to: {OUTPUT}")


if __name__ == "__main__":
    build_report()
