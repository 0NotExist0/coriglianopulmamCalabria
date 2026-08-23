"""
ItaliaBus - Notification Service
Gestione notifiche in-app, avvisi sonori e promemoria partenze.
"""
from typing import Callable, Optional
import flet as ft

class NotificationService:
    def __init__(self, page: Optional[ft.Page] = None):
        self.page = page

    def set_page(self, page: ft.Page):
        self.page = page

    def show_toast(self, message: str, is_success: bool = True, action_text: str = "Chiudi"):
        if not self.page:
            return
        bg_color = "#10b981" if is_success else "#0284c7"
        self.page.snack_bar = ft.SnackBar(
            content=ft.Text(message, color=ft.Colors.WHITE, size=13, weight=ft.FontWeight.W_500),
            bgcolor=bg_color,
            action=action_text,
            action_color=ft.Colors.WHITE,
            duration=3500
        )
        self.page.snack_bar.open = True
        self.page.update()

    def schedule_bus_reminder(self, line_code: str, stop_name: str, minutes_left: int):
        msg = f"🔔 Promemoria Corsa: Il bus {line_code} da {stop_name} parte tra {minutes_left} minuti!"
        self.show_toast(msg, is_success=True)

notification_service = NotificationService()
