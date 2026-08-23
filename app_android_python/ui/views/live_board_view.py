"""
ItaliaBus - Vista Tabellone Partenze Live
Tabellone partenze stile stazione FS / aeroporto con countdown in tempo reale e selezione fermata.
"""
import flet as ft
from ...core.transit_data import REAL_PULLMAN_STOPS, get_stops_by_region, get_stop_by_id
from ...core.search_engine import get_upcoming_departures_for_stop
from ..theme import PRIMARY_COLOR, CARD_COLOR, TEXT_COLOR, TEXT_MUTED, BORDER_COLOR, SUCCESS_COLOR, WARNING_COLOR

class LiveBoardView(ft.Container):
    def __init__(self, page: ft.Page):
        super().__init__(expand=True)
        self.page = page
        self.current_stop_id = REAL_PULLMAN_STOPS[0].id
        self.init_ui()

    def init_ui(self):
        # Dropdown selezione fermata
        stops = REAL_PULLMAN_STOPS
        options = [
            ft.dropdown.Option(
                key=s.id,
                text=f"{'⭐ ' if s.is_main_hub else '📍 '}{s.name} ({s.area})"
            ) for s in stops
        ]

        self.stop_dropdown = ft.Dropdown(
            options=options,
            value=self.current_stop_id,
            on_change=self.on_stop_changed,
            expand=True,
            border_color=BORDER_COLOR,
            focused_border_color=PRIMARY_COLOR,
            border_radius=8
        )

        # Tabella partenze
        self.board_list = ft.ListView(
            expand=True,
            spacing=8,
            padding=ft.padding.symmetric(horizontal=12, vertical=8)
        )
        self.refresh_departures()

        self.content = ft.Column(
            expand=True,
            spacing=0,
            controls=[
                # Header Tabellone
                ft.Container(
                    bgcolor=CARD_COLOR,
                    padding=ft.padding.symmetric(horizontal=16, vertical=12),
                    border=ft.border.only(bottom=ft.BorderSide(1, BORDER_COLOR)),
                    content=ft.Column(
                        spacing=8,
                        controls=[
                            ft.Row(
                                alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                                controls=[
                                    ft.Row([
                                        ft.Icon(ft.Icons.SCHEDULE_ROUNDED, color=PRIMARY_COLOR, size=24),
                                        ft.Text("Tabellone Partenze Live", size=17, weight=ft.FontWeight.BOLD, color=TEXT_COLOR)
                                    ]),
                                    ft.IconButton(
                                        icon=ft.Icons.REFRESH_ROUNDED,
                                        icon_color=PRIMARY_COLOR,
                                        on_click=lambda e: self.refresh_departures(show_snack=True)
                                    )
                                ]
                            ),
                            ft.Row([
                                ft.Icon(ft.Icons.DIRECTIONS_BUS, color=TEXT_MUTED, size=18),
                                self.stop_dropdown
                            ])
                        ]
                    )
                ),
                
                # Lista partenze
                self.board_list
            ]
        )

    def refresh_departures(self, show_snack=False):
        self.board_list.controls.clear()
        deps = get_upcoming_departures_for_stop(self.current_stop_id, limit=10)
        
        stop = get_stop_by_id(self.current_stop_id)
        stop_name = stop.name if stop else "Fermata Selezionata"
        
        self.board_list.controls.append(
            ft.Container(
                bgcolor="#0f172a",
                border_radius=10,
                padding=12,
                margin=ft.margin.only(bottom=8),
                content=ft.Row(
                    alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                    controls=[
                        ft.Column(
                            spacing=2,
                            controls=[
                                ft.Text(f"Tabellone Ufficiale: {stop_name}", size=13, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE),
                                ft.Text(f"📍 {stop.address if stop else ''}", size=11, color="#94a3b8")
                            ]
                        ),
                        ft.Container(
                            bgcolor="#1e293b",
                            padding=ft.padding.symmetric(horizontal=8, vertical=4),
                            border_radius=6,
                            content=ft.Row([
                                ft.Icon(ft.Icons.CIRCLE, color=SUCCESS_COLOR, size=8),
                                ft.Text("LIVE", size=10, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE)
                            ], spacing=4)
                        )
                    ]
                )
            )
        )

        for d in deps:
            is_imminent = d["minutes_left"] <= 5
            status_color = SUCCESS_COLOR if is_imminent else PRIMARY_COLOR
            status_text = f"In Partenza ({d['minutes_left']}m)" if is_imminent else f"Tra {d['minutes_left']} min"

            self.board_list.controls.append(
                ft.Container(
                    bgcolor=CARD_COLOR,
                    border=ft.border.all(1, BORDER_COLOR),
                    border_radius=10,
                    padding=12,
                    content=ft.Row(
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                        controls=[
                            ft.Row([
                                ft.Container(
                                    bgcolor=d["line_color"],
                                    padding=ft.padding.symmetric(horizontal=8, vertical=6),
                                    border_radius=6,
                                    content=ft.Text(d["line_code"], size=12, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE)
                                ),
                                ft.Column(
                                    spacing=2,
                                    controls=[
                                        ft.Text(f"➔ {d['destination']}", size=14, weight=ft.FontWeight.BOLD, color=TEXT_COLOR),
                                        ft.Text(f"🏢 {d['operator']} • {d['platform']}", size=11, color=TEXT_MUTED)
                                    ]
                                )
                            ]),
                            ft.Column(
                                horizontal_alignment=ft.CrossAxisAlignment.END,
                                spacing=2,
                                controls=[
                                    ft.Text(d["scheduled_time"], size=16, weight=ft.FontWeight.BOLD, color=TEXT_COLOR),
                                    ft.Container(
                                        bgcolor=ft.Colors.with_opacity(0.15, status_color),
                                        padding=ft.padding.symmetric(horizontal=6, vertical=2),
                                        border_radius=4,
                                        content=ft.Text(status_text, size=10, weight=ft.FontWeight.BOLD, color=status_color)
                                    )
                                ]
                            )
                        ]
                    )
                )
            )

        if show_snack:
            self.page.snack_bar = ft.SnackBar(ft.Text("Tabellone partenze aggiornato!"), bgcolor=PRIMARY_COLOR)
            self.page.snack_bar.open = True
        self.page.update()

    def on_stop_changed(self, e):
        self.current_stop_id = e.control.value
        self.refresh_departures()

    def set_stop(self, stop_id: str):
        self.current_stop_id = stop_id
        self.stop_dropdown.value = stop_id
        self.refresh_departures()
