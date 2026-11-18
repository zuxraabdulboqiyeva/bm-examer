"""Excel / Word / PDF fayllarini yaratish (FR-QST-4, 3.7 eksport)."""
import io
import os

from django.http import HttpResponse

MIME = {
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'pdf': 'application/pdf',
}


def _xlsx(title, head, rows):
    from openpyxl import Workbook
    from openpyxl.styles import Font
    wb = Workbook()
    ws = wb.active
    # Excel varaq nomida : \ / ? * [ ] belgilari ta'qiqlangan, uzunligi 31 gacha
    ws.title = (''.join(ch for ch in title if ch not in ':\\/?*[]').strip() or 'Natijalar')[:31]
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append(list(r))
    for col in ws.columns:
        width = max(len(str(c.value or '')) for c in col)
        ws.column_dimensions[col[0].column_letter].width = min(60, max(10, width + 2))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _docx(title, head, rows):
    from docx import Document
    doc = Document()
    doc.add_heading(title, level=1)
    table = doc.add_table(rows=1, cols=len(head))
    table.style = 'Table Grid'
    for i, h in enumerate(head):
        table.rows[0].cells[i].text = str(h)
    for r in rows:
        cells = table.add_row().cells
        for i, v in enumerate(r):
            cells[i].text = '' if v is None else str(v)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _pdf_font():
    """Kirill va o'zbek harflari uchun TTF shrift (Helvetica kirillni ko'rsatmaydi)."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    candidates = [
        os.environ.get('PDF_FONT_PATH', ''),
        r'C:\Windows\Fonts\arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    ]
    for path in candidates:
        if path and os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont('BMFont', path))
                return 'BMFont'
            except Exception:
                continue
    return 'Helvetica'


def _pdf(title, head, rows):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    font = _pdf_font()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=28, rightMargin=28, topMargin=28, bottomMargin=28)
    styles = getSampleStyleSheet()
    styles['Title'].fontName = font
    cell = styles['BodyText'].clone('cell', fontName=font, fontSize=8, leading=10)
    data = [[Paragraph(str(h), cell) for h in head]] + [[Paragraph('' if v is None else str(v), cell) for v in r] for r in rows]
    t = Table(data, repeatRows=1)
    t.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8eefc')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    doc.build([Paragraph(title, styles['Title']), Spacer(1, 8), t])
    return buf.getvalue()


def table_response(fmt, filename, title, head, rows):
    fmt = (fmt or 'xlsx').lower()
    if fmt not in MIME:
        fmt = 'xlsx'
    content = {'xlsx': _xlsx, 'docx': _docx, 'pdf': _pdf}[fmt](title, head, rows)
    resp = HttpResponse(content, content_type=MIME[fmt])
    resp['Content-Disposition'] = f'attachment; filename="{filename}.{fmt}"'
    return resp
