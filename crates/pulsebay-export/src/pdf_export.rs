use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use pulsebay_core::{format_slot_label, summarize_bookings, Booking, Department, Specialist};

use crate::csv_export::{resolve_department, resolve_specialist, ExportMeta};
use crate::error::ExportError;

// US Letter Landscape in PDF points (72 pt = 1 inch)
const PAGE_W: f32 = 792.0;
const PAGE_H: f32 = 612.0;
const MARGIN: f32 = 36.0;

#[derive(Clone, Copy)]
struct Rgb(f32, f32, f32);

#[derive(Clone, Copy)]
struct Rect {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

#[derive(Clone, Copy)]
struct TextStyle<'a> {
    font: &'a str,
    size: f32,
    color: Rgb,
}

/// Escapes and normalizes text into safe WinAnsi/ASCII bytes for built-in PDF Type1 fonts.
fn pdf_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 8);
    for ch in input.chars() {
        let mapped = match ch {
            '—' | '–' | '·' | '•' => '-',
            '’' | '‘' => '\'',
            '“' | '”' => '"',
            c if c.is_ascii() && !c.is_ascii_control() => c,
            _ => ' ',
        };
        match mapped {
            '\\' => out.push_str("\\\\"),
            '(' => out.push_str("\\("),
            ')' => out.push_str("\\)"),
            c => out.push(c),
        }
    }
    out
}

fn truncate_str(input: &str, max_chars: usize) -> String {
    let chars: Vec<char> = input.chars().collect();
    if chars.len() <= max_chars {
        input.to_owned()
    } else if max_chars > 3 {
        let prefix: String = chars[..max_chars - 3].iter().collect();
        format!("{prefix}...")
    } else {
        chars[..max_chars].iter().collect()
    }
}

fn draw_rect(buf: &mut String, rect: Rect, color: Rgb) {
    let _ = writeln!(
        buf,
        "{:.3} {:.3} {:.3} rg {:.1} {:.1} {:.1} {:.1} re f",
        color.0, color.1, color.2, rect.x, rect.y, rect.w, rect.h
    );
}

fn draw_text(buf: &mut String, style: TextStyle<'_>, x: f32, y: f32, text: &str) {
    let escaped = pdf_escape(text);
    let _ = writeln!(
        buf,
        "BT /{} {:.1} Tf {:.3} {:.3} {:.3} rg 1 0 0 1 {:.1} {:.1} Tm ({escaped}) Tj ET",
        style.font, style.size, style.color.0, style.color.1, style.color.2, x, y
    );
}

fn render_page_stream(
    rows: &[&Booking],
    departments: &[Department],
    specialists: &[Specialist],
    meta: &ExportMeta,
    all_bookings: &[Booking],
    page_num: usize,
    total_pages: usize,
) -> String {
    let mut s = String::with_capacity(8192);
    let content_w = PAGE_W - (MARGIN * 2.0);

    let white = Rgb(1.0, 1.0, 1.0);
    let cobalt = Rgb(0.106, 0.424, 0.898);
    let navy = Rgb(0.086, 0.149, 0.231);
    let soft_ice = Rgb(0.86, 0.92, 1.0);

    // Header banner (Console Cobalt #1B6CE5)
    let banner_h = 54.0;
    let banner_y = PAGE_H - MARGIN - banner_h;
    draw_rect(
        &mut s,
        Rect {
            x: MARGIN,
            y: banner_y,
            w: content_w,
            h: banner_h,
        },
        cobalt,
    );
    draw_text(
        &mut s,
        TextStyle {
            font: "F2",
            size: 18.0,
            color: white,
        },
        MARGIN + 16.0,
        banner_y + 30.0,
        &truncate_str(&meta.report_title, 58),
    );
    draw_text(
        &mut s,
        TextStyle {
            font: "F1",
            size: 9.5,
            color: soft_ice,
        },
        MARGIN + 16.0,
        banner_y + 13.0,
        &format!(
            "Scope: {}   |   Generated: {}",
            meta.scope_label, meta.generated_at
        ),
    );
    draw_text(
        &mut s,
        TextStyle {
            font: "F2",
            size: 10.0,
            color: white,
        },
        PAGE_W - MARGIN - 115.0,
        banner_y + 24.0,
        "PULSEBAY DESK",
    );

    // KPI Strip on Page 1
    let mut table_top_y = banner_y - 18.0;
    if page_num == 1 {
        let stats = summarize_bookings(all_bookings);
        let cards: [(&str, usize, Rgb); 5] = [
            ("TOTAL", stats.total, navy),
            ("CONFIRMED", stats.confirmed, Rgb(0.059, 0.616, 0.541)),
            ("CHECKED IN", stats.checked_in, cobalt),
            ("COMPLETED", stats.completed, Rgb(0.290, 0.376, 0.478)),
            ("URGENT", stats.urgent, Rgb(0.878, 0.282, 0.353)),
        ];
        let gap = 10.0;
        let card_w = (content_w - gap * 4.0) / 5.0;
        let card_h = 44.0;
        let card_y = banner_y - 14.0 - card_h;

        for (i, (label, val, accent)) in cards.iter().enumerate() {
            let cx = MARGIN + (card_w + gap) * i as f32;
            draw_rect(
                &mut s,
                Rect {
                    x: cx,
                    y: card_y,
                    w: card_w,
                    h: card_h,
                },
                Rgb(0.945, 0.965, 0.973),
            );
            draw_rect(
                &mut s,
                Rect {
                    x: cx,
                    y: card_y,
                    w: 5.0,
                    h: card_h,
                },
                *accent,
            );
            draw_text(
                &mut s,
                TextStyle {
                    font: "F2",
                    size: 8.0,
                    color: Rgb(0.29, 0.38, 0.48),
                },
                cx + 12.0,
                card_y + 29.0,
                label,
            );
            draw_text(
                &mut s,
                TextStyle {
                    font: "F2",
                    size: 16.0,
                    color: navy,
                },
                cx + 12.0,
                card_y + 10.0,
                &val.to_string(),
            );
        }
        table_top_y = card_y - 16.0;
    }

    // Table Header Bar (Slate Navy #16263B)
    let header_h = 24.0;
    let header_y = table_top_y - header_h;
    draw_rect(
        &mut s,
        Rect {
            x: MARGIN,
            y: header_y,
            w: content_w,
            h: header_h,
        },
        navy,
    );

    let cols: [(&str, f32); 7] = [
        ("REF", MARGIN + 8.0),
        ("DATE / TIME", MARGIN + 92.0),
        ("VISITOR", MARGIN + 206.0),
        ("DEPARTMENT", MARGIN + 336.0),
        ("SPECIALIST", MARGIN + 448.0),
        ("PRIORITY", MARGIN + 566.0),
        ("STATUS", MARGIN + 632.0),
    ];

    for (label, cx) in &cols {
        draw_text(
            &mut s,
            TextStyle {
                font: "F2",
                size: 8.5,
                color: white,
            },
            *cx,
            header_y + 8.0,
            label,
        );
    }

    // Rows
    let row_h = 23.0;
    if rows.is_empty() {
        draw_text(
            &mut s,
            TextStyle {
                font: "F1",
                size: 10.5,
                color: Rgb(0.35, 0.44, 0.53),
            },
            MARGIN + 12.0,
            header_y - 26.0,
            "No scheduled bookings matched the selected export filter.",
        );
    } else {
        for (idx, b) in rows.iter().enumerate() {
            let ry = header_y - row_h * (idx as f32 + 1.0);
            if idx % 2 == 1 {
                draw_rect(
                    &mut s,
                    Rect {
                        x: MARGIN,
                        y: ry,
                        w: content_w,
                        h: row_h,
                    },
                    Rgb(0.957, 0.973, 0.984),
                );
            }
            draw_rect(
                &mut s,
                Rect {
                    x: MARGIN,
                    y: ry,
                    w: content_w,
                    h: 0.6,
                },
                Rgb(0.827, 0.882, 0.918),
            );

            let (dept_name, dept_code, _room) = resolve_department(departments, &b.department_id);
            let spec_name = resolve_specialist(specialists, &b.specialist_id);
            let date_time = format!("{} {}", b.date, format_slot_label(&b.start_time));
            let text_y = ry + 7.5;

            draw_text(
                &mut s,
                TextStyle {
                    font: "F3",
                    size: 8.0,
                    color: navy,
                },
                cols[0].1,
                text_y,
                &truncate_str(&b.reference_code, 14),
            );
            draw_text(
                &mut s,
                TextStyle {
                    font: "F1",
                    size: 8.5,
                    color: Rgb(0.12, 0.20, 0.30),
                },
                cols[1].1,
                text_y,
                &truncate_str(&date_time, 20),
            );
            draw_text(
                &mut s,
                TextStyle {
                    font: "F2",
                    size: 8.8,
                    color: navy,
                },
                cols[2].1,
                text_y,
                &truncate_str(&b.visitor_name, 22),
            );
            draw_text(
                &mut s,
                TextStyle {
                    font: "F1",
                    size: 8.5,
                    color: Rgb(0.18, 0.28, 0.39),
                },
                cols[3].1,
                text_y,
                &truncate_str(&format!("[{dept_code}] {dept_name}"), 21),
            );
            draw_text(
                &mut s,
                TextStyle {
                    font: "F1",
                    size: 8.5,
                    color: Rgb(0.18, 0.28, 0.39),
                },
                cols[4].1,
                text_y,
                &truncate_str(spec_name, 20),
            );
            draw_text(
                &mut s,
                TextStyle {
                    font: "F2",
                    size: 8.2,
                    color: Rgb(0.55, 0.32, 0.05),
                },
                cols[5].1,
                text_y,
                b.priority.label(),
            );
            draw_text(
                &mut s,
                TextStyle {
                    font: "F2",
                    size: 8.2,
                    color: Rgb(0.059, 0.48, 0.42),
                },
                cols[6].1,
                text_y,
                b.status.label(),
            );
        }
    }

    // Footer
    draw_rect(
        &mut s,
        Rect {
            x: MARGIN,
            y: 34.0,
            w: content_w,
            h: 0.8,
        },
        Rgb(0.80, 0.86, 0.90),
    );
    draw_text(
        &mut s,
        TextStyle {
            font: "F1",
            size: 8.0,
            color: Rgb(0.38, 0.46, 0.55),
        },
        MARGIN,
        21.0,
        "PulseBay Operations Console  |  Built by Jean Seenivasagam  |  github.com/jeanseenivasagam",
    );
    draw_text(
        &mut s,
        TextStyle {
            font: "F2",
            size: 8.0,
            color: Rgb(0.25, 0.35, 0.46),
        },
        PAGE_W - MARGIN - 62.0,
        21.0,
        &format!("Page {page_num} of {total_pages}"),
    );

    s
}

/// Generates a valid, paginated PDF 1.4 landscape schedule report using built-in Type1 fonts.
pub fn export_pdf_bytes(
    bookings: &[Booking],
    departments: &[Department],
    specialists: &[Specialist],
    meta: &ExportMeta,
) -> Result<Vec<u8>, ExportError> {
    let mut pages_rows: Vec<Vec<&Booking>> = Vec::new();
    if bookings.is_empty() {
        pages_rows.push(Vec::new());
    } else {
        let first_chunk = bookings.len().min(16);
        pages_rows.push(bookings[..first_chunk].iter().collect());
        let mut idx = first_chunk;
        while idx < bookings.len() {
            let end = (idx + 19).min(bookings.len());
            pages_rows.push(bookings[idx..end].iter().collect());
            idx = end;
        }
    }

    let total_pages = pages_rows.len();

    let mut objects: Vec<(usize, Vec<u8>)> = Vec::new();

    let page_ids: Vec<usize> = (0..total_pages).map(|i| 6 + i * 2).collect();
    let kids_str = page_ids
        .iter()
        .map(|id| format!("{id} 0 R"))
        .collect::<Vec<_>>()
        .join(" ");

    objects.push((1, b"<< /Type /Catalog /Pages 2 0 R >>".to_vec()));
    objects.push((
        2,
        format!("<< /Type /Pages /Kids [ {kids_str} ] /Count {total_pages} >>").into_bytes(),
    ));
    objects.push((
        3,
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_vec(),
    ));
    objects.push((
        4,
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>".to_vec(),
    ));
    objects.push((
        5,
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>".to_vec(),
    ));

    for (i, rows) in pages_rows.iter().enumerate() {
        let page_id = 6 + i * 2;
        let content_id = 7 + i * 2;
        let stream = render_page_stream(
            rows,
            departments,
            specialists,
            meta,
            bookings,
            i + 1,
            total_pages,
        );
        let stream_bytes = stream.as_bytes();

        let page_dict = format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W:.0} {PAGE_H:.0}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents {content_id} 0 R >>"
        );
        objects.push((page_id, page_dict.into_bytes()));

        let mut content_obj = Vec::with_capacity(stream_bytes.len() + 64);
        content_obj.extend_from_slice(
            format!("<< /Length {} >>\nstream\n", stream_bytes.len()).as_bytes(),
        );
        content_obj.extend_from_slice(stream_bytes);
        content_obj.extend_from_slice(b"\nendstream");
        objects.push((content_id, content_obj));
    }

    let mut pdf: Vec<u8> = Vec::with_capacity(16384);
    pdf.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    let mut offsets: Vec<usize> = vec![0; objects.len() + 1];
    for (id, body) in &objects {
        offsets[*id] = pdf.len();
        pdf.extend_from_slice(format!("{id} 0 obj\n").as_bytes());
        pdf.extend_from_slice(body);
        pdf.extend_from_slice(b"\nendobj\n");
    }

    let xref_offset = pdf.len();
    let count = objects.len() + 1;
    pdf.extend_from_slice(format!("xref\n0 {count}\n").as_bytes());
    pdf.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }

    pdf.extend_from_slice(
        format!(
            "trailer\n<< /Size {count} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
        )
        .as_bytes(),
    );

    Ok(pdf)
}

/// Writes the PDF schedule report directly to `path`.
pub fn export_pdf_file(
    path: impl AsRef<Path>,
    bookings: &[Booking],
    departments: &[Department],
    specialists: &[Specialist],
    meta: &ExportMeta,
) -> Result<usize, ExportError> {
    let bytes = export_pdf_bytes(bookings, departments, specialists, meta)?;
    fs::write(path, &bytes)?;
    Ok(bytes.len())
}
