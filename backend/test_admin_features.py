import datetime
import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

from backend import salon_api


class AdminFeaturesApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = salon_api.DB_PATH
        salon_api.DB_PATH = f"{self.temp_dir.name}\\test.db"
        conn = sqlite3.connect(salon_api.DB_PATH)
        conn.execute(
            """
            CREATE TABLE business_settings (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                business_name TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL,
                updated_by TEXT NOT NULL DEFAULT ''
            )
            """
        )
        conn.execute(
            """
            INSERT INTO business_settings (id, business_name, updated_at)
            VALUES (1, 'Royal Saloon & Beauty Hub', ?)
            """,
            (datetime.datetime.now().isoformat(timespec="seconds"),),
        )
        conn.commit()
        conn.close()
        salon_api.init_db()
        self.server = salon_api.ThreadingHTTPServer(("127.0.0.1", 0), salon_api.SalonHandler)
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"
        self.admin_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        status, _ = self.request(
            self.admin_opener,
            "POST",
            "/api/auth/setup",
            {
                "name": "Salon Admin",
                "username": "salonadmin",
                "email": "admin@example.test",
                "password": "Admin!Password123",
            },
        )
        self.assertEqual(status, 201)

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join(timeout=3)
        salon_api.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def request(self, opener, method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            self.base_url + path,
            data=data,
            headers={"Content-Type": "application/json"},
            method=method,
        )
        try:
            with opener.open(request, timeout=5) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            status = error.code
            body = json.loads(error.read().decode("utf-8"))
            error.close()
            return status, body

    def test_settings_are_saved_and_recorded_without_sensitive_values(self) -> None:
        status, response = self.request(
            self.admin_opener,
            "PATCH",
            "/api/settings/business",
            {
                "business_name": "Royal Studio",
                "phone": "+254700000000",
                "email": "hello@royal.example",
                "address": "Nairobi",
                "opening_time": "10:00",
                "closing_time": "18:00",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(response["settings"]["business_name"], "Royal Studio")

        status, response = self.request(self.admin_opener, "GET", "/api/bootstrap")
        self.assertEqual(status, 200)
        self.assertEqual(response["business_settings"]["email"], "hello@royal.example")
        self.assertEqual(response["business_settings"]["opening_time"], "10:00")
        client = response["clients"][0]
        stylist = response["stylists"][0]
        service = next(item for item in response["catalog"] if item["kind"] == "service")
        appointment_payload = {
            "client_id": client["id"],
            "stylist_id": stylist["id"],
            "service_id": service["id"],
            "date": (datetime.date.today() + datetime.timedelta(days=2)).isoformat(),
            "start_time": "09:30",
        }
        status, _ = self.request(
            self.admin_opener,
            "POST",
            "/api/appointments",
            appointment_payload,
        )
        self.assertEqual(status, 400)
        appointment_payload["start_time"] = "10:00"
        status, response = self.request(self.admin_opener, "POST", "/api/appointments", appointment_payload)
        self.assertEqual(status, 201)
        status, _ = self.request(
            self.admin_opener,
            "PATCH",
            f"/api/appointments/{response['appointment']['id']}",
            {"start_time": "09:30"},
        )
        self.assertEqual(status, 400)

        date = datetime.date.today().isoformat()
        status, response = self.request(self.admin_opener, "GET", f"/api/audit-logs?date={date}")
        self.assertEqual(status, 200)
        settings_event = next(entry for entry in response["entries"] if entry["entity_type"] == "business_settings")
        self.assertEqual(settings_event["actor_name"], "Salon Admin")
        self.assertNotIn("hello@royal.example", settings_event["summary"])

        status, response = self.request(
            self.admin_opener,
            "PATCH",
            "/api/settings/business",
            {"email": "not-an-email"},
        )
        self.assertEqual(status, 400)
        status, _ = self.request(
            self.admin_opener,
            "PATCH",
            "/api/settings/business",
            {"opening_time": "18:00", "closing_time": "10:00"},
        )
        self.assertEqual(status, 400)

    def test_support_requests_are_scoped_and_admin_can_respond(self) -> None:
        status, response = self.request(
            self.admin_opener,
            "POST",
            "/api/employees",
            {
                "name": "Support Staff",
                "username": "supportstaff",
                "email": "staff@example.test",
                "password": "Employee!Password123",
            },
        )
        self.assertEqual(status, 201)

        employee_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        status, _ = self.request(
            employee_opener,
            "POST",
            "/api/auth/login",
            {"username": "supportstaff", "password": "Employee!Password123", "role": "employee"},
        )
        self.assertEqual(status, 200)

        status, response = self.request(
            employee_opener,
            "POST",
            "/api/support/requests",
            {
                "category": "Appointments",
                "priority": "high",
                "subject": "Cannot update booking",
                "message": "The appointment status does not save when I update it.",
            },
        )
        self.assertEqual(status, 201)
        request_id = response["request"]["id"]

        status, response = self.request(employee_opener, "GET", "/api/support/requests")
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in response["requests"]], [request_id])
        self.assertEqual(self.request(employee_opener, "GET", "/api/audit-logs")[0], 403)
        self.assertEqual(self.request(employee_opener, "GET", "/api/settings/business")[0], 403)

        status, _ = self.request(
            employee_opener,
            "PATCH",
            f"/api/support/requests/{request_id}",
            {"status": "resolved", "admin_reply": "Done"},
        )
        self.assertEqual(status, 403)

        status, response = self.request(self.admin_opener, "GET", "/api/support/requests")
        self.assertEqual(status, 200)
        self.assertEqual(response["requests"][0]["id"], request_id)
        status, response = self.request(
            self.admin_opener,
            "PATCH",
            f"/api/support/requests/{request_id}",
            {"status": "in_progress", "admin_reply": "We are looking into this."},
        )
        self.assertEqual(status, 200)
        self.assertEqual(response["request"]["status"], "in_progress")

        status, response = self.request(employee_opener, "GET", "/api/support/requests")
        self.assertEqual(status, 200)
        self.assertEqual(response["requests"][0]["admin_reply"], "We are looking into this.")

    def test_password_change_keeps_current_session_and_revokes_other_sessions(self) -> None:
        other_admin_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        status, _ = self.request(
            other_admin_opener,
            "POST",
            "/api/auth/login",
            {"username": "salonadmin", "password": "Admin!Password123", "role": "admin"},
        )
        self.assertEqual(status, 200)

        status, _ = self.request(
            self.admin_opener,
            "POST",
            "/api/auth/change-password",
            {"current_password": "Admin!Password123", "new_password": "NewAdmin!Password456"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(self.request(self.admin_opener, "GET", "/api/auth/me")[0], 200)
        self.assertEqual(self.request(other_admin_opener, "GET", "/api/auth/me")[0], 401)

        old_login_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        status, _ = self.request(
            old_login_opener,
            "POST",
            "/api/auth/login",
            {"username": "salonadmin", "password": "Admin!Password123", "role": "admin"},
        )
        self.assertEqual(status, 401)

        new_login_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        status, _ = self.request(
            new_login_opener,
            "POST",
            "/api/auth/login",
            {"username": "salonadmin", "password": "NewAdmin!Password456", "role": "admin"},
        )
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
