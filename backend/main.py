import hashlib
import hmac
import json
import math
import os
import secrets
import sqlite3
import time
from io import BytesIO
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Union
from urllib.parse import parse_qsl, urlparse
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as ReportImage, KeepTogether
from reportlab.lib import colors

APP_ROOT = Path(__file__).resolve().parent
APP_SECRET = os.getenv("APP_SECRET") or os.getenv("MAX_BOT_TOKEN", "")
FILE_DOWNLOAD_TOKEN_TTL = int(os.getenv("FILE_DOWNLOAD_TOKEN_TTL", "900"))
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", APP_ROOT / "agromax.sqlite3"))
UPLOADS_PATH = Path(os.getenv("FILE_STORAGE_PATH", APP_ROOT / "uploads"))
ENVIRONMENT = os.getenv("NODE_ENV", "development").lower()
MAX_INIT_DATA_MAX_AGE = int(os.getenv("MAX_INIT_DATA_MAX_AGE", "3600"))
SESSION_MAX_AGE = int(os.getenv("SESSION_MAX_AGE", str(60 * 60 * 24 * 30)))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
ADMIN_SESSION_MAX_AGE = int(os.getenv("ADMIN_SESSION_MAX_AGE", "3600"))

if not APP_SECRET:
    raise RuntimeError("APP_SECRET or MAX_BOT_TOKEN must be configured")

DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOADS_PATH.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Поле рядом API", version="3.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://vicosta-bot.ru",
        "https://www.vicosta-bot.ru",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Content-Type", "Authorization", "X-Max-Init-Data"],
)
@app.middleware("http")
async def no_store_api_responses(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


router = APIRouter(prefix="/api")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DATABASE_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def ensure_column(db: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row[1] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db() -> None:
    with closing(connect()) as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                max_user_id TEXT UNIQUE NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('farmer','operator')),
                name TEXT NOT NULL,
                username TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                farmer_id TEXT NOT NULL,
                operator_id TEXT,
                field_name TEXT NOT NULL,
                area TEXT NOT NULL,
                task TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL CHECK(status IN ('pending','in_progress','completed')),
                report_url TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                field_id TEXT,
                FOREIGN KEY(farmer_id) REFERENCES users(id),
                FOREIGN KEY(field_id) REFERENCES fields(id),
                FOREIGN KEY(operator_id) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
            CREATE INDEX IF NOT EXISTS idx_orders_farmer ON orders(farmer_id);
            CREATE INDEX IF NOT EXISTS idx_orders_operator ON orders(operator_id);
            CREATE TABLE IF NOT EXISTS fields (
                id TEXT PRIMARY KEY,
                farmer_id TEXT NOT NULL,
                name TEXT NOT NULL,
                field_number INTEGER,
                crop TEXT NOT NULL,
                area REAL NOT NULL DEFAULT 0,
                geometry TEXT NOT NULL DEFAULT '{}',
                region TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(farmer_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS offers (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                operator_id TEXT NOT NULL,
                price REAL NOT NULL,
                scheduled_date TEXT NOT NULL DEFAULT '',
                comment TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),
                created_at TEXT NOT NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id),
                FOREIGN KEY(operator_id) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_offers_order ON offers(order_id);
            CREATE INDEX IF NOT EXISTS idx_offers_operator ON offers(operator_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_order_operator ON offers(order_id, operator_id);
            CREATE TABLE IF NOT EXISTS results (
                id TEXT PRIMARY KEY,
                order_id TEXT UNIQUE NOT NULL,
                operator_id TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                report_url TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id),
                FOREIGN KEY(operator_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS result_files (
                id TEXT PRIMARY KEY,
                result_id TEXT NOT NULL,
                name TEXT NOT NULL,
                content_type TEXT NOT NULL,
                url TEXT NOT NULL,
                size INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY(result_id) REFERENCES results(id)
            );
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                read INTEGER NOT NULL DEFAULT 0,
                delivered INTEGER NOT NULL DEFAULT 0,
                action_path TEXT,
                contact_username TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
            """
        )
        ensure_column(db, "orders", "field_id", "TEXT")
        ensure_column(db, "orders", "field_crop", "TEXT")
        ensure_column(db, "orders", "field_geometry", "TEXT")
        ensure_column(db, "orders", "field_region", "TEXT")
        ensure_column(db, "orders", "cancelled", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(db, "orders", "cancelled_at", "TEXT")
        ensure_column(db, "users", "username", "TEXT")
        ensure_column(db, "fields", "field_number", "INTEGER")
        ensure_column(db, "fields", "region", "TEXT")
        ensure_column(db, "notifications", "delivered", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(db, "notifications", "action_path", "TEXT")
        ensure_column(db, "notifications", "contact_username", "TEXT")
        db.commit()


def label(status: str) -> str:

    return {
        "pending": "В поиске",
        "in_progress": "В работе",
        "completed": "Готово",
        "cancelled": "Отменён",
    }.get(status, status)


def serialize(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    if item.get("cancelled"):
        item["status"] = "cancelled"
    item["status_label"] = label(item["status"])
    return item


class AuthRequest(BaseModel):
    init_data: Optional[str] = None
    user_id: Optional[Union[str, int]] = None
    role: str
    name: str = Field(default="Пользователь MAX", max_length=120)
    username: str = Field(default="", max_length=120)


class OrderCreate(BaseModel):
    field_id: str = Field(min_length=1, max_length=120)
    task: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)


class OrderComplete(BaseModel):
    report_url: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=1000)


class OrderTake(BaseModel):
    pass


class OrderCancel(BaseModel):
    reason: str = Field(default="", max_length=500)


class FieldCreate(BaseModel):
    name: str = Field(default="", max_length=120)
    crop: str = Field(min_length=2, max_length=80)
    region: str = Field(default="", max_length=200)
    geometry: dict = Field(default_factory=dict)


class OfferCreate(BaseModel):
    price: float = Field(gt=0, le=100000000)
    scheduled_date: str = Field(default="", max_length=40)
    comment: str = Field(default="", max_length=1000)


class ResultCreate(BaseModel):
    description: str = Field(default="", max_length=1000)
    report_url: str = Field(default="", max_length=500)


def parse_init_data(init_data: str) -> tuple[str, str, str]:
    token = os.getenv("MAX_BOT_TOKEN")
    if not token:
        raise HTTPException(503, "MAX_BOT_TOKEN не настроен")
    if not init_data or not init_data.strip():
        raise HTTPException(401, "Не переданы данные MAX")

    try:
        pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    except ValueError as exc:
        raise HTTPException(401, "Некорректные данные MAX") from exc

    if not pairs:
        raise HTTPException(401, "Пустые данные MAX")

    keys = [key for key, _ in pairs]
    if len(keys) != len(set(keys)):
        raise HTTPException(401, "Дублирующиеся параметры MAX")

    params = dict(pairs)
    received_hash = params.pop("hash", None)
    if not received_hash:
        raise HTTPException(401, "Отсутствует подпись MAX")

    auth_date_raw = params.get("auth_date")
    try:
        auth_date = int(auth_date_raw or "0")
    except ValueError as exc:
        raise HTTPException(401, "Некорректная дата авторизации MAX") from exc

    now_ts = int(time.time())
    if auth_date > now_ts + 300 or now_ts - auth_date > MAX_INIT_DATA_MAX_AGE:
        raise HTTPException(401, "Сессия MAX истекла")

    launch_params = "\n".join(f"{key}={value}" for key, value in sorted(params.items()))
    secret_key = hmac.new(b"WebAppData", token.encode("utf-8"), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, launch_params.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(received_hash, expected_hash):
        raise HTTPException(401, "Недействительная подпись MAX")

    try:
        user = json.loads(params.get("user", "{}"))
        max_user_id = str(user["id"])
    except (TypeError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(401, "Пользователь MAX не найден") from exc

    name = " ".join(str(part).strip() for part in (user.get("first_name"), user.get("last_name")) if part).strip()
    username = str(user.get("username") or "").strip().lstrip("@")
    return max_user_id, name or "Пользователь MAX", username


def ensure_user(db: sqlite3.Connection, max_user_id: str, role: str, name: str, username: str = "") -> str:
    row = db.execute("SELECT id FROM users WHERE max_user_id = ?", (max_user_id,)).fetchone()
    if row:
        db.execute(
            "UPDATE users SET role = ?, name = ?, username = COALESCE(NULLIF(?, ''), username), updated_at = ? WHERE id = ?",
            (role, name, username, now(), row["id"]),
        )
        return row["id"]
    user_id = str(uuid4())
    timestamp = now()
    db.execute(
        "INSERT INTO users (id, max_user_id, role, name, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, max_user_id, role, name, username or None, timestamp, timestamp),
    )
    return user_id


def notify(db: sqlite3.Connection, user_id: str, kind: str, title: str, message: str, action_path: str = "", contact_username: str = "") -> None:
    resolved_username = str(contact_username or "").strip().lstrip("@")
    db.execute(
        "INSERT INTO notifications (id, user_id, type, title, message, read, delivered, action_path, contact_username, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)",
        (str(uuid4()), user_id, kind, title, message, action_path or None, resolved_username or None, now()),
    )

def bot_internal_token() -> str:
    token = os.getenv("MAX_BOT_TOKEN", "")
    if not token:
        return ""
    return hmac.new(token.encode("utf-8"), b"agromax-notifications", hashlib.sha256).hexdigest()


def polygon_area_ha(geometry: dict) -> float:
    ring = []
    try:
        ring = geometry.get("coordinates", [[]])[0]
    except AttributeError:
        ring = []
    if not isinstance(ring, list) or len(ring) < 3:
        return 0.0
    radius = 6378137.0
    area = 0.0
    for index, point in enumerate(ring):
        next_point = ring[(index + 1) % len(ring)]
        try:
            lat1, lon1 = float(point[0]), float(point[1])
            lat2, lon2 = float(next_point[0]), float(next_point[1])
        except (TypeError, ValueError, IndexError):
            return 0.0
        lat1 = lat1 * math.pi / 180
        lat2 = lat2 * math.pi / 180
        lon1 = lon1 * math.pi / 180
        lon2 = lon2 * math.pi / 180
        area += (lon2 - lon1) * (2 + math.sin(lat1) + math.sin(lat2))
    return abs(area) * radius * radius / 2 / 10000


def create_session(db: sqlite3.Connection, user_id: str) -> str:
    session_id = secrets.token_urlsafe(48)
    timestamp = datetime.now(timezone.utc)
    expires = timestamp.timestamp() + SESSION_MAX_AGE
    db.execute(
        "INSERT INTO sessions VALUES (?, ?, ?, ?)",
        (
            session_id,
            user_id,
            timestamp.isoformat(),
            datetime.fromtimestamp(expires, timezone.utc).isoformat(),
        ),
    )
    db.execute("DELETE FROM sessions WHERE expires_at < ?", (timestamp.isoformat(),))
    return session_id


def current_user(session_id: Optional[str] = Cookie(default=None, alias="agromax_session")) -> sqlite3.Row:
    if not session_id:
        raise HTTPException(401, "Требуется авторизация")
    with closing(connect()) as db:
        row = db.execute(
            """
            SELECT u.*
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = ? AND s.expires_at >= ?
            """,
            (session_id, now()),
        ).fetchone()
    if not row:
        raise HTTPException(401, "Сессия истекла")
    return row


def require_role(user: sqlite3.Row, role: str) -> None:
    if user["role"] != role:
        raise HTTPException(403, "Недостаточно прав для этого действия")


def create_file_token(user_id: str, file_name: str, ttl: int = FILE_DOWNLOAD_TOKEN_TTL) -> str:
    expires_at = int(time.time()) + ttl
    payload = f"{user_id}:{file_name}:{expires_at}"
    signature = hmac.new(APP_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{expires_at}.{signature}"


def verify_file_token(token: str, user_id: str, file_name: str) -> bool:
    try:
        expires_raw, signature = token.split(".", 1)
        expires_at = int(expires_raw)
    except (ValueError, AttributeError):
        return False
    if expires_at < int(time.time()):
        return False
    payload = f"{user_id}:{file_name}:{expires_at}"
    expected = hmac.new(APP_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)



def create_public_report_token(order_id: str, ttl: int = 3600) -> str:
    expires_at = int(time.time()) + ttl
    payload = f"public-report:{order_id}:{expires_at}"
    signature = hmac.new(APP_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{expires_at}.{signature}"

def verify_public_report_token(token: str, order_id: str) -> bool:
    try:
        expires_raw, signature = token.split(".", 1)
        expires_at = int(expires_raw)
    except (ValueError, AttributeError):
        return False
    if expires_at < int(time.time()):
        return False
    payload = f"public-report:{order_id}:{expires_at}"
    expected = hmac.new(APP_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)

def parse_scheduled_datetime(value: str) -> str:
    raw = value.strip()
    if not raw:
        raise HTTPException(422, "Укажите дату и время выполнения")
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(422, "Некорректная дата и время выполнения") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    parsed = parsed.astimezone(timezone.utc)
    if parsed <= datetime.now(timezone.utc):
        raise HTTPException(422, "Дата и время выполнения должны быть в будущем")
    return parsed.isoformat()

def validate_report_url(value: str) -> str:
    url = value.strip()
    if not url:
        return ""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(422, "Ссылка на отчёт должна начинаться с http:// или https://")
    return url


def user_payload(user: sqlite3.Row) -> dict[str, Any]:
    return {
        "user_id": user["max_user_id"],
        "name": user["name"],
        "role": user["role"],
        "username": user["username"] or "",
    }


@router.post("/auth")
def auth(payload: AuthRequest, response: Response):
    role = payload.role.strip().lower()
    if role not in {"farmer", "operator"}:
        raise HTTPException(422, "Недопустимая роль")

    if ENVIRONMENT == "production":
        if not payload.init_data:
            raise HTTPException(401, "Откройте «Поле рядом» внутри MAX")
        max_user_id, max_name, max_username = parse_init_data(payload.init_data)
        if payload.user_id is not None and str(payload.user_id) != max_user_id:
            raise HTTPException(401, "Идентификатор пользователя не совпадает с MAX")
        name = max_name
        max_username = max_username or payload.username.strip().lstrip("@")
    elif payload.init_data:
        try:
            max_user_id, max_name, max_username = parse_init_data(payload.init_data)
            name = max_name
        except HTTPException:
            max_user_id = str(payload.user_id or "preview-user")
            name = payload.name.strip() or "Пользователь MAX"
            max_username = payload.username.strip().lstrip("@")
    else:
        max_user_id = str(payload.user_id or "preview-user")
        name = payload.name.strip() or "Пользователь MAX"
        max_username = payload.username.strip().lstrip("@")

    with closing(connect()) as db:
        internal_id = ensure_user(db, max_user_id, role, name, max_username)
        session_id = create_session(db, internal_id)
        db.commit()
        user = db.execute("SELECT * FROM users WHERE id = ?", (internal_id,)).fetchone()

    response.set_cookie(
        key="agromax_session",
        value=session_id,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=ENVIRONMENT == "production",
        samesite="none" if ENVIRONMENT == "production" else "lax",
        path="/",
    )
    return user_payload(user)


@router.post("/logout")
def logout(response: Response, session_id: Optional[str] = Cookie(default=None, alias="agromax_session")):
    if session_id:
        with closing(connect()) as db:
            db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            db.commit()
    response.delete_cookie("agromax_session", path="/")
    return {"ok": True}


@router.get("/me")
def me(user: sqlite3.Row = Depends(current_user)):
    return user_payload(user)


@router.get("/orders")
def orders(user: sqlite3.Row = Depends(current_user)):
    require_role(user, "operator")
    with closing(connect()) as db:
        rows = db.execute(
            """
            SELECT o.*,
                   COALESCE(o.field_region, f.region) AS field_region,
                   my_offer.id AS my_offer_id,
                   my_offer.status AS my_offer_status,
                   my_offer.price AS my_offer_price,
                   my_offer.scheduled_date AS my_offer_scheduled_date,
                   my_offer.comment AS my_offer_comment,
                   my_offer.created_at AS my_offer_created_at,
                   (SELECT COUNT(*) FROM offers all_offers WHERE all_offers.order_id = o.id) AS offers_count
            FROM orders o
            LEFT JOIN fields f ON f.id = o.field_id
            LEFT JOIN offers my_offer ON my_offer.order_id = o.id AND my_offer.operator_id = ?
            WHERE o.status = 'pending' AND COALESCE(o.cancelled,0) = 0 AND o.farmer_id != ?
            ORDER BY o.created_at DESC
            """,
            (user["id"], user["id"]),
        ).fetchall()
    return [serialize(row) for row in rows]


@router.get("/orders/my")
def my_orders(user: sqlite3.Row = Depends(current_user)):
    require_role(user, "farmer")
    with closing(connect()) as db:
        rows = db.execute(
            "SELECT * FROM orders WHERE farmer_id = ? ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
    return [serialize(row) for row in rows]


@router.get("/orders/operator")
def operator_orders(user: sqlite3.Row = Depends(current_user)):
    require_role(user, "operator")
    with closing(connect()) as db:
        rows = db.execute(
            "SELECT o.*, COALESCE(o.field_region, f.region) AS field_region FROM orders o LEFT JOIN fields f ON f.id = o.field_id WHERE o.operator_id = ? AND o.status = 'in_progress' AND COALESCE(o.cancelled,0) = 0 ORDER BY o.updated_at DESC",
            (user["id"],),
        ).fetchall()
    return [serialize(row) for row in rows]

@router.get("/orders/operator/history")
def operator_order_history(user: sqlite3.Row = Depends(current_user)):
    require_role(user, "operator")
    with closing(connect()) as db:
        rows = db.execute(
            "SELECT o.*, COALESCE(o.field_region, f.region) AS field_region FROM orders o LEFT JOIN fields f ON f.id = o.field_id WHERE o.operator_id = ? ORDER BY o.updated_at DESC",
            (user["id"],),
        ).fetchall()
    return [serialize(row) for row in rows]


@router.get("/orders/{order_id}")
def get_order(order_id: str, user: sqlite3.Row = Depends(current_user)):
    with closing(connect()) as db:
        row = db.execute(
            """
            SELECT o.*,
                   COALESCE(o.field_crop, f.crop) AS field_crop,
                   COALESCE(o.field_geometry, f.geometry) AS field_geometry,
                   COALESCE(o.field_region, f.region) AS field_region,
                   farmer.name AS farmer_name,
                   farmer.username AS farmer_username,
                   operator.name AS operator_name,
                   operator.username AS operator_username,
                   accepted_offer.price AS accepted_offer_price,
                   accepted_offer.scheduled_date AS accepted_offer_scheduled_date,
                   accepted_offer.comment AS accepted_offer_comment,
                   own_offer.id AS my_offer_id,
                   own_offer.status AS my_offer_status,
                   own_offer.price AS my_offer_price,
                   own_offer.scheduled_date AS my_offer_scheduled_date,
                   own_offer.comment AS my_offer_comment,
                   own_offer.created_at AS my_offer_created_at
            FROM orders o
            LEFT JOIN fields f ON f.id = o.field_id
            LEFT JOIN users farmer ON farmer.id = o.farmer_id
            LEFT JOIN users operator ON operator.id = o.operator_id
            LEFT JOIN offers accepted_offer ON accepted_offer.order_id = o.id AND accepted_offer.status = 'accepted'
            LEFT JOIN offers own_offer ON own_offer.order_id = o.id AND own_offer.operator_id = ?
            WHERE o.id = ?
            """,
            (user["id"], order_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Заказ не найден")
        if user["role"] == "farmer" and row["farmer_id"] != user["id"]:
            raise HTTPException(403, "Нет доступа к заказу")
        if user["role"] == "operator" and row["farmer_id"] != user["id"] and row["operator_id"] != user["id"] and row["status"] != "pending":
            raise HTTPException(403, "Нет доступа к заказу")
    return serialize(row)


@router.post("/orders", status_code=201)
def create_order(payload: OrderCreate, user: sqlite3.Row = Depends(current_user)):
    require_role(user, "farmer")
    order_id, timestamp = str(uuid4()), now()
    with closing(connect()) as db:
        field = db.execute(
            "SELECT id, name, field_number, area, crop, geometry, region FROM fields WHERE id = ? AND farmer_id = ?",
            (payload.field_id.strip(), user["id"]),
        ).fetchone()
        if not field:
            raise HTTPException(400, "Выбранное поле не найдено")
        field_name = f"Поле №{field['field_number']}" + (f" «{field['name']}»" if field["name"] else "")
        try:
            canonical_area = round(polygon_area_ha(json.loads(field["geometry"])), 2)
        except Exception:
            canonical_area = round(float(field["area"]), 2)
        db.execute(
            """
            INSERT INTO orders (id, farmer_id, operator_id, field_name, area, task, description, status, report_url, created_at, updated_at, field_id, field_crop, field_geometry, field_region)
            VALUES (?, ?, NULL, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?, ?, ?)
            """,
            (
                order_id,
                user["id"],
                field_name,
                f"{canonical_area:.2f}",
                payload.task.strip(),
                payload.description.strip(),
                timestamp,
                timestamp,
                field["id"],
                field["crop"],
                field["geometry"],
                field["region"],
            ),
        )
        db.commit()
        row = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    return serialize(row)


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: str, payload: OrderCancel, user: sqlite3.Row = Depends(current_user)):
    require_role(user, "farmer")
    with closing(connect()) as db:
        order = db.execute(
            "SELECT * FROM orders WHERE id = ? AND farmer_id = ?",
            (order_id, user["id"]),
        ).fetchone()
        if not order:
            raise HTTPException(404, "Заказ не найден")
        if order["cancelled"]:
            raise HTTPException(409, "Заказ уже отменён")
        if order["status"] == "completed":
            raise HTTPException(409, "Завершённый заказ нельзя отменить")

        timestamp = now()
        changed = db.execute(
            "UPDATE orders SET cancelled = 1, cancelled_at = ?, updated_at = ? WHERE id = ? AND farmer_id = ? AND COALESCE(cancelled,0) = 0 AND status != 'completed'",
            (timestamp, timestamp, order_id, user["id"]),
        ).rowcount
        if not changed:
            raise HTTPException(409, "Заказ уже изменён")

        db.execute("UPDATE offers SET status = 'rejected' WHERE order_id = ? AND status = 'pending'", (order_id,))

        recipients = set()
        if order["operator_id"]:
            recipients.add(order["operator_id"])
        for offer in db.execute("SELECT operator_id FROM offers WHERE order_id = ?", (order_id,)).fetchall():
            recipients.add(offer["operator_id"])
        reason = payload.reason.strip()
        message = f"Фермер отменил заказ «{order['field_name']}»." + (f" Причина: {reason}" if reason else "")
        for operator_id in recipients:
            if operator_id == user["id"]:
                continue
            operator_row = db.execute("SELECT username FROM users WHERE id = ?", (operator_id,)).fetchone()
            notify(db, operator_id, "ORDER_CANCELLED", "Заказ отменён", message, "/operator", operator_row["username"] if operator_row else "")
        db.commit()
        row = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    return serialize(row)


@router.put("/orders/{order_id}/take")
def take_order(order_id: str, _: OrderTake, user: sqlite3.Row = Depends(current_user)):
    require_role(user, "operator")
    with closing(connect()) as db:
        order = db.execute(
            "SELECT * FROM orders WHERE id = ? AND status = 'pending' AND COALESCE(cancelled,0) = 0 AND COALESCE(cancelled,0) = 0 AND farmer_id != ?",
            (order_id, user["id"]),
        ).fetchone()
        if not order:
            raise HTTPException(409, "Заказ уже взят или недоступен")

        timestamp = now()
        changed = db.execute(
            "UPDATE orders SET operator_id = ?, status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'pending' AND COALESCE(cancelled,0) = 0",
            (user["id"], timestamp, order_id),
        ).rowcount
        if not changed:
            raise HTTPException(409, "Заказ уже изменён")

        db.execute("UPDATE offers SET status = 'rejected' WHERE order_id = ? AND status = 'pending'", (order_id,))
        existing_direct_offer = db.execute(
            "SELECT id FROM offers WHERE order_id = ? AND operator_id = ?",
            (order_id, user["id"]),
        ).fetchone()
        if not existing_direct_offer:


            db.execute(
                "INSERT INTO offers VALUES (?, ?, ?, 0, '', ?, 'accepted', ?)",
                (str(uuid4()), order_id, user["id"], "Заказ принят оператором напрямую. Цена согласовывается отдельно.", timestamp),
            )
        notify(db, order["farmer_id"], "ORDER_TAKEN", "Заказ принят", f"Оператор взял заказ «{order['field_name']}» в работу.", f"/farmer/orders/{order_id}", user["username"] or "")
        db.commit()
        row = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    return serialize(row)


@router.put("/orders/{order_id}/complete")
def complete_order(order_id: str, payload: OrderComplete, user: sqlite3.Row = Depends(current_user)):
    require_role(user, "operator")
    with closing(connect()) as db:
        row = db.execute(
            "SELECT * FROM orders WHERE id = ? AND operator_id = ? AND status = 'in_progress' AND COALESCE(cancelled,0) = 0",
            (order_id, user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(403, "Нет доступа к этому заказу")

        existing_result = db.execute("SELECT id, report_url FROM results WHERE order_id = ?", (order_id,)).fetchone()
        has_files = bool(existing_result and db.execute("SELECT 1 FROM result_files WHERE result_id = ? LIMIT 1", (existing_result["id"],)).fetchone())
        report_url = validate_report_url(payload.report_url)
        if not report_url and not has_files:
            raise HTTPException(400, "Добавьте файл результата или ссылку на отчёт")

        timestamp = now()
        changed = db.execute(
            "UPDATE orders SET report_url = ?, status = 'completed', updated_at = ? WHERE id = ? AND operator_id = ? AND status = 'in_progress' AND COALESCE(cancelled,0) = 0",
            (report_url, timestamp, order_id, user["id"]),
        ).rowcount
        if not changed:
            raise HTTPException(409, "Заказ уже завершён")

        result = db.execute("SELECT id FROM results WHERE order_id = ?", (order_id,)).fetchone()
        if result:
            db.execute(
                "UPDATE results SET description = ?, report_url = ? WHERE id = ?",
                (payload.description.strip(), report_url, result["id"]),
            )
        else:
            db.execute(
                "INSERT INTO results VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid4()), order_id, user["id"], payload.description.strip(), report_url, timestamp),
            )

        contact = user["username"] or user["name"] or "оператор"
        notify(db, row["farmer_id"], "ORDER_COMPLETED", "Результат готов", f"Заказ «{row['field_name']}» завершён оператором {contact}.", f"/farmer/orders/{order_id}", user["username"] or "")
        db.commit()
        result_row = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    return serialize(result_row)


@router.post("/orders/{order_id}/files", status_code=201)
def upload_result_file(order_id: str, file: UploadFile = File(...), user: sqlite3.Row = Depends(current_user)):
    require_role(user, "operator")
    allowed = {
        "image/jpeg",
        "image/png",
        "application/pdf",
        "video/mp4",
        "model/gltf-binary",
        "model/gltf+json",
        "application/octet-stream",
    }
    if file.content_type not in allowed:
        raise HTTPException(415, "Формат файла не поддерживается")
    with closing(connect()) as db:
        order = db.execute(
            "SELECT * FROM orders WHERE id = ? AND operator_id = ? AND status = 'in_progress' AND COALESCE(cancelled,0) = 0",
            (order_id, user["id"]),
        ).fetchone()
        if not order:
            raise HTTPException(403, "Нет доступа к результату")

        result = db.execute("SELECT * FROM results WHERE order_id = ?", (order_id,)).fetchone()
        if result is None:
            result_id = str(uuid4())
            db.execute(
                "INSERT INTO results VALUES (?, ?, ?, '', '', ?)",
                (result_id, order_id, user["id"], now()),
            )
        else:
            result_id = result["id"]

        safe_name = Path(file.filename or "result.bin").name
        if safe_name in {"", ".", ".."}:
            raise HTTPException(400, "Некорректное имя файла")
        if len(safe_name) > 180:
            raise HTTPException(400, "Имя файла слишком длинное")
        file_id = str(uuid4())
        destination = UPLOADS_PATH / f"{file_id}-{safe_name}"
        size = 0
        try:
            with destination.open("wb") as output:
                while True:
                    chunk = file.file.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise HTTPException(413, f"Файл слишком большой. Максимум {MAX_UPLOAD_BYTES // (1024 * 1024)} МБ")
                    output.write(chunk)
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        url = f"/api/files/{destination.name}"
        db.execute(
            "INSERT INTO result_files VALUES (?, ?, ?, ?, ?, ?, ?)",
            (file_id, result_id, safe_name, file.content_type or "application/octet-stream", url, size, now()),
        )
        db.commit()

    return {
        "id": file_id,
        "name": safe_name,
        "content_type": file.content_type,
        "url": url,
        "download_url": f"{url}?token={create_file_token(user['id'], destination.name)}",
        "size": size,
    }


@router.get("/files/{file_name}")
def download_result_file(
    file_name: str,
    token: Optional[str] = Query(default=None, max_length=300),
    session_id: Optional[str] = Cookie(default=None, alias="agromax_session"),
):
    safe_name = Path(file_name).name
    path = UPLOADS_PATH / safe_name
    if not path.exists() or path.name != safe_name:
        raise HTTPException(404, "Файл не найден")

    with closing(connect()) as db:
        relation = db.execute(
            """
            SELECT o.farmer_id, o.operator_id, rf.content_type
            FROM result_files rf
            JOIN results r ON r.id = rf.result_id
            JOIN orders o ON o.id = r.order_id
            WHERE rf.url = ?
            """,
            (f"/api/files/{safe_name}",),
        ).fetchone()
        if not relation:
            raise HTTPException(404, "Файл не найден")

        authorized_user_id = None
        if session_id:
            session_user = db.execute(
                "SELECT user_id FROM sessions WHERE id = ? AND expires_at >= ?",
                (session_id, now()),
            ).fetchone()
            if session_user:
                authorized_user_id = session_user["user_id"]

        token_valid = bool(
            token and (
                verify_file_token(token, relation["farmer_id"], safe_name)
                or verify_file_token(token, relation["operator_id"], safe_name)
            )
        )
        session_valid = authorized_user_id in {relation["farmer_id"], relation["operator_id"]}
        if not (token_valid or session_valid):
            raise HTTPException(403, "Нет доступа к файлу")

    from fastapi.responses import FileResponse
    return FileResponse(path, media_type=relation["content_type"] or "application/octet-stream", filename=None)


@router.get("/fields")
def get_fields(user: sqlite3.Row = Depends(current_user)):
    require_role(user, "farmer")
    with closing(connect()) as db:
        rows = db.execute("SELECT * FROM fields WHERE farmer_id = ? ORDER BY created_at DESC", (user["id"],)).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            try:
                computed = round(polygon_area_ha(json.loads(row["geometry"])), 2)
                if computed > 0:
                    item["area"] = computed
                    if abs(float(row["area"]) - computed) > 0.01:
                        db.execute("UPDATE fields SET area = ?, updated_at = ? WHERE id = ?", (computed, now(), row["id"]))
            except Exception:
                pass
            result.append(item)
        db.commit()
    return result


@router.delete("/fields/{field_id}")
def delete_field(field_id: str, user: sqlite3.Row = Depends(current_user)):
    require_role(user, "farmer")
    with closing(connect()) as db:
        field = db.execute("SELECT id, name FROM fields WHERE id = ? AND farmer_id = ?", (field_id, user["id"])).fetchone()
        if not field:
            raise HTTPException(404, "Поле не найдено")
        active = db.execute(
            "SELECT COUNT(*) AS total FROM orders WHERE field_id = ? AND status IN ('pending', 'in_progress') AND COALESCE(cancelled, 0) = 0",
            (field_id,),
        ).fetchone()["total"]
        if active:
            raise HTTPException(409, "Поле используется в активном заказе. Завершите или отмените заказ, затем повторите удаление.")

        db.execute("UPDATE orders SET field_id = NULL WHERE field_id = ?", (field_id,))
        db.execute("DELETE FROM fields WHERE id = ?", (field_id,))
        db.commit()
    return {"ok": True}


@router.post("/fields", status_code=201)
def create_field(payload: FieldCreate, user: sqlite3.Row = Depends(current_user)):
    require_role(user, "farmer")
    computed_area = polygon_area_ha(payload.geometry)
    if computed_area <= 0:
        raise HTTPException(422, "Нарисуйте корректную границу поля на карте")
    crop = payload.crop.strip()
    if len(crop) < 2 or not any(ch.isalpha() for ch in crop) or not any(ch.isalnum() for ch in crop):
        raise HTTPException(422, "Название культуры должно содержать буквы")
    if len(payload.region.strip()) > 200:
        raise HTTPException(422, "Регион указан некорректно")
    name = payload.name.strip()
    if name and len(name) < 2:
        raise HTTPException(422, "Название поля должно содержать минимум 2 символа или быть пустым")
    field_id, timestamp = str(uuid4()), now()
    with closing(connect()) as db:
        max_number = db.execute(
            "SELECT COALESCE(MAX(field_number), 0) AS max_number FROM fields WHERE farmer_id = ?",
            (user["id"],),
        ).fetchone()["max_number"]
        next_number = int(max_number or 0) + 1
        db.execute(
            "INSERT INTO fields (id, farmer_id, name, field_number, crop, area, geometry, region, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (field_id, user["id"], name, next_number, crop, round(computed_area, 2), json.dumps(payload.geometry, ensure_ascii=False), payload.region.strip(), timestamp, timestamp),
        )
        db.commit()
        row = db.execute("SELECT * FROM fields WHERE id = ?", (field_id,)).fetchone()
    return dict(row)


@router.get("/orders/{order_id}/offers")
def get_offers(order_id: str, user: sqlite3.Row = Depends(current_user)):
    require_role(user, "farmer")
    with closing(connect()) as db:
        owner = db.execute(
            "SELECT 1 FROM orders WHERE id = ? AND farmer_id = ?",
            (order_id, user["id"]),
        ).fetchone()
        if not owner:
            raise HTTPException(403, "Нет доступа к заказу")
        rows = db.execute(
            """
            SELECT o.*, u.name AS operator_name, u.username AS operator_username
            FROM offers o
            JOIN users u ON u.id = o.operator_id
            WHERE o.order_id = ?
            ORDER BY o.created_at DESC
            """,
            (order_id,),
        ).fetchall()
    return [dict(row) for row in rows]


@router.post("/orders/{order_id}/offers", status_code=201)
def create_offer(order_id: str, payload: OfferCreate, user: sqlite3.Row = Depends(current_user)):
    require_role(user, "operator")
    with closing(connect()) as db:
        order = db.execute(
            "SELECT * FROM orders WHERE id = ? AND status = 'pending' AND COALESCE(cancelled,0) = 0 AND COALESCE(cancelled,0) = 0 AND farmer_id != ?",
            (order_id, user["id"]),
        ).fetchone()
        if not order:
            raise HTTPException(409, "Заказ недоступен")

        existing = db.execute(
            "SELECT id FROM offers WHERE order_id = ? AND operator_id = ?",
            (order_id, user["id"]),
        ).fetchone()
        if existing:
            raise HTTPException(409, "Вы уже отправляли отклик на этот заказ")

        offer_id = str(uuid4())
        scheduled_date = parse_scheduled_datetime(payload.scheduled_date)
        db.execute(
            "INSERT INTO offers VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
            (
                offer_id,
                order_id,
                user["id"],
                payload.price,
                scheduled_date,
                payload.comment.strip(),
                now(),
            ),
        )
        contact = user["username"] or user["name"] or "Оператор"
        notify(db, order["farmer_id"], "NEW_OFFER", "Новый отклик на заказ", f"{contact} откликнулся на заказ «{order['field_name']}».", f"/farmer/orders/{order_id}", user["username"] or "")
        db.commit()
        row = db.execute("SELECT * FROM offers WHERE id = ?", (offer_id,)).fetchone()
    return dict(row)


@router.delete("/orders/{order_id}/offers/{offer_id}")
def cancel_offer(order_id: str, offer_id: str, user: sqlite3.Row = Depends(current_user)):
    require_role(user, "operator")
    with closing(connect()) as db:
        offer = db.execute(
            """
            SELECT o.id, o.order_id, o.status, o.operator_id, orders.field_name, orders.farmer_id, orders.status AS order_status, orders.cancelled
            FROM offers o
            JOIN orders ON orders.id = o.order_id
            WHERE o.id = ? AND o.order_id = ? AND o.operator_id = ?
            """,
            (offer_id, order_id, user["id"]),
        ).fetchone()
        if not offer:
            raise HTTPException(404, "Отклик не найден")
        if offer["status"] != "pending":
            raise HTTPException(409, "Этот отклик уже недоступен для отмены")
        if offer["order_status"] != "pending" or offer["cancelled"]:
            raise HTTPException(409, "Заказ уже изменён, отменить отклик нельзя")

        deleted = db.execute(
            "DELETE FROM offers WHERE id = ? AND order_id = ? AND operator_id = ? AND status = 'pending'",
            (offer_id, order_id, user["id"]),
        ).rowcount
        if not deleted:
            raise HTTPException(409, "Отклик уже изменён")

        operator_contact = user["username"] or user["name"] or "Оператор"
        notify(
            db,
            offer["farmer_id"],
            "OFFER_WITHDRAWN",
            "Отклик отозван",
            f"{operator_contact} отозвал отклик на заказ «{offer['field_name']}».",
            f"/farmer/orders/{order_id}",
            user["username"] or "",
        )
        db.commit()
    return {"ok": True, "order_id": order_id, "offer_id": offer_id}


@router.post("/orders/{order_id}/offers/{offer_id}/accept")
def accept_offer(order_id: str, offer_id: str, user: sqlite3.Row = Depends(current_user)):
    require_role(user, "farmer")
    with closing(connect()) as db:
        owner = db.execute(
            "SELECT * FROM orders WHERE id = ? AND farmer_id = ? AND status = 'pending'",
            (order_id, user["id"]),
        ).fetchone()
        offer = db.execute(
            "SELECT o.*, u.name AS operator_name, u.username AS operator_username FROM offers o JOIN users u ON u.id = o.operator_id WHERE o.id = ? AND o.order_id = ? AND o.status = 'pending'",
            (offer_id, order_id),
        ).fetchone()
        if not owner or not offer:
            raise HTTPException(403, "Предложение недоступно")

        timestamp = now()
        changed = db.execute(
            "UPDATE orders SET operator_id = ?, status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'pending' AND COALESCE(cancelled,0) = 0",
            (offer["operator_id"], timestamp, order_id),
        ).rowcount
        if not changed:
            raise HTTPException(409, "Заказ уже изменён")

        db.execute("UPDATE offers SET status = 'rejected' WHERE order_id = ? AND status = 'pending'", (order_id,))
        db.execute("UPDATE offers SET status = 'accepted' WHERE id = ?", (offer_id,))
        notify(db, offer["operator_id"], "OFFER_ACCEPTED", "Ваш отклик выбран", f"Фермер выбрал вас для заказа «{owner['field_name']}».", f"/operator/orders/{order_id}", user["username"] or "")
        pending_operators = db.execute(
            "SELECT operator_id FROM offers WHERE order_id = ? AND status = 'rejected' AND operator_id != ?",
            (order_id, offer["operator_id"]),
        ).fetchall()
        for item in pending_operators:
            notify(db, item["operator_id"], "OFFER_REJECTED", "Заказ закрыт", f"Заказ «{owner['field_name']}» уже передан другому оператору.", "/operator", "")
        notify(db, user["id"], "OPERATOR_ASSIGNED", "Оператор назначен", f"{offer['operator_name']} взял заказ «{owner['field_name']}» в работу.", f"/farmer/orders/{order_id}", offer["operator_username"] or "")
        db.commit()
        row = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    return serialize(row)


@router.delete("/results/{result_id}")
def delete_result(result_id: str, user: sqlite3.Row = Depends(current_user)):
    require_role(user, "farmer")
    with closing(connect()) as db:
        result = db.execute(
            """
            SELECT r.id, r.order_id
            FROM results r
            JOIN orders o ON o.id = r.order_id
            WHERE r.id = ? AND o.farmer_id = ?
            """,
            (result_id, user["id"]),
        ).fetchone()
        if not result:
            raise HTTPException(404, "Отчёт не найден")
        order_id = result["order_id"]
        _delete_result_files(db, result_id)
        db.execute("DELETE FROM results WHERE id = ?", (result_id,))


        db.execute(
            "UPDATE orders SET report_url = NULL, updated_at = ? WHERE id = ? AND farmer_id = ?",
            (now(), order_id, user["id"]),
        )
        db.commit()
    return {"ok": True, "id": result_id}


@router.get("/results")
def get_results(user: sqlite3.Row = Depends(current_user)):
    require_role(user, "farmer")
    with closing(connect()) as db:
        rows = db.execute(
            """
            SELECT r.*, o.field_name, o.area, o.task
            FROM results r
            JOIN orders o ON o.id = r.order_id
            WHERE o.farmer_id = ?
            ORDER BY r.created_at DESC
            """,
            (user["id"],),
        ).fetchall()
        results: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            files = db.execute(
                "SELECT id, name, content_type, url, size, created_at FROM result_files WHERE result_id = ? ORDER BY created_at DESC",
                (row["id"],),
            ).fetchall()
            item["files"] = []
            for file_row in files:
                file_item = dict(file_row)
                file_item["download_url"] = f"{file_row['url']}?token={create_file_token(user['id'], Path(file_row['url']).name)}"
                item["files"].append(file_item)
            report_token = create_file_token(user["id"], f"report:{row['order_id']}")
            share_token = create_public_report_token(row["order_id"])
            item["report_download_url"] = f"/api/orders/{row['order_id']}/report.pdf?token={report_token}"
            item["report_share_url"] = f"/api/orders/{row['order_id']}/report.pdf?share={share_token}"
            results.append(item)
    return results




def _register_report_font():
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                pdfmetrics.registerFont(TTFont("ReportFont", path))
                return "ReportFont"
            except Exception:
                pass
    return "Helvetica"


def build_result_pdf(order: sqlite3.Row, result: sqlite3.Row, field: sqlite3.Row | None, result_files: list[sqlite3.Row] | None = None) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=42, leftMargin=42, topMargin=42, bottomMargin=42, title=f"Отчёт {order['field_name']}")
    font_name = _register_report_font()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("report-title", parent=styles["Title"], fontName=font_name, fontSize=23, leading=28, textColor=colors.HexColor("#142033"), alignment=TA_LEFT, spaceAfter=10)
    body_style = ParagraphStyle("report-body", parent=styles["BodyText"], fontName=font_name, fontSize=10.5, leading=15, textColor=colors.HexColor("#344157"))
    section_style = ParagraphStyle("report-section", parent=body_style, fontSize=13, leading=17, textColor=colors.HexColor("#142033"), spaceAfter=6)
    story = [Paragraph("Поле рядом", ParagraphStyle("brand", parent=title_style, fontSize=11, leading=14, textColor=colors.HexColor("#5d63cf"))), Spacer(1, 4), Paragraph(f"Отчёт по {order['field_name']}", title_style)]
    area_value = f"{float(order['area'] or 0):,.2f}".replace(",", " ").replace(".", ",") + " га"
    rows = [
        ["Культура", str(order["field_crop"] or (field["crop"] if field and field["crop"] else "—"))],
        ["Площадь", area_value],
        ["Задача", str(order["task"] or "—")],
        ["Фермер", str(order["farmer_name"] or "—")],
        ["Оператор", str(order["operator_name"] or "—")],
        ["Дата результата", datetime.fromisoformat(str(result["created_at"]).replace("Z", "+00:00")).astimezone(timezone.utc).strftime("%d.%m.%Y %H:%M")],
    ]
    table = Table(rows, colWidths=[150, 300])
    table.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,-1), font_name),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("TEXTCOLOR", (0,0), (0,-1), colors.HexColor("#66758b")),
        ("TEXTCOLOR", (1,0), (1,-1), colors.HexColor("#142033")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 9),
        ("TOPPADDING", (0,0), (-1,-1), 7),
        ("LINEBELOW", (0,0), (-1,-1), 0.5, colors.HexColor("#dce3ed")),
    ]))
    story += [table, Spacer(1, 18), Paragraph("Описание выполнения", section_style), Paragraph(str(result["description"] or "Материалы облёта готовы."), body_style)]
    image_files = [f for f in (result_files or []) if str(f["content_type"] or "").startswith("image/")]
    if image_files:
        story += [Spacer(1, 20), Paragraph("Фотоматериалы", section_style)]
        for file_row in image_files:
            file_path = UPLOADS_PATH / Path(str(file_row["url"])).name
            if not file_path.exists():
                continue
            try:
                reader = ImageReader(str(file_path))
                width, height = reader.getSize()
                max_width, max_height = 500, 320
                scale = min(max_width / max(width, 1), max_height / max(height, 1), 1)
                image = ReportImage(str(file_path), width=width * scale, height=height * scale)
                story.append(KeepTogether([image, Spacer(1, 4), Paragraph(str(file_row["name"] or "Фотоматериал"), body_style), Spacer(1, 12)]))
            except Exception:
                continue
    doc.build(story)
    return buffer.getvalue()


@router.get("/orders/{order_id}/report.pdf")
def order_report(order_id: str, token: Optional[str] = Query(default=None, max_length=300), share: Optional[str] = Query(default=None, max_length=300), inline: bool = Query(default=False), session_id: Optional[str] = Cookie(default=None, alias="agromax_session")):
    with closing(connect()) as db:
        row = db.execute(
            """SELECT o.*, farmer.name AS farmer_name, operator.name AS operator_name,
                      COALESCE(o.field_crop, f.crop) AS field_crop,
                      COALESCE(o.field_region, f.region) AS field_region
               FROM orders o JOIN users farmer ON farmer.id=o.farmer_id
               LEFT JOIN users operator ON operator.id=o.operator_id
               LEFT JOIN fields f ON f.id=o.field_id
               WHERE o.id=?""",
            (order_id,),
        ).fetchone()
        result = db.execute("SELECT * FROM results WHERE order_id = ?", (order_id,)).fetchone()
        field = db.execute("SELECT * FROM fields WHERE id = ?", (row["field_id"] if row and row["field_id"] else "",)).fetchone() if row else None
    if not row or not result:
        raise HTTPException(404, "Отчёт не найден")

    allowed = False
    if token:
        allowed = verify_file_token(token, row["farmer_id"], f"report:{order_id}") or verify_file_token(token, row["operator_id"], f"report:{order_id}")
    if share:
        allowed = allowed or verify_public_report_token(share, order_id)
    if not allowed and session_id:
        with closing(connect()) as db:
            session_row = db.execute("SELECT user_id FROM sessions WHERE id = ? AND expires_at >= ?", (session_id, now())).fetchone()
        allowed = bool(session_row and session_row["user_id"] in {row["farmer_id"], row["operator_id"]})
    if not allowed:
        raise HTTPException(403, "Нет доступа к отчёту")
    with closing(connect()) as db:
        result_files = db.execute("SELECT name, content_type, url, size FROM result_files WHERE result_id = ? ORDER BY created_at ASC", (result["id"],)).fetchall()
    pdf = build_result_pdf(row, result, field, result_files)
    disposition = "inline" if inline else "attachment"
    headers = {"Content-Disposition": f'{disposition}; filename="pole-ryadom-{order_id[:8]}-report.pdf"'}
    return Response(content=pdf, media_type="application/pdf", headers=headers)


def verify_admin_password(password: str) -> bool:
    return bool(ADMIN_PASSWORD) and secrets.compare_digest(password, ADMIN_PASSWORD)


def create_admin_token(max_user_id: str) -> str:

    expires = int(time.time()) + ADMIN_SESSION_MAX_AGE
    payload = f"{max_user_id}:{expires}"
    signature = hmac.new(APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{max_user_id}_{expires}_{signature}"


def verify_admin_token(token: str) -> bool:
    try:
        max_user_id, expires, signature = token.split("_", 2)
        expires_i = int(expires)
    except (ValueError, AttributeError):
        return False
    if not max_user_id.isdigit() or expires_i < int(time.time()):
        return False
    payload = f"{max_user_id}:{expires_i}"
    expected = hmac.new(APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return secrets.compare_digest(signature, expected)


class AdminLoginRequest(BaseModel):
    user_id: str
    password: str = Field(min_length=1, max_length=200)


@router.post("/admin/login")
def admin_login(payload: AdminLoginRequest):
    if not verify_admin_password(payload.password):
        raise HTTPException(401, "Неверный пароль администратора")
    user_id = payload.user_id.strip() or "0"
    if not user_id.isdigit():
        user_id = "0"
    return {"token": create_admin_token(user_id)}


def require_admin(token: str = Query(..., min_length=20, max_length=400)) -> str:
    if not verify_admin_token(token):
        raise HTTPException(401, "Административная сессия недействительна или истекла")
    try:
        return token.split("_", 1)[0]
    except Exception:
        raise HTTPException(401, "Административная сессия недействительна")




def _delete_result_files(db: sqlite3.Connection, result_id: str) -> None:
    rows = db.execute("SELECT url FROM result_files WHERE result_id = ?", (result_id,)).fetchall()
    for row in rows:
        try:
            (UPLOADS_PATH / Path(str(row["url"])).name).unlink(missing_ok=True)
        except OSError:
            pass
    db.execute("DELETE FROM result_files WHERE result_id = ?", (result_id,))


def _delete_order(db: sqlite3.Connection, order_id: str) -> bool:
    order = db.execute("SELECT id FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        return False
    results = db.execute("SELECT id FROM results WHERE order_id = ?", (order_id,)).fetchall()
    for result in results:
        _delete_result_files(db, result["id"])
    db.execute("DELETE FROM results WHERE order_id = ?", (order_id,))
    db.execute("DELETE FROM offers WHERE order_id = ?", (order_id,))
    db.execute("DELETE FROM notifications WHERE action_path LIKE ?", (f"%/orders/{order_id}%",))
    db.execute("DELETE FROM orders WHERE id = ?", (order_id,))
    return True


@router.delete("/admin/fields/{field_id}")
def admin_delete_field(field_id: str, _: str = Depends(require_admin)):
    with closing(connect()) as db:
        field = db.execute("SELECT id, name, field_number FROM fields WHERE id = ?", (field_id,)).fetchone()
        if not field:
            raise HTTPException(404, "Поле не найдено")

        db.execute("UPDATE orders SET field_id = NULL, updated_at = ? WHERE field_id = ?", (now(), field_id))
        db.execute("DELETE FROM fields WHERE id = ?", (field_id,))
        db.commit()
    return {"ok": True, "id": field_id}


@router.delete("/admin/orders/{order_id}")
def admin_delete_order(order_id: str, _: str = Depends(require_admin)):
    with closing(connect()) as db:
        if not _delete_order(db, order_id):
            raise HTTPException(404, "Заказ не найден")
        db.commit()
    return {"ok": True, "id": order_id}


@router.delete("/admin/results/{result_id}")
def admin_delete_result(result_id: str, _: str = Depends(require_admin)):
    with closing(connect()) as db:
        result = db.execute("SELECT id, order_id FROM results WHERE id = ?", (result_id,)).fetchone()
        if not result:
            raise HTTPException(404, "Результат не найден")
        order_id = result["order_id"]
        _delete_result_files(db, result_id)
        db.execute("DELETE FROM results WHERE id = ?", (result_id,))

        db.execute("UPDATE orders SET report_url = NULL, updated_at = ? WHERE id = ?", (now(), order_id))
        db.commit()
    return {"ok": True, "id": result_id}


@router.delete("/admin/notifications/{notification_id}")
def admin_delete_notification(notification_id: str, _: str = Depends(require_admin)):
    with closing(connect()) as db:
        changed = db.execute("DELETE FROM notifications WHERE id = ?", (notification_id,)).rowcount
        if not changed:
            raise HTTPException(404, "Уведомление не найдено")
        db.commit()
    return {"ok": True, "id": notification_id}


@router.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: str, _: str = Depends(require_admin)):
    with closing(connect()) as db:
        user = db.execute("SELECT id, role, name FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "Пользователь не найден")
        farmer_orders = [row["id"] for row in db.execute("SELECT id FROM orders WHERE farmer_id = ?", (user_id,)).fetchall()]
        for order_id in farmer_orders:
            _delete_order(db, order_id)
        operator_results = [row["id"] for row in db.execute("SELECT r.id FROM results r WHERE r.operator_id = ?", (user_id,)).fetchall()]
        for result_id in operator_results:
            _delete_result_files(db, result_id)
            db.execute("DELETE FROM results WHERE id = ?", (result_id,))
        db.execute("DELETE FROM offers WHERE operator_id = ?", (user_id,))
        db.execute("UPDATE orders SET operator_id = NULL, updated_at = ? WHERE operator_id = ?", (now(), user_id))
        db.execute("DELETE FROM notifications WHERE user_id = ?", (user_id,))
        db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        db.execute("DELETE FROM fields WHERE farmer_id = ?", (user_id,))
        db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        db.commit()
    return {"ok": True, "id": user_id}

@router.get("/admin/dashboard")
def admin_dashboard(_: str = Depends(require_admin)):
    with closing(connect()) as db:
        users = db.execute("SELECT id, max_user_id, name, username, role, created_at FROM users ORDER BY created_at DESC LIMIT 200").fetchall()
        fields = db.execute("SELECT f.id, f.farmer_id, f.field_number, f.name, f.crop, f.area, f.region, f.created_at, u.name AS farmer_name, u.username AS farmer_username FROM fields f JOIN users u ON u.id = f.farmer_id ORDER BY f.created_at DESC LIMIT 200").fetchall()
        results = db.execute("""
            SELECT r.id, r.order_id, r.operator_id, r.created_at, o.field_name, o.area, o.task, farmer.name AS farmer_name, farmer.username AS farmer_username, operator.name AS operator_name, operator.username AS operator_username
            FROM results r JOIN orders o ON o.id = r.order_id
            JOIN users farmer ON farmer.id = o.farmer_id
            LEFT JOIN users operator ON operator.id = r.operator_id
            ORDER BY r.created_at DESC LIMIT 200
        """).fetchall()
        orders = db.execute("""
            SELECT o.id, o.field_name, o.area, o.task, o.status, o.cancelled, o.cancelled_at, o.created_at, o.updated_at,
                   farmer.name AS farmer_name, farmer.username AS farmer_username,
                   operator.name AS operator_name, operator.username AS operator_username
            FROM orders o
            JOIN users farmer ON farmer.id = o.farmer_id
            LEFT JOIN users operator ON operator.id = o.operator_id
            ORDER BY o.created_at DESC LIMIT 200
        """).fetchall()
        stats = {
            "users": db.execute("SELECT COUNT(*) c FROM users").fetchone()[0],
            "farmers": db.execute("SELECT COUNT(*) c FROM users WHERE role='farmer'").fetchone()[0],
            "operators": db.execute("SELECT COUNT(*) c FROM users WHERE role='operator'").fetchone()[0],
            "orders": db.execute("SELECT COUNT(*) c FROM orders").fetchone()[0],
            "in_progress": db.execute("SELECT COUNT(*) c FROM orders WHERE status='in_progress'").fetchone()[0],
            "completed": db.execute("SELECT COUNT(*) c FROM orders WHERE status='completed' AND COALESCE(cancelled,0)=0").fetchone()[0],
            "cancelled": db.execute("SELECT COUNT(*) c FROM orders WHERE COALESCE(cancelled,0)=1").fetchone()[0],
            "fields": db.execute("SELECT COUNT(*) c FROM fields").fetchone()[0],
            "results": db.execute("SELECT COUNT(*) c FROM results").fetchone()[0],
        }
    return {"stats": stats, "users": [dict(row) for row in users], "orders": [serialize(row) for row in orders], "fields": [dict(row) for row in fields], "results": [dict(row) for row in results]}

@router.get("/health")
def health():
    with closing(connect()) as db:
        db.execute("SELECT 1")
    return {"status": "ok", "service": "agromax-exchange", "database": "connected"}


@router.get("/notifications")
def get_notifications(user: sqlite3.Row = Depends(current_user)):
    with closing(connect()) as db:
        rows = db.execute(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
            (user["id"],),
        ).fetchall()
    return [dict(row) for row in rows]


@router.post("/notifications/{notification_id}/read")
def read_notification(notification_id: str, user: sqlite3.Row = Depends(current_user)):
    with closing(connect()) as db:
        changed = db.execute(
            "UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?",
            (notification_id, user["id"]),
        ).rowcount
        if not changed:
            raise HTTPException(404, "Уведомление не найдено")
        db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def read_all_notifications(user: sqlite3.Row = Depends(current_user)):
    with closing(connect()) as db:
        changed = db.execute("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0", (user["id"],)).rowcount
        db.commit()
    return {"ok": True, "count": changed}


@router.post("/bot/users/sync")
def bot_user_sync(payload: dict[str, Any], x_bot_token: Optional[str] = Header(default=None, alias="X-Bot-Token")):
    internal = bot_internal_token()
    if not internal or not hmac.compare_digest(x_bot_token or "", internal):
        raise HTTPException(401, "Недействительный токен бота")
    max_user_id = str(payload.get("max_user_id") or "").strip()
    if not max_user_id:
        raise HTTPException(422, "Не указан max_user_id")
    name = str(payload.get("name") or "Пользователь MAX").strip()[:120]
    username = str(payload.get("username") or "").strip().lstrip("@")[:120]
    with closing(connect()) as db:
        row = db.execute("SELECT id FROM users WHERE max_user_id = ?", (max_user_id,)).fetchone()
        if row:
            db.execute("UPDATE users SET name = ?, username = COALESCE(NULLIF(?, ''), username), updated_at = ? WHERE id = ?", (name, username, now(), row["id"]))
        else:
            db.execute("INSERT INTO users (id, max_user_id, role, name, username, created_at, updated_at) VALUES (?, ?, 'farmer', ?, ?, ?, ?)", (str(uuid4()), max_user_id, name, username or None, now(), now()))
        db.commit()
    return {"ok": True}

@router.get("/bot/notifications")
def bot_notifications(x_bot_token: Optional[str] = Header(default=None, alias="X-Bot-Token")):
    internal = bot_internal_token()
    if not internal or not hmac.compare_digest(x_bot_token or "", internal):
        raise HTTPException(401, "Недействительный токен бота")
    with closing(connect()) as db:
        rows = db.execute(
            """
            SELECT n.id, n.type, n.title, n.message, n.action_path, n.contact_username, n.created_at, u.max_user_id
            FROM notifications n
            JOIN users u ON u.id = n.user_id
            WHERE n.delivered = 0
            ORDER BY n.created_at ASC
            LIMIT 50
            """
        ).fetchall()
    return [dict(row) for row in rows]


@router.post("/bot/notifications/{notification_id}/delivered")
def bot_notification_delivered(notification_id: str, x_bot_token: Optional[str] = Header(default=None, alias="X-Bot-Token")):
    internal = bot_internal_token()
    if not internal or not hmac.compare_digest(x_bot_token or "", internal):
        raise HTTPException(401, "Недействительный токен бота")
    with closing(connect()) as db:
        changed = db.execute("UPDATE notifications SET delivered = 1 WHERE id = ?", (notification_id,)).rowcount
        if changed:
            db.commit()
    return {"ok": bool(changed)}


init_db()
app.include_router(router)
