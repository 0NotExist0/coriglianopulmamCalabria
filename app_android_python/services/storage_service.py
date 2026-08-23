"""
ItaliaBus - Storage Service
Gestione della persistenza locale (SQLite / JSON) per preferiti, cronologia e biglietti acquistati.
"""
import sqlite3
import json
import os
from typing import List, Dict, Any, Optional

DB_FILE = os.path.join(os.path.dirname(__file__), "..", "assets", "italiabus_local.db")

class StorageService:
    def __init__(self):
        os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Tabella Biglietti
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                line_code TEXT,
                line_name TEXT,
                origin_name TEXT,
                dest_name TEXT,
                price REAL,
                booking_date TEXT,
                qr_token TEXT,
                status TEXT
            )
        """)
        
        # Tabella Preferiti
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                stop_id TEXT PRIMARY KEY,
                stop_name TEXT,
                area TEXT,
                added_at TEXT
            )
        """)
        
        # Inserisci un biglietto di esempio se vuoto
        cursor.execute("SELECT COUNT(*) FROM tickets")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO tickets VALUES (
                    'TKT-2026-COR-ROS',
                    'LINEA 1',
                    'Linea Urbana 1: Corigliano ⇄ Schiavonea ⇄ Rossano',
                    'Corigliano Scalo FS',
                    'Rossano Scalo FS',
                    1.50,
                    '2026-08-23 13:30',
                    'QR_COR_ROS_2026_8841',
                    'VALIDO'
                )
            """)
            
        conn.commit()
        conn.close()

    def get_tickets(self) -> List[Dict[str, Any]]:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT id, line_code, line_name, origin_name, dest_name, price, booking_date, qr_token, status FROM tickets ORDER BY rowid DESC")
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {
                "id": r[0],
                "line_code": r[1],
                "line_name": r[2],
                "origin_name": r[3],
                "dest_name": r[4],
                "price": r[5],
                "booking_date": r[6],
                "qr_token": r[7],
                "status": r[8]
            }
            for r in rows
        ]

    def add_ticket(self, ticket: Dict[str, Any]) -> bool:
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                ticket["id"],
                ticket["line_code"],
                ticket["line_name"],
                ticket["origin_name"],
                ticket["dest_name"],
                ticket["price"],
                ticket["booking_date"],
                ticket["qr_token"],
                ticket.get("status", "VALIDO")
            ))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error adding ticket: {e}")
            return False

    def toggle_favorite(self, stop_id: str, stop_name: str, area: str) -> bool:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM favorites WHERE stop_id = ?", (stop_id,))
        exists = cursor.fetchone()
        
        if exists:
            cursor.execute("DELETE FROM favorites WHERE stop_id = ?", (stop_id,))
            is_fav = False
        else:
            cursor.execute("INSERT INTO favorites VALUES (?, ?, ?, datetime('now'))", (stop_id, stop_name, area))
            is_fav = True
            
        conn.commit()
        conn.close()
        return is_fav

    def get_favorite_ids(self) -> List[str]:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT stop_id FROM favorites")
        ids = [row[0] for row in cursor.fetchall()]
        conn.close()
        return ids

storage_service = StorageService()
