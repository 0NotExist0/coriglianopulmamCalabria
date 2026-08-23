"""
ItaliaBus - Vista Biglietti & Portafoglio Virtuale
"""
import flet as ft
from ..theme import PRIMARY_COLOR, CARD_COLOR, TEXT_COLOR, TEXT_MUTED, BORDER_COLOR, SUCCESS_COLOR

class TicketsView(ft.Container):
    def __init__(self, page: ft.Page):
        super().__init__(expand=True)
        self.page = page
        self.init_ui()

    def init_ui(self):
        self.content = ft.Column(
            expand=True,
            spacing=0,
            controls=[
                ft.Container(
                    bgcolor=CARD_COLOR,
                    padding=ft.padding.symmetric(horizontal=16, vertical=12),
                    border=ft.border.only(bottom=ft.BorderSide(1, BORDER_COLOR)),
                    content=ft.Row([
                        ft.Icon(ft.Icons.CONFIRMATION_NUMBER_ROUNDED, color=PRIMARY_COLOR, size=24),
                        ft.Text("I Miei Biglietti & Abbonamenti", size=17, weight=ft.FontWeight.BOLD, color=TEXT_COLOR)
                    ])
                ),
                ft.ListView(
                    expand=True,
                    padding=16,
                    spacing=12,
                    controls=[
                        ft.Container(
                            bgcolor=CARD_COLOR,
                            border=ft.border.all(1.5, PRIMARY_COLOR),
                            border_radius=14,
                            padding=16,
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
                                                content=ft.Text("BIGLIETTO CORSA SINGOLA", size=11, weight=ft.FontWeight.BOLD, color=PRIMARY_COLOR)
                                            ),
                                            ft.Text("VALIDO", size=12, weight=ft.FontWeight.BOLD, color=SUCCESS_COLOR)
                                        ]
                                    ),
                                    ft.Text("Linea Urbana 1: Corigliano ⇄ Schiavonea ⇄ Rossano", size=14, weight=ft.FontWeight.BOLD, color=TEXT_COLOR),
                                    ft.Text("Operatore: IAS Scura / Simet TPL • Codice: TKT-2026-8841", size=11, color=TEXT_MUTED),
                                    ft.Divider(height=1, color=BORDER_COLOR),
                                    ft.Row(
                                        alignment=ft.MainAxisAlignment.CENTER,
                                        controls=[
                                            ft.Icon(ft.Icons.QR_CODE_2_ROUNDED, size=90, color=TEXT_COLOR)
                                        ]
                                    ),
                                    ft.Text("Mostra questo QR Code al conducente o ai varchi", size=11, color=TEXT_MUTED, text_align=ft.TextAlign.CENTER)
                                ]
                            )
                        )
                    ]
                )
            ]
        )
