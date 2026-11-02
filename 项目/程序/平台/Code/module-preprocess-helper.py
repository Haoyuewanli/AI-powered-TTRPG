"""Local document extraction only. Content and titles remain review candidates."""
import hashlib
import json
import re
import sys
from pathlib import Path

import fitz

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(request_path):
    request = json.loads(Path(request_path).read_text(encoding="utf-8"))
    root = Path(request_path).resolve().parent
    document = fitz.open(root / request["sourceRelative"])
    if document.needs_pass:
        raise ValueError("PDF需要密码，未尝试解密。")
    if len(document) > request["maxPages"]:
        raise ValueError("文档页数超过本次上限，原文件未改动。")
    is_pdf = document.is_pdf
    for name in ["pages", "images", "maps", "封面"]:
        (root / name).mkdir()
    pages, candidates, image_index, by_xref = [], [], [], {}
    seen, image_count = {}, 0
    for page_number, page in enumerate(document, start=1):
        text = page.get_text(sort=True)
        page_path = f"pages/{page_number:04}.txt"
        (root / page_path).write_text(text, encoding="utf-8")
        blocks = page.get_text("dict")["blocks"]
        spans = [span for block in blocks if block["type"] == 0 for line in block["lines"] for span in line["spans"]]
        sizes = sorted(span["size"] for span in spans if len(span["text"].strip()) > 4)
        median = sizes[len(sizes) // 2] if sizes else 10
        # Font prominence is a heading hint, never a semantic story conclusion.
        for span in spans:
            heading = span["text"].strip()
            prominent = span["size"] >= max(12, median * 1.2)
            top_title = span["bbox"][1] < page.rect.height * 0.25 and span["size"] >= max(12, median)
            if 2 <= len(heading) <= 100 and (prominent or top_title) and not re.fullmatch(r"[\d\W]+", heading):
                candidates.append({"id": f"candidate-p{page_number}-{len(candidates) + 1}", "title": heading,
                    "type": "heading-candidate", "source": {"pdfPages": [page_number], "bboxPdfPoints": list(span["bbox"])},
                    "description": "", "conditions": [], "optional": None, "verification": "candidate", "mapIds": [], "resourceIds": []})
        image_boxes = page.get_image_info(xrefs=True) if is_pdf else []
        page_images = []
        for image in image_boxes:
            xref = image.get("xref", 0)
            if not xref:
                continue
            if image["width"] * image["height"] > request["maxPixels"]:
                raise ValueError("嵌入图像像素数超过本次上限。")
            if xref not in by_xref:
                extracted = document.extract_image(xref)
                binary = extracted["image"]
                digest = hashlib.sha256(binary).hexdigest()
                if digest not in seen:
                    image_count += 1
                    if image_count > request["maxImages"]:
                        raise ValueError("嵌入图像数量超过本次上限。")
                    path = f"images/image-{image_count:04}.{extracted['ext']}"
                    (root / path).write_bytes(binary)
                    seen[digest] = path
                entry = {"id": f"image-xref-{xref}", "path": seen[digest], "sha256": digest,
                    "width": image["width"], "height": image["height"], "xref": xref,
                    "extraction": "embedded-original", "reviewStatus": "candidate", "usages": []}
                by_xref[xref] = entry
                image_index.append(entry)
            entry = by_xref[xref]
            usage = {"pdfPage": page_number, "cropPdfPoints": list(image["bbox"])}
            entry["usages"].append(usage)
            page_images.append(entry["id"])
        if not is_pdf:
            if page.rect.width * page.rect.height > request["maxPixels"]:
                raise ValueError("图片像素数超过本次上限。")
            path = f"images/image-{page_number:04}.png"
            page.get_pixmap().save(root / path)
            image_index.append({"id": f"image-page-{page_number}", "path": path,
                "extraction": "image-render", "reviewStatus": "candidate", "usages": [{"pdfPage": page_number,
                "cropPdfPoints": list(page.rect)}], "width": round(page.rect.width), "height": round(page.rect.height)})
        pages.append({"pdfPage": page_number, "widthPdfPoints": page.rect.width, "heightPdfPoints": page.rect.height,
            "textPath": page_path, "textLength": len(text), "imageIds": page_images, "needsOcr": not bool(text.strip())})
    cover_page = document[0]
    cover_scale = min(1, 1200 / max(cover_page.rect.width, cover_page.rect.height))
    cover_page.get_pixmap(matrix=fitz.Matrix(cover_scale, cover_scale)).save(root / "封面/候选封面.png")
    maps = []
    for selection in request["mapSelections"]:
        pdf_page = selection["pdfPage"]
        if pdf_page > len(document):
            raise ValueError("所选地图页码超出文档。")
        entry = by_xref.get(selection["xref"])
        usage = next((item for item in (entry or {}).get("usages", []) if item["pdfPage"] == pdf_page), None)
        if not entry or not usage:
            raise ValueError("所选嵌入图不在给定PDF页中，未冒用其他页面图片。")
        original_path = f"maps/{selection['id']}-original.{Path(entry['path']).suffix[1:]}"
        (root / original_path).write_bytes((root / entry["path"]).read_bytes())
        image = fitz.Pixmap(document, selection["xref"])
        if image.colorspace and image.colorspace.n > 3:
            image = fitz.Pixmap(fitz.csRGB, image)
        path = f"maps/{selection['id']}.png"
        image.save(root / path)
        maps.append({"id": selection["id"], "resourceId": selection["id"], "name": selection["name"],
            "audience": selection["audience"], "path": path, "originalPath": original_path,
            "width": image.width, "height": image.height, "source": {"pdfPage": pdf_page,
                "printedPage": selection.get("printedPage"), "xref": selection["xref"],
                "cropPdfPoints": usage["cropPdfPoints"], "originalImageSha256": entry["sha256"]},
            "extraction": "embedded-original", "reviewStatus": "candidate", "locations": []})
    warnings = ["标题、图片和封面均为候选，需人工核对；未自动判断故事含义、秘密、可见权限或战斗规则。",
        "无文字页只标记needsOcr；本工具不联网或自动OCR，不保证扫描PDF可检索。",
        "嵌入原图保留其内部文字；PDF叠加文字仍保留在原PDF中，不应把单张图片当作完整页面。"]
    manifest = {"schemaVersion": 1, "kind": "module-preprocess", "moduleId": request["moduleId"],
        "title": request["title"], "reviewStatus": "candidate", "source": {"relativePath": request["sourceRelative"],
            "sha256": request["sourceSha256"], "pageCount": len(document), "kind": "pdf" if is_pdf else "image"},
        "cover": {"path": "封面/候选封面.png", "reviewStatus": "candidate", "pdfPage": 1},
        "pages": pages, "storyNodes": candidates, "mapCandidates": image_index, "maps": maps,
        "resourceCandidates": [], "encounterTemplates": [], "warnings": warnings}
    save_json(root / "预处理.json", manifest)
    print(json.dumps({"ok": True, "pages": len(pages), "images": len(image_index)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main(sys.argv[1])
    except Exception as failure:
        print(str(failure), file=sys.stderr)
        sys.exit(1)
