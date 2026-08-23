"""
ItaliaBus - Vista Biglietti & Portafoglio Virtuale
Visualizza i biglietti acquistati memorizzati su SQLite con QR code e dettagli completi.
"""
import flet as ft
from ...services.storage_service import storage_service
from ..theme import PRIMARY_COLOR, CARD_COLOR, TEXT_COLOR, TEXT_MUTED, BORDER_COLOR, SUCCESS_COLOR

class TicketsView(ft.Container):
    def __init__(self, page: ft.Page):
        super().__init__(expand=True)
        self.page = page
        self.init_ui()

    def init_ui(self):
        self.tickets_list = ft.ListView(
            expand=True,
            padding=16,
            spacing=12
        )
        self.refresh_tickets()

        self.content = ft.Column(
            expand=True,
            spacing=0,
            controls=[
                ft.Container(
                    bgcolor=CARD_COLOR,
                    padding=ft.padding.symmetric(horizontal=16, vertical=12),
                    border=ft.border.only(bottom=ft.BorderSide(1, BORDER_COLOR)),
                    content=ft.Row(
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                        controls=[
                            ft.Row([
                                ft.Icon(ft.Icons.CONFIRMATION_NUMBER_ROUNDED, color=PRIMARY_COLOR, size=24),
                                ft.Text("I Miei Biglietti & Abbonamenti", size=17, weight=ft.FontWeight.BOLD, color=TEXT_COLOR)
                            ]),
                            ft.IconButton(
                                icon=ft.Icons.REFRESH_ROUNDED,
                                icon_color=PRIMARY_COLOR,
                                on_click=lambda e: self.refresh_tickets()
                            )
                        ]
                    )
                ),
                self.tickets_list
            ]
        )

    def refresh_tickets(self):
        self.tickets_list.controls.clear()
        tickets = storage_service.get_tickets()
        
        if not tickets:
            self.tickets_list.controls.append(
                ft.Container(
                    padding=40,
                    alignment=ft.alignment.center,
                    content=ft.Column(
                        horizontal_alignment=ft.CrossAxisAlignment.center,
                        spacing=8,
                        controls=[
                            ft.Icon(ft.Icons.CONFIRMATION_NUMBER_OUTLINED, color=TEXT_MUTED, size=56),
                            ft.Text("Nessun biglietto nel portafoglio.", size=15, weight=ft.FontWeight.BOLD, color=TEXT_COLOR),
                            ft.Text("Pianifica un viaggio nella sezione 'Cerca' per prenotare il tuo primo biglietto.", size=12, color=TEXT_MUTED, text_align=ft.TextAlign.CENTER)
                        ]
                    )
                )
            )
            return

        for tkt in tickets:
            self.tickets_list.controls.append(
                ft.Container(
                    bgcolor=CARD_COLOR,
                    border=ft.border.all(1.5, PRIMARY_COLOR),
                    border_radius=14,
                    padding=16,
                    shadow=ft.BoxShadow(blur_radius=6, color=ft.Colors.with_opacity(0.08, ft.Colors.BLACK)),
                    content=ft.Column(
                        spacing=8,
                        controls=[
                            ft.Row(
                                alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                                controls=[
                                    ft.Container(
                                        bgcolor="#dbeafe",
                                        padding=ft.padding.symmetric(horizontal=8, vertical=4),
                                        border_radius=6,
                                        content=ft.Text(f"BIGLIETTO • {tkt['line_code']}", size=11, weight=ft.FontWeight.BOLD, color=PRIMARY_COLOR)
                                    ),
                                    ft.Container(
                                        bgcolor=ft.Colors.with_opacity(0.15, SUCCESS_COLOR),
                                        padding=ft.padding.symmetric(horizontal=8, vertical=3),
                                        border_radius=6,
                                        content=ft.Text(tkt["status"], size=11, weight=ft.FontWeight.BOLD, color=SUCCESS_COLOR)
                                    )
                                ]
                            ),
                            ft.Text(tkt["line_name"], size=14, weight=ft.FontWeight.BOLD, color=TEXT_COLOR),
                            ft.Row(
                                alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                                controls=[
                                    ft.Text(f"📍 Da: {tkt['origin_name']}", size=12, color=TEXT_MUTED),
                                    ft.Text(f"🎯 A: {tkt['dest_name']}", size=12, color=TEXT_MUTED)
                                ]
                            ),
                            ft.Text(f"📅 Data Acquisto: {tkt['booking_date']} • Prezzo: € {tkt['price']:.2f}", size=11, color=TEXT_MUTED),
                            ft.Divider(height=1, color=BORDER_COLOR),
                            ft.Row(
                                alignment=ft.MainAxisAlignment.CENTER,
                                controls=[
                                    ft.Icon(ft.Icons.QR_CODE_2_ROUNDED, size=95, color=TEXT_COLOR)
                                ]
                            ),
                            ft.Text(f"Codice Validazione: {tkt['id']}", size=11, weight=ft.FontWeight.BOLD, color=TEXT_COLOR, text_align=ft.TextAlign.CENTER),
                            ft.Text("Mostra questo QR Code al conducente o ai varchi di accesso", size=10, color=TEXT_MUTED, text_align=ft.TextAlign.CENTER)
                        ]
                    )
                )
            )
        self.page.update()
