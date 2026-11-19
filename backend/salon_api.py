#!/usr/bin/env python3
"""
Salon Pro — Python Backend Service (SQLite + HTTP REST API)
Handles master scheduling, conflict detection, POS checkout, inventory deduction,
client formula records, stylist commissions, and CSV ledger export.
"""

import csv
import datetime
import io
import json
import os
import sqlite3
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "salon_pro.db")
PORT = int(os.environ.get("PYTHON_API_PORT", "8001"))

DB_LOCK = threading.Lock()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def time_to_minutes(hhmm: str) -> int:
    parts = hhmm.strip().split(":")
    return int(parts[0]) * 60 + int(parts[1])


def minutes_to_time(mins: int) -> str:
    h = mins // 60
    m = mins % 60
    return f"{h:02d}:{m:02d}"


def init_db() -> None:
    with DB_LOCK:
        conn = get_conn()
        cur = conn.cursor()

        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS stylists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                specialty TEXT NOT NULL,
                avatar_url TEXT NOT NULL,
                commission_rate REAL NOT NULL DEFAULT 0.35,
                active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS catalog_items (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK(kind IN ('service', 'product')),
                category TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                price_ksh INTEGER NOT NULL,
                duration_min INTEGER NOT NULL DEFAULT 0,
                stock_qty INTEGER NOT NULL DEFAULT 0,
                sku TEXT NOT NULL DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                preferred_stylist_id TEXT DEFAULT '',
                formula_notes TEXT NOT NULL DEFAULT '',
                visit_count INTEGER NOT NULL DEFAULT 0,
                total_spent_ksh INTEGER NOT NULL DEFAULT 0,
                last_visit TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS appointments (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                stylist_id TEXT NOT NULL,
                service_id TEXT NOT NULL,
                date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                duration_min INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('Pending', 'Confirmed', 'In-Service', 'Completed', 'Cancelled', 'No-Show')),
                notes TEXT NOT NULL DEFAULT '',
                ticket_id TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id),
                FOREIGN KEY (stylist_id) REFERENCES stylists(id),
                FOREIGN KEY (service_id) REFERENCES catalog_items(id)
            );

            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                ticket_number TEXT NOT NULL UNIQUE,
                client_id TEXT DEFAULT '',
                client_name TEXT NOT NULL,
                appointment_id TEXT DEFAULT '',
                subtotal_ksh INTEGER NOT NULL,
                discount_ksh INTEGER NOT NULL DEFAULT 0,
                tax_ksh INTEGER NOT NULL DEFAULT 0,
                total_ksh INTEGER NOT NULL,
                payment_method TEXT NOT NULL CHECK(payment_method IN ('M-Pesa', 'Card', 'Cash')),
                tendered_ksh INTEGER NOT NULL,
                change_ksh INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL CHECK(status IN ('Paid', 'Voided')),
                created_at TEXT NOT NULL,
                business_date TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ticket_items (
                id TEXT PRIMARY KEY,
                ticket_id TEXT NOT NULL,
                catalog_item_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                kind TEXT NOT NULL,
                stylist_id TEXT DEFAULT '',
                stylist_name TEXT DEFAULT '',
                quantity INTEGER NOT NULL,
                unit_price_ksh INTEGER NOT NULL,
                line_total_ksh INTEGER NOT NULL,
                commission_ksh INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
            );
            """
        )

        existing = cur.execute("SELECT COUNT(*) FROM stylists").fetchone()[0]
        if existing == 0:
            seed_data(conn)

        conn.commit()
        conn.close()


def seed_data(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    today = datetime.date.today().isoformat()
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    now_iso = datetime.datetime.now().isoformat(timespec="seconds")

    stylists = [
        (
            "sty-amara",
            "Amara Ochieng",
            "Creative Director",
            "Precision Cuts & Silk Press",
            "/src/assets/images/stylist_amara_portrait_1795108046700.jpg",
            0.40,
        ),
        (
            "sty-chloe",
            "Chloe Muthoni",
            "Lead Colorist",
            "Balayage & Botanical Gloss",
            "/src/assets/images/stylist_chloe_portrait_1795108045960.jpg",
            0.38,
        ),
        (
            "sty-zainab",
            "Zainab Hassan",
            "Atelier Specialist",
            "Bridal Styling & Gel Atelier",
            "/src/assets/images/stylist_zainab_portrait_1795108047310.jpg",
            0.35,
        ),
        (
            "sty-marcus",
            "Marcus Kiprop",
            "Master Barber",
            "Sculpted Fades & Scalp Rituals",
            "/src/assets/images/stylist_marcus_portrait_1795108046964.jpg",
            0.35,
        ),
    ]
    cur.executemany(
        "INSERT INTO stylists (id, name, role, specialty, avatar_url, commission_rate) VALUES (?, ?, ?, ?, ?, ?)",
        stylists,
    )

    catalog = [
        # Services
        ("srv-silk-press", "service", "Hair & Styling", "Signature Silk Press & Steam", "Hydrating mist infusion with mirror-shine press", 4500, 75, 0, "SRV-101"),
        ("srv-knotless", "service", "Hair & Styling", "Boutique Knotless Braids", "Featherlight medium knotless protective style", 7500, 150, 0, "SRV-102"),
        ("srv-editorial-cut", "service", "Hair & Styling", "Editorial Cut & Blowout", "Tailored consultation, wash, precision shape & finish", 3800, 60, 0, "SRV-103"),
        ("srv-balayage", "service", "Color & Treatment", "Hand-Painted Balayage", "Custom dimensional lift with bond-builder gloss", 14500, 150, 0, "SRV-201"),
        ("srv-keratin", "service", "Color & Treatment", "Keratin Velvet Treatment", "Frizz-smoothing amino infusion lasting 12 weeks", 11000, 120, 0, "SRV-202"),
        ("srv-botanical-gloss", "service", "Color & Treatment", "Botanical Scalp & Gloss", "Warm argan scalp massage & demi-permanent tone", 5200, 60, 0, "SRV-203"),
        ("srv-biab-mani", "service", "Nails & Atelier", "BIAB Builder Manicure", "Structured gel overlay with cuticle detail", 3200, 60, 0, "SRV-301"),
        ("srv-spa-pedi", "service", "Nails & Atelier", "Lavender Stone Pedicure", "Volcanic exfoliation, hot towel wrap & gel polish", 4000, 60, 0, "SRV-302"),
        ("srv-bridal-trial", "service", "Nails & Atelier", "Bridal Atelier Preview", "Full hair architecture & veil placement session", 9500, 90, 0, "SRV-303"),
        ("srv-exec-fade", "service", "Grooming", "Executive Taper & Hot Towel", "Precision skin fade, straight-razor line & mist", 2200, 45, 0, "SRV-401"),
        ("srv-beard-sculpt", "service", "Grooming", "Beard Sculpt & Cedar Oil", "Contour trim, steam compress & botanical balm", 1600, 30, 0, "SRV-402"),
        ("srv-detox-scalp", "service", "Grooming", "Charcoal Scalp Detox", "Clarifying exfoliation & tension-relief massage", 2800, 45, 0, "SRV-403"),
        # Retail Products
        ("prd-argan-elixir", "product", "Retail Products", "Kalahari Argan Hair Elixir", "Cold-pressed shine serum (100ml)", 3400, 0, 14, "RTL-501"),
        ("prd-silk-bonnet", "product", "Retail Products", "Mulberry Silk Sleep Wrap", "Double-lined 22-momme plum silk bonnet", 2900, 0, 4, "RTL-502"),
        ("prd-bond-mask", "product", "Retail Products", "Peptide Bond Repair Masque", "Weekly restorative protein & lipid mask (250ml)", 4800, 0, 9, "RTL-503"),
        ("prd-cuticle-oil", "product", "Retail Products", "Rosehip Cuticle Pen", "Pocket botanical nail & cuticle oil", 1250, 0, 3, "RTL-504"),
        ("prd-cedar-balm", "product", "Retail Products", "Atlas Cedar Beard Butter", "Whipped shea & cedarwood grooming balm", 2100, 0, 11, "RTL-505"),
        ("prd-violet-mist", "product", "Retail Products", "No-Yellow Violet Mist", "Leave-in toning thermal protectant (150ml)", 3100, 0, 6, "RTL-506"),
    ]
    cur.executemany(
        "INSERT INTO catalog_items (id, kind, category, name, description, price_ksh, duration_min, stock_qty, sku) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        catalog,
    )

    clients = [
        ("cli-nadia", "Nadia Wanjiku", "+254 712 409 821", "nadia.w@outlook.com", "sty-chloe", "Warm honey 7G root smudge + Olaplex No.1; prefers low heat on ends.", 9, 68400, yesterday, now_iso),
        ("cli-serena", "Serena Kamau", "+254 722 883 114", "serena.kamau@gmail.com", "sty-amara", "4C coily texture; silk press at 195°C max with argan heat shield.", 6, 34500, yesterday, now_iso),
        ("cli-tariq", "Tariq Al-Mansoor", "+254 733 519 040", "tariq@atelier.ke", "sty-marcus", "Mid drop fade #1.5 guard; sensitive neck—use aloe pre-shave.", 14, 39200, today, now_iso),
        ("cli-imani", "Imani Njoroge", "+254 701 942 330", "imani.n@gmail.com", "sty-zainab", "Soft almond BIAB shade 'Sheer Linen'; almond shape medium length.", 7, 29800, today, now_iso),
        ("cli-beatrice", "Beatrice Achieng", "+254 720 671 552", "b.achieng@yahoo.com", "sty-amara", "Prefers rosemary steam before knotless installs; sensitive edges.", 4, 31000, yesterday, now_iso),
        ("cli-devon", "Devon Otieno", "+254 790 112 784", "devon.otieno@gmail.com", "sty-marcus", "High taper + cedar beard oil; likes chilled hibiscus tea on arrival.", 5, 16500, yesterday, now_iso),
        ("cli-chidinma", "Chidinma Eze", "+254 718 330 912", "chidinma.eze@gmail.com", "sty-zainab", "November bridal party lead; ivory French tip & chignon trial.", 3, 24500, yesterday, now_iso),
        ("cli-farah", "Farah Mohammed", "+254 724 908 117", "farah.m@icloud.com", "sty-chloe", "Keratin Velvet every 12 weeks; espresso gloss toner.", 8, 76000, yesterday, now_iso),
    ]
    cur.executemany(
        "INSERT INTO clients (id, name, phone, email, preferred_stylist_id, formula_notes, visit_count, total_spent_ksh, last_visit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        clients,
    )

    appointments = [
        # Today's morning settled/completed bookings
        ("apt-101", "cli-tariq", "sty-marcus", "srv-exec-fade", today, "09:00", 45, "Completed", "Regular morning taper", "tkt-1001", now_iso),
        ("apt-102", "cli-imani", "sty-zainab", "srv-biab-mani", today, "09:30", 60, "Completed", "Sheer Linen refill", "tkt-1002", now_iso),
        # Active / In-Service right now
        ("apt-103", "cli-serena", "sty-amara", "srv-silk-press", today, "10:00", 75, "In-Service", "Steam hydration + trim", "", now_iso),
        ("apt-104", "cli-nadia", "sty-chloe", "srv-balayage", today, "10:00", 150, "In-Service", "Autumn honey dimension", "", now_iso),
        # Confirmed & Pending for afternoon
        ("apt-105", "cli-devon", "sty-marcus", "srv-beard-sculpt", today, "10:30", 30, "Confirmed", "Before board meeting", "", now_iso),
        ("apt-106", "cli-chidinma", "sty-zainab", "srv-bridal-trial", today, "11:00", 90, "Confirmed", "Bringing cathedral veil", "", now_iso),
        ("apt-107", "cli-beatrice", "sty-amara", "srv-knotless", today, "12:00", 150, "Confirmed", "Color 1B/27 blend", "", now_iso),
        ("apt-108", "cli-farah", "sty-chloe", "srv-keratin", today, "13:30", 120, "Pending", "Confirm deposit via M-Pesa", "", now_iso),
        ("apt-109", "cli-imani", "sty-zainab", "srv-spa-pedi", today, "14:00", 60, "Confirmed", "Lavender scrub", "", now_iso),
        ("apt-110", "cli-tariq", "sty-marcus", "srv-detox-scalp", today, "14:30", 45, "Pending", "Waitlist slot moved up", "", now_iso),
        ("apt-111", "cli-serena", "sty-amara", "srv-editorial-cut", today, "15:30", 60, "Confirmed", "Layer refresh", "", now_iso),
        # Tomorrow's bookings
        ("apt-201", "cli-nadia", "sty-chloe", "srv-botanical-gloss", tomorrow, "10:00", 60, "Confirmed", "Post-balayage gloss check", "", now_iso),
        ("apt-202", "cli-chidinma", "sty-zainab", "srv-biab-mani", tomorrow, "11:00", 60, "Confirmed", "Bridal nail prep", "", now_iso),
        ("apt-203", "cli-beatrice", "sty-amara", "srv-silk-press", tomorrow, "13:00", 75, "Pending", "Requested corner suite", "", now_iso),
    ]
    cur.executemany(
        "INSERT INTO appointments (id, client_id, stylist_id, service_id, date, start_time, duration_min, status, notes, ticket_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        appointments,
    )

    # Seed 3 realistic settled morning tickets for today + 1 from yesterday
    tickets = [
        ("tkt-1001", "SP-2026-0841", "cli-tariq", "Tariq Al-Mansoor", "apt-101", 4300, 0, 593, 4300, "M-Pesa", 4300, 0, "Paid", f"{today}T09:52:00", today),
        ("tkt-1002", "SP-2026-0842", "cli-imani", "Imani Njoroge", "apt-102", 4450, 0, 614, 4450, "Card", 4450, 0, "Paid", f"{today}T10:34:00", today),
        ("tkt-1003", "SP-2026-0843", "", "Walk-In Guest", "", 6200, 620, 769, 5580, "Cash", 6000, 420, "Paid", f"{today}T10:48:00", today),
    ]
    cur.executemany(
        "INSERT INTO tickets (id, ticket_number, client_id, client_name, appointment_id, subtotal_ksh, discount_ksh, tax_ksh, total_ksh, payment_method, tendered_ksh, change_ksh, status, created_at, business_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        tickets,
    )

    ticket_items = [
        ("ti-1", "tkt-1001", "srv-exec-fade", "Executive Taper & Hot Towel", "service", "sty-marcus", "Marcus Kiprop", 1, 2200, 2200, 770),
        ("ti-2", "tkt-1001", "prd-cedar-balm", "Atlas Cedar Beard Butter", "product", "sty-marcus", "Marcus Kiprop", 1, 2100, 2100, 210),
        ("ti-3", "tkt-1002", "srv-biab-mani", "BIAB Builder Manicure", "service", "sty-zainab", "Zainab Hassan", 1, 3200, 3200, 1120),
        ("ti-4", "tkt-1002", "prd-cuticle-oil", "Rosehip Cuticle Pen", "product", "sty-zainab", "Zainab Hassan", 1, 1250, 1250, 125),
        ("ti-5", "tkt-1003", "srv-botanical-gloss", "Botanical Scalp & Gloss", "service", "sty-chloe", "Chloe Muthoni", 1, 5200, 5200, 1976),
        ("ti-6", "tkt-1003", "prd-cuticle-oil", "Rosehip Cuticle Pen", "product", "sty-amara", "Amara Ochieng", 1, 1000, 1000, 100),
    ]
    cur.executemany(
        "INSERT INTO ticket_items (id, ticket_id, catalog_item_id, item_name, kind, stylist_id, stylist_name, quantity, unit_price_ksh, line_total_ksh, commission_ksh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ticket_items,
    )


def row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row) if row is not None else {}


def fetch_appointments(conn: sqlite3.Connection, date_str: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT a.*,
               c.name AS client_name,
               c.phone AS client_phone,
               c.formula_notes AS client_formula,
               s.name AS stylist_name,
               s.role AS stylist_role,
               s.avatar_url AS stylist_avatar,
               i.name AS service_name,
               i.category AS service_category,
               i.price_ksh AS service_price_ksh
        FROM appointments a
        JOIN clients c ON a.client_id = c.id
        JOIN stylists s ON a.stylist_id = s.id
        JOIN catalog_items i ON a.service_id = i.id
        WHERE a.date = ?
        ORDER BY a.start_time ASC
        """,
        (date_str,),
    ).fetchall()
    return [dict(r) for r in rows]


def check_conflict(
    conn: sqlite3.Connection,
    stylist_id: str,
    date_str: str,
    start_time: str,
    duration_min: int,
    exclude_id: str = "",
) -> dict | None:
    new_start = time_to_minutes(start_time)
    new_end = new_start + duration_min
    rows = conn.execute(
        """
        SELECT a.id, a.start_time, a.duration_min, c.name AS client_name, i.name AS service_name
        FROM appointments a
        JOIN clients c ON a.client_id = c.id
        JOIN catalog_items i ON a.service_id = i.id
        WHERE a.stylist_id = ? AND a.date = ? AND a.status NOT IN ('Cancelled', 'No-Show')
        """,
        (stylist_id, date_str),
    ).fetchall()
    for r in rows:
        if exclude_id and r["id"] == exclude_id:
            continue
        ex_start = time_to_minutes(r["start_time"])
        ex_end = ex_start + int(r["duration_min"])
        if new_start < ex_end and new_end > ex_start:
            return {
                "conflict_id": r["id"],
                "client_name": r["client_name"],
                "service_name": r["service_name"],
                "window": f"{r['start_time']}–{minutes_to_time(ex_end)}",
            }
    return None


def compute_analytics(conn: sqlite3.Connection, date_str: str) -> dict:
    paid_tickets = conn.execute(
        "SELECT * FROM tickets WHERE business_date = ? AND status = 'Paid'",
        (date_str,),
    ).fetchall()
    all_today_tickets = conn.execute(
        "SELECT COUNT(*) FROM tickets WHERE business_date = ?",
        (date_str,),
    ).fetchone()[0]

    gross_revenue = sum(r["total_ksh"] for r in paid_tickets)
    total_discounts = sum(r["discount_ksh"] for r in paid_tickets)
    settled_count = len(paid_tickets)
    avg_ticket = round(gross_revenue / settled_count) if settled_count > 0 else 0

    by_method = {"M-Pesa": 0, "Card": 0, "Cash": 0}
    for r in paid_tickets:
        m = r["payment_method"]
        by_method[m] = by_method.get(m, 0) + r["total_ksh"]

    # Commission leaderboard across paid tickets for the date
    stylist_rows = conn.execute("SELECT id, name, role, avatar_url, commission_rate FROM stylists WHERE active = 1").fetchall()
    stylist_stats = {
        s["id"]: {
            "stylist_id": s["id"],
            "name": s["name"],
            "role": s["role"],
            "avatar_url": s["avatar_url"],
            "commission_rate": s["commission_rate"],
            "revenue_ksh": 0,
            "commission_ksh": 0,
            "services_count": 0,
        }
        for s in stylist_rows
    }

    item_rows = conn.execute(
        """
        SELECT ti.stylist_id, ti.line_total_ksh, ti.commission_ksh, ti.quantity
        FROM ticket_items ti
        JOIN tickets t ON ti.ticket_id = t.id
        WHERE t.business_date = ? AND t.status = 'Paid'
        """,
        (date_str,),
    ).fetchall()

    total_commissions = 0
    for ir in item_rows:
        sid = ir["stylist_id"]
        total_commissions += int(ir["commission_ksh"])
        if sid in stylist_stats:
            stylist_stats[sid]["revenue_ksh"] += int(ir["line_total_ksh"])
            stylist_stats[sid]["commission_ksh"] += int(ir["commission_ksh"])
            stylist_stats[sid]["services_count"] += int(ir["quantity"])

    leaderboard = sorted(stylist_stats.values(), key=lambda x: x["revenue_ksh"], reverse=True)

    appts_today = conn.execute(
        "SELECT status, COUNT(*) as cnt FROM appointments WHERE date = ? GROUP BY status",
        (date_str,),
    ).fetchall()
    status_counts = {r["status"]: r["cnt"] for r in appts_today}
    low_stock_count = conn.execute(
        "SELECT COUNT(*) FROM catalog_items WHERE kind = 'product' AND active = 1 AND stock_qty <= 5"
    ).fetchone()[0]

    return {
        "date": date_str,
        "gross_revenue_ksh": gross_revenue,
        "total_discounts_ksh": total_discounts,
        "settled_tickets": settled_count,
        "total_tickets": all_today_tickets,
        "avg_ticket_ksh": avg_ticket,
        "total_commissions_ksh": total_commissions,
        "payment_breakdown": by_method,
        "stylist_leaderboard": leaderboard,
        "appointment_counts": status_counts,
        "low_stock_count": low_stock_count,
    }


def fetch_tickets(conn: sqlite3.Connection, date_str: str | None = None) -> list[dict]:
    if date_str:
        t_rows = conn.execute(
            "SELECT * FROM tickets WHERE business_date = ? ORDER BY created_at DESC",
            (date_str,),
        ).fetchall()
    else:
        t_rows = conn.execute("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 100").fetchall()

    result = []
    for t in t_rows:
        td = dict(t)
        items = conn.execute("SELECT * FROM ticket_items WHERE ticket_id = ?", (t["id"],)).fetchall()
        td["items"] = [dict(i) for i in items]
        result.append(td)
    return result


class SalonHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:
        # Keep stdout clean; errors still surface explicitly
        pass

    def _send_json(self, code: int, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_csv(self, filename: str, csv_text: str) -> None:
        body = csv_text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        today = datetime.date.today().isoformat()
        date_str = qs.get("date", [today])[0]

        if path == "/api/health":
            self._send_json(200, {"status": "ok", "engine": "python-sqlite"})
            return

        with DB_LOCK:
            conn = get_conn()
            try:
                if path == "/api/bootstrap":
                    stylists = [dict(r) for r in conn.execute("SELECT * FROM stylists WHERE active = 1 ORDER BY name").fetchall()]
                    catalog = [dict(r) for r in conn.execute("SELECT * FROM catalog_items WHERE active = 1 ORDER BY kind, category, name").fetchall()]
                    clients = [dict(r) for r in conn.execute("SELECT * FROM clients ORDER BY name ASC").fetchall()]
                    appointments = fetch_appointments(conn, date_str)
                    analytics = compute_analytics(conn, date_str)
                    tickets = fetch_tickets(conn, date_str)
                    self._send_json(
                        200,
                        {
                            "date": date_str,
                            "stylists": stylists,
                            "catalog": catalog,
                            "clients": clients,
                            "appointments": appointments,
                            "analytics": analytics,
                            "tickets": tickets,
                        },
                    )
                    return

                if path == "/api/appointments":
                    self._send_json(200, {"date": date_str, "appointments": fetch_appointments(conn, date_str)})
                    return

                if path == "/api/clients":
                    clients = [dict(r) for r in conn.execute("SELECT * FROM clients ORDER BY name ASC").fetchall()]
                    self._send_json(200, {"clients": clients})
                    return

                if path == "/api/catalog":
                    catalog = [dict(r) for r in conn.execute("SELECT * FROM catalog_items WHERE active = 1 ORDER BY kind, category, name").fetchall()]
                    self._send_json(200, {"catalog": catalog})
                    return

                if path == "/api/tickets":
                    filter_date = qs.get("date", [None])[0]
                    self._send_json(200, {"tickets": fetch_tickets(conn, filter_date)})
                    return

                if path == "/api/analytics":
                    self._send_json(200, compute_analytics(conn, date_str))
                    return

                if path == "/api/ledger/export":
                    tickets = fetch_tickets(conn, date_str)
                    buf = io.StringIO()
                    writer = csv.writer(buf)
                    writer.writerow([
                        "Ticket Number",
                        "Business Date",
                        "Timestamp",
                        "Client",
                        "Payment Method",
                        "Subtotal (KSh)",
                        "Discount (KSh)",
                        "VAT 16% Incl (KSh)",
                        "Total (KSh)",
                        "Status",
                        "Items",
                    ])
                    for t in tickets:
                        item_summary = "; ".join(
                            f"{it['quantity']}x {it['item_name']} ({it['stylist_name'] or 'Studio'})"
                            for it in t["items"]
                        )
                        writer.writerow([
                            t["ticket_number"],
                            t["business_date"],
                            t["created_at"],
                            t["client_name"],
                            t["payment_method"],
                            t["subtotal_ksh"],
                            t["discount_ksh"],
                            t["tax_ksh"],
                            t["total_ksh"],
                            t["status"],
                            item_summary,
                        ])
                    self._send_csv(f"salon-pro-ledger-{date_str}.csv", buf.getvalue())
                    return

                self._send_json(404, {"error": f"Unknown endpoint: {path}"})
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            finally:
                conn.close()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json()
        except Exception:
            self._send_json(400, {"error": "Invalid JSON payload"})
            return

        with DB_LOCK:
            conn = get_conn()
            try:
                if path == "/api/appointments":
                    client_id = body.get("client_id", "").strip()
                    stylist_id = body.get("stylist_id", "").strip()
                    service_id = body.get("service_id", "").strip()
                    date_str = body.get("date", datetime.date.today().isoformat()).strip()
                    start_time = body.get("start_time", "10:00").strip()
                    notes = body.get("notes", "").strip()
                    status = body.get("status", "Confirmed").strip()

                    if not (client_id and stylist_id and service_id):
                        self._send_json(400, {"error": "Client, stylist, and service are required."})
                        return

                    srv = conn.execute("SELECT duration_min FROM catalog_items WHERE id = ?", (service_id,)).fetchone()
                    if not srv:
                        self._send_json(404, {"error": "Selected service was not found."})
                        return

                    duration_min = int(body.get("duration_min") or srv["duration_min"] or 60)
                    start_mins = time_to_minutes(start_time)
                    if start_mins < 9 * 60 or start_mins + duration_min > 19 * 60 + 30:
                        self._send_json(400, {"error": "Appointments must fall within salon hours (09:00 – 19:30)."})
                        return

                    conflict = check_conflict(conn, stylist_id, date_str, start_time, duration_min)
                    if conflict:
                        self._send_json(
                            409,
                            {
                                "error": f"Scheduling conflict: stylist is booked with {conflict['client_name']} ({conflict['service_name']}) from {conflict['window']}.",
                                "conflict": conflict,
                            },
                        )
                        return

                    apt_id = f"apt-{uuid.uuid4().hex[:8]}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO appointments (id, client_id, stylist_id, service_id, date, start_time, duration_min, status, notes, ticket_id, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
                        """,
                        (apt_id, client_id, stylist_id, service_id, date_str, start_time, duration_min, status, notes, now_iso),
                    )
                    conn.commit()
                    created = [a for a in fetch_appointments(conn, date_str) if a["id"] == apt_id]
                    self._send_json(201, {"appointment": created[0] if created else None})
                    return

                if path == "/api/clients":
                    name = body.get("name", "").strip()
                    phone = body.get("phone", "").strip()
                    if not name or not phone:
                        self._send_json(400, {"error": "Client name and phone number are required."})
                        return
                    cli_id = f"cli-{uuid.uuid4().hex[:8]}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO clients (id, name, phone, email, preferred_stylist_id, formula_notes, visit_count, total_spent_ksh, last_visit, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, 0, 0, '', ?)
                        """,
                        (
                            cli_id,
                            name,
                            phone,
                            body.get("email", "").strip(),
                            body.get("preferred_stylist_id", "").strip(),
                            body.get("formula_notes", "").strip(),
                            now_iso,
                        ),
                    )
                    conn.commit()
                    row = dict(conn.execute("SELECT * FROM clients WHERE id = ?", (cli_id,)).fetchone())
                    self._send_json(201, {"client": row})
                    return

                if path == "/api/catalog":
                    kind = body.get("kind", "service").strip()
                    category = body.get("category", "Hair & Styling").strip()
                    name = body.get("name", "").strip()
                    price_ksh = int(body.get("price_ksh", 0))
                    if not name or price_ksh <= 0:
                        self._send_json(400, {"error": "Item name and a positive price in KSh are required."})
                        return
                    item_id = f"{'srv' if kind == 'service' else 'prd'}-{uuid.uuid4().hex[:8]}"
                    duration_min = int(body.get("duration_min", 60 if kind == "service" else 0))
                    stock_qty = int(body.get("stock_qty", 0 if kind == "service" else 10))
                    sku = body.get("sku", "").strip() or f"{'SRV' if kind == 'service' else 'RTL'}-{uuid.uuid4().hex[:4].upper()}"
                    conn.execute(
                        """
                        INSERT INTO catalog_items (id, kind, category, name, description, price_ksh, duration_min, stock_qty, sku)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (item_id, kind, category, name, body.get("description", "").strip(), price_ksh, duration_min, stock_qty, sku),
                    )
                    conn.commit()
                    row = dict(conn.execute("SELECT * FROM catalog_items WHERE id = ?", (item_id,)).fetchone())
                    self._send_json(201, {"item": row})
                    return

                if path == "/api/tickets/checkout":
                    items = body.get("items", [])
                    if not items:
                        self._send_json(400, {"error": "Cannot settle an empty ticket."})
                        return

                    client_id = body.get("client_id", "").strip()
                    client_name = body.get("client_name", "").strip() or "Walk-In Guest"
                    appointment_id = body.get("appointment_id", "").strip()
                    payment_method = body.get("payment_method", "M-Pesa").strip()
                    if payment_method not in ("M-Pesa", "Card", "Cash"):
                        self._send_json(400, {"error": "Invalid payment method."})
                        return

                    discount_type = body.get("discount_type", "none")
                    discount_value = float(body.get("discount_value", 0) or 0)
                    business_date = body.get("business_date", datetime.date.today().isoformat()).strip()

                    # Fetch stylists & catalog map
                    stylists_map = {
                        r["id"]: dict(r)
                        for r in conn.execute("SELECT id, name, commission_rate FROM stylists").fetchall()
                    }

                    prepared_items = []
                    subtotal_ksh = 0

                    for req_item in items:
                        cat_id = req_item.get("catalog_item_id", "")
                        qty = int(req_item.get("quantity", 1))
                        if qty <= 0:
                            continue
                        cat_row = conn.execute("SELECT * FROM catalog_items WHERE id = ?", (cat_id,)).fetchone()
                        if not cat_row:
                            self._send_json(404, {"error": f"Catalog item {cat_id} not found."})
                            return

                        if cat_row["kind"] == "product" and int(cat_row["stock_qty"]) < qty:
                            self._send_json(
                                400,
                                {"error": f"Insufficient stock for {cat_row['name']} ({cat_row['stock_qty']} remaining)."},
                            )
                            return

                        unit_price = int(cat_row["price_ksh"])
                        line_total = unit_price * qty
                        subtotal_ksh += line_total

                        sid = req_item.get("stylist_id", "") or ""
                        s_info = stylists_map.get(sid)
                        s_name = s_info["name"] if s_info else ""
                        rate = float(s_info["commission_rate"]) if (s_info and cat_row["kind"] == "service") else (0.10 if s_info else 0.0)
                        commission_ksh = round(line_total * rate)

                        prepared_items.append(
                            {
                                "id": f"ti-{uuid.uuid4().hex[:8]}",
                                "catalog_item_id": cat_id,
                                "item_name": cat_row["name"],
                                "kind": cat_row["kind"],
                                "stylist_id": sid,
                                "stylist_name": s_name,
                                "quantity": qty,
                                "unit_price_ksh": unit_price,
                                "line_total_ksh": line_total,
                                "commission_ksh": commission_ksh,
                            }
                        )

                    if not prepared_items:
                        self._send_json(400, {"error": "No valid ticket items provided."})
                        return

                    if discount_type == "percent":
                        discount_ksh = round(subtotal_ksh * min(max(discount_value, 0.0), 100.0) / 100.0)
                    elif discount_type == "fixed":
                        discount_ksh = min(round(max(discount_value, 0.0)), subtotal_ksh)
                    else:
                        discount_ksh = 0

                    total_ksh = max(0, subtotal_ksh - discount_ksh)
                    # Kenyan standard 16% VAT inclusive extraction for clear receipt reporting
                    tax_ksh = round(total_ksh * 16 / 116)

                    tendered_ksh = int(body.get("tendered_ksh") or total_ksh)
                    if payment_method == "Cash" and tendered_ksh < total_ksh:
                        self._send_json(400, {"error": f"Cash tendered (KSh {tendered_ksh:,}) is less than total (KSh {total_ksh:,})."})
                        return
                    if payment_method != "Cash":
                        tendered_ksh = total_ksh
                    change_ksh = max(0, tendered_ksh - total_ksh)

                    # Generate sequential ticket number
                    seq_count = conn.execute("SELECT COUNT(*) FROM tickets").fetchone()[0] + 841
                    ticket_id = f"tkt-{uuid.uuid4().hex[:8]}"
                    ticket_number = f"SP-{datetime.date.today().year}-{seq_count:04d}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")

                    if client_id:
                        cli_row = conn.execute("SELECT name FROM clients WHERE id = ?", (client_id,)).fetchone()
                        if cli_row:
                            client_name = cli_row["name"]

                    conn.execute(
                        """
                        INSERT INTO tickets (id, ticket_number, client_id, client_name, appointment_id, subtotal_ksh, discount_ksh, tax_ksh, total_ksh, payment_method, tendered_ksh, change_ksh, status, created_at, business_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid', ?, ?)
                        """,
                        (
                            ticket_id,
                            ticket_number,
                            client_id,
                            client_name,
                            appointment_id,
                            subtotal_ksh,
                            discount_ksh,
                            tax_ksh,
                            total_ksh,
                            payment_method,
                            tendered_ksh,
                            change_ksh,
                            now_iso,
                            business_date,
                        ),
                    )

                    for pi in prepared_items:
                        conn.execute(
                            """
                            INSERT INTO ticket_items (id, ticket_id, catalog_item_id, item_name, kind, stylist_id, stylist_name, quantity, unit_price_ksh, line_total_ksh, commission_ksh)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                pi["id"],
                                ticket_id,
                                pi["catalog_item_id"],
                                pi["item_name"],
                                pi["kind"],
                                pi["stylist_id"],
                                pi["stylist_name"],
                                pi["quantity"],
                                pi["unit_price_ksh"],
                                pi["line_total_ksh"],
                                pi["commission_ksh"],
                            ),
                        )
                        if pi["kind"] == "product":
                            conn.execute(
                                "UPDATE catalog_items SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?",
                                (pi["quantity"], pi["catalog_item_id"]),
                            )

                    if client_id:
                        conn.execute(
                            """
                            UPDATE clients
                            SET visit_count = visit_count + 1,
                                total_spent_ksh = total_spent_ksh + ?,
                                last_visit = ?
                            WHERE id = ?
                            """,
                            (total_ksh, business_date, client_id),
                        )

                    if appointment_id:
                        conn.execute(
                            "UPDATE appointments SET status = 'Completed', ticket_id = ? WHERE id = ?",
                            (ticket_id, appointment_id),
                        )

                    conn.commit()
                    settled = [t for t in fetch_tickets(conn, business_date) if t["id"] == ticket_id]
                    self._send_json(201, {"ticket": settled[0] if settled else None})
                    return

                if path.startswith("/api/tickets/") and path.endswith("/void"):
                    ticket_id = path.split("/")[3]
                    tkt = conn.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
                    if not tkt:
                        self._send_json(404, {"error": "Ticket not found."})
                        return
                    if tkt["status"] == "Voided":
                        self._send_json(400, {"error": "Ticket is already voided."})
                        return

                    items = conn.execute("SELECT * FROM ticket_items WHERE ticket_id = ?", (ticket_id,)).fetchall()
                    for it in items:
                        if it["kind"] == "product":
                            conn.execute(
                                "UPDATE catalog_items SET stock_qty = stock_qty + ? WHERE id = ?",
                                (it["quantity"], it["catalog_item_id"]),
                            )

                    if tkt["client_id"]:
                        conn.execute(
                            """
                            UPDATE clients
                            SET visit_count = MAX(0, visit_count - 1),
                                total_spent_ksh = MAX(0, total_spent_ksh - ?)
                            WHERE id = ?
                            """,
                            (tkt["total_ksh"], tkt["client_id"]),
                        )

                    if tkt["appointment_id"]:
                        conn.execute(
                            "UPDATE appointments SET status = 'Confirmed', ticket_id = '' WHERE id = ?",
                            (tkt["appointment_id"],),
                        )

                    conn.execute("UPDATE tickets SET status = 'Voided' WHERE id = ?", (ticket_id,))
                    conn.commit()
                    self._send_json(200, {"voided": True, "ticket_id": ticket_id})
                    return

                self._send_json(404, {"error": f"Unknown endpoint: {path}"})
            except Exception as exc:
                conn.rollback()
                self._send_json(500, {"error": str(exc)})
            finally:
                conn.close()

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json()
        except Exception:
            self._send_json(400, {"error": "Invalid JSON payload"})
            return

        with DB_LOCK:
            conn = get_conn()
            try:
                if path.startswith("/api/appointments/"):
                    apt_id = path.split("/")[-1]
                    existing = conn.execute("SELECT * FROM appointments WHERE id = ?", (apt_id,)).fetchone()
                    if not existing:
                        self._send_json(404, {"error": "Appointment not found."})
                        return

                    new_stylist = body.get("stylist_id", existing["stylist_id"])
                    new_date = body.get("date", existing["date"])
                    new_time = body.get("start_time", existing["start_time"])
                    new_duration = int(body.get("duration_min", existing["duration_min"]))
                    new_status = body.get("status", existing["status"])
                    new_notes = body.get("notes", existing["notes"])
                    new_service = body.get("service_id", existing["service_id"])

                    if new_status not in ("Cancelled", "No-Show") and (
                        new_stylist != existing["stylist_id"]
                        or new_date != existing["date"]
                        or new_time != existing["start_time"]
                        or new_duration != existing["duration_min"]
                    ):
                        conflict = check_conflict(conn, new_stylist, new_date, new_time, new_duration, exclude_id=apt_id)
                        if conflict:
                            self._send_json(
                                409,
                                {
                                    "error": f"Cannot reschedule: overlaps with {conflict['client_name']} ({conflict['window']}).",
                                    "conflict": conflict,
                                },
                            )
                            return

                    conn.execute(
                        """
                        UPDATE appointments
                        SET stylist_id = ?, date = ?, start_time = ?, duration_min = ?, status = ?, notes = ?, service_id = ?
                        WHERE id = ?
                        """,
                        (new_stylist, new_date, new_time, new_duration, new_status, new_notes, new_service, apt_id),
                    )
                    conn.commit()
                    updated = [a for a in fetch_appointments(conn, new_date) if a["id"] == apt_id]
                    self._send_json(200, {"appointment": updated[0] if updated else None})
                    return

                if path.startswith("/api/clients/"):
                    cli_id = path.split("/")[-1]
                    existing = conn.execute("SELECT * FROM clients WHERE id = ?", (cli_id,)).fetchone()
                    if not existing:
                        self._send_json(404, {"error": "Client not found."})
                        return
                    conn.execute(
                        """
                        UPDATE clients
                        SET name = ?, phone = ?, email = ?, preferred_stylist_id = ?, formula_notes = ?
                        WHERE id = ?
                        """,
                        (
                            body.get("name", existing["name"]),
                            body.get("phone", existing["phone"]),
                            body.get("email", existing["email"]),
                            body.get("preferred_stylist_id", existing["preferred_stylist_id"]),
                            body.get("formula_notes", existing["formula_notes"]),
                            cli_id,
                        ),
                    )
                    conn.commit()
                    row = dict(conn.execute("SELECT * FROM clients WHERE id = ?", (cli_id,)).fetchone())
                    self._send_json(200, {"client": row})
                    return

                if path.startswith("/api/catalog/"):
                    item_id = path.split("/")[-1]
                    existing = conn.execute("SELECT * FROM catalog_items WHERE id = ?", (item_id,)).fetchone()
                    if not existing:
                        self._send_json(404, {"error": "Catalog item not found."})
                        return

                    stock_delta = body.get("stock_delta")
                    new_stock = int(existing["stock_qty"])
                    if stock_delta is not None:
                        new_stock = max(0, new_stock + int(stock_delta))
                    elif "stock_qty" in body:
                        new_stock = max(0, int(body["stock_qty"]))

                    conn.execute(
                        """
                        UPDATE catalog_items
                        SET name = ?, category = ?, description = ?, price_ksh = ?, duration_min = ?, stock_qty = ?
                        WHERE id = ?
                        """,
                        (
                            body.get("name", existing["name"]),
                            body.get("category", existing["category"]),
                            body.get("description", existing["description"]),
                            int(body.get("price_ksh", existing["price_ksh"])),
                            int(body.get("duration_min", existing["duration_min"])),
                            new_stock,
                            item_id,
                        ),
                    )
                    conn.commit()
                    row = dict(conn.execute("SELECT * FROM catalog_items WHERE id = ?", (item_id,)).fetchone())
                    self._send_json(200, {"item": row})
                    return

                self._send_json(404, {"error": f"Unknown endpoint: {path}"})
            except Exception as exc:
                conn.rollback()
                self._send_json(500, {"error": str(exc)})
            finally:
                conn.close()

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        with DB_LOCK:
            conn = get_conn()
            try:
                if path.startswith("/api/appointments/"):
                    apt_id = path.split("/")[-1]
                    conn.execute("DELETE FROM appointments WHERE id = ?", (apt_id,))
                    conn.commit()
                    self._send_json(200, {"deleted": True, "id": apt_id})
                    return
                self._send_json(404, {"error": f"Unknown endpoint: {path}"})
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            finally:
                conn.close()


def main() -> None:
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), SalonHandler)
    print(f"Salon Pro Python API listening on http://127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
