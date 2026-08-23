"""
ItaliaBus - Vista Mappa Interattiva & Navigatore Fermata
Visualizza la mappa, la posizione GPS dell'utente, la fermata più vicina e gli orari dei pullman in transito.
"""
import flet as ft
from ...core.transit_data import REAL_PULLMAN_STOPS, get_stops_by_region, Stop
from ...core.geo_engine import find_nearest_stop, estimate_walk_time_minutes
from ...core.search_engine import get_upcoming_departures_for_stop
from ..theme import PRIMARY_COLOR, CARD_COLOR, TEXT_COLOR, TEXT_MUTED, BORDER_COLOR, SUCCESS_COLOR

class MapView(ft.Container):
    def __init__(self, page: ft.Page, on_open_board=None):
        super().__init__(expand=True)
        self.page = page
        self.on_open_board = on_open_board
        
        # Default user position (Corigliano Scalo)
        self.user_lat = 39.5975
        self.user_lng = 16.5160
        self.current_region = "calabria"
        
        self.selected_stop, self.walk_dist = find_nearest_stop(self.user_lat, self.user_lng, self.current_region)
        self.init_ui()

    def init_ui(self):
        # Card Navigatore Fermata Più Vicina
        self.nav_card = self.build_nav_card()
        
        # Lista fermate esplorabili
        self.stops_list = ft.ListView(
            expand=True,
            spacing=8,
            padding=ft.padding.symmetric(horizontal=12, vertical=8)
        )
        self.refresh_stops_list()

        self.content = ft.Column(
            expand=True,
            spacing=0,
            controls=[
                # Header Mappa & GPS Controls
                ft.Container(
                    bgcolor=CARD_COLOR,
                    padding=ft.padding.symmetric(horizontal=16, vertical=12),
                    border=ft.border.only(bottom=ft.BorderSide(1, BORDER_COLOR)),
                    content=ft.Row(
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                        controls=[
                            ft.Row([
                                ft.Icon(ft.Icons.MAP_ROUNDED, color=PRIMARY_COLOR, size=24),
                                ft.Text("Navigatore Fermate GPS", size=17, weight=ft.FontWeight.BOLD, color=TEXT_COLOR)
                            ]),
                            ft.ElevatedButton(
                                text="Trova Vicina",
                                icon=ft.Icons.GPS_FIXED_ROUNDED,
                                bgcolor=PRIMARY_COLOR,
                                color=ft.Colors.WHITE,
                                on_click=self.on_gps_locate
                            )
                        ]
                    )
                ),
                
                # Mappa Grafica / Scheda Navigazione Attiva
                self.nav_card,
                
                # Titolo elenco fermate
                ft.Container(
                    padding=ft.padding.only(left=16, right=16, top=12, bottom=4),
                    content=ft.Row(
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                        controls=[
                            ft.Text("🚏 Fermate e Terminal nella Zona", size=14, weight=ft.FontWeight.W_600, color=TEXT_MUTED),
                            ft.Text(f"{len(REAL_PULLMAN_STOPS)} Nodi Attivi", size=12, color=TEXT_MUTED)
                        ]
                    )
                ),
                
                # Lista interattiva fermate
                self.stops_list
            ]
        )

    def build_nav_card(self):
        if not self.selected_stop:
            return ft.Container()
            
        walk_min = estimate_walk_time_minutes(self.walk_dist)
        deps = get_upcoming_departures_for_stop(self.selected_stop.id, limit=3)
        
        dep_items = []
        for d in deps:
            dep_items.append(
                ft.Container(
                    bgcolor="#f1f5f9",
                    border_radius=8,
                    padding=8,
                    margin=ft.margin.only(bottom=4),
                    border=ft.border.only(left=ft.BorderSide(4, d["line_color"])),
                    content=ft.Row(
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                        controls=[
                            ft.Column(
                                spacing=2,
                                controls=[
                                    ft.Text(f"{d['line_code']} ➔ {d['destination']}", size=13, weight=ft.FontWeight.BOLD, color=TEXT_COLOR),
                                    ft.Text(f"🏢 {d['operator']} • {d['bus_model']}", size=11, color=TEXT_MUTED)
                                ]
                            ),
                            ft.Container(
                                bgcolor=SUCCESS_COLOR,
                                padding=ft.padding.symmetric(horizontal=8, vertical=4),
                                border_radius=6,
                                content=ft.Text(f"🕒 {d['scheduled_time']} (tra {d['minutes_left']}m)", size=11, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE)
                            )
                        ]
                    )
                )
            )

        return ft.Container(
            bgcolor=CARD_COLOR,
            margin=ft.margin.symmetric(horizontal=12, vertical=8),
            padding=14,
            border_radius=14,
            border=ft.border.all(1.5, PRIMARY_COLOR),
            shadow=ft.BoxShadow(blur_radius=8, color=ft.Colors.with_opacity(0.12, ft.Colors.BLACK)),
            content=ft.Column(
                spacing=8,
                controls=[
                    ft.Row(
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                        controls=[
                            ft.Row([
                                ft.Container(
                                    bgcolor="#dbeafe",
                                    padding=6,
                                    border_radius=8,
                                    content=ft.Icon(ft.Icons.DIRECTIONS_BUS_ROUNDED, color=PRIMARY_COLOR, size=20)
                                ),
                                ft.Column(
                                    spacing=1,
                                    controls=[
                                        ft.Text("📍 Fermata Più Vicina", size=11, weight=ft.FontWeight.BOLD, color=PRIMARY_COLOR),
                                        ft.Text(self.selected_stop.name, size=14, weight=ft.FontWeight.BOLD, color=TEXT_COLOR, max_lines=1, overflow=ft.TextOverflow.ELLIPSIS)
                                    ]
                                )
                            ]),
                            ft.Container(
                                bgcolor="#e0f2fe",
                                padding=ft.padding.symmetric(horizontal=8, vertical=4),
                                border_radius=6,
                                content=ft.Text(f"🚶 {int(self.walk_dist)}m (~{walk_min} min)", size=11, weight=ft.FontWeight.BOLD, color=PRIMARY_COLOR)
                            )
                        ]
                    ),
                    ft.Text(f"📬 {self.selected_stop.address}", size=12, color=TEXT_MUTED),
                    ft.Divider(height=1, color=BORDER_COLOR),
                    ft.Text("Prossimi Pullman in Transito:", size=12, weight=ft.FontWeight.BOLD, color=TEXT_COLOR),
                    ft.Column(spacing=4, controls=dep_items),
                    ft.Row(
                        spacing=8,
                        controls=[
                            ft.OutlinedButton(
                                text="Tabellone Completo",
                                icon=ft.Icons.TABLE_ROWS_ROUNDED,
                                on_click=lambda e: self.on_open_board(self.selected_stop.id) if self.on_open_board else None,
                                expand=True
                            )
                        ]
                    )
                ]
            )
        )

    def refresh_stops_list(self):
        self.stops_list.controls.clear()
        stops = get_stops_by_region(self.current_region)
        
        for stop in stops:
            is_active = (self.selected_stop and self.selected_stop.id == stop.id)
            self.stops_list.controls.append(
                ft.Container(
                    bgcolor=ft.Colors.WHITE if not is_active else "#f0f9ff",
                    border=ft.border.all(1.5, PRIMARY_COLOR if is_active else BORDER_COLOR),
                    border_radius=10,
                    padding=10,
                    on_click=lambda e, s=stop: self.select_stop(s),
                    content=ft.Row(
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                        controls=[
                            ft.Row([
                                ft.Icon(
                                    ft.Icons.STARS_ROUNDED if stop.is_main_hub else ft.Icons.LOCATION_ON_ROUNDED,
                                    color=PRIMARY_COLOR if stop.is_main_hub else TEXT_MUTED,
                                    size=22
                                ),
                                ft.Column(
                                    spacing=2,
                                    controls=[
                                        ft.Text(stop.name, size=13, weight=ft.FontWeight.BOLD, color=TEXT_COLOR, max_lines=1, overflow=ft.TextOverflow.ELLIPSIS),
                                        ft.Text(f"{stop.area} • {stop.address}", size=11, color=TEXT_MUTED)
                                    ]
                                )
                            ]),
                            ft.Icon(ft.Icons.CHEVRON_RIGHT_ROUNDED, color=TEXT_MUTED, size=18)
                        ]
                    )
                )
            )

    def select_stop(self, stop: Stop):
        self.selected_stop = stop
        self.walk_dist = 120.0
        # Aggiorna la vista
        self.nav_card.content = self.build_nav_card().content
        self.refresh_stops_list()
        self.page.update()

    def on_gps_locate(self, e):
        # Simula localizzazione GPS ad alta precisione
        self.user_lat = 39.5960
        self.user_lng = 16.5180
        res = find_nearest_stop(self.user_lat, self.user_lng, self.current_region)
        if res:
            self.selected_stop, self.walk_dist = res
            self.nav_card.content = self.build_nav_card().content
            self.refresh_stops_list()
            self.page.snack_bar = ft.SnackBar(ft.Text(f"📍 Posizione GPS agganciata! Fermata più vicina: {self.selected_stop.name}"), bgcolor=PRIMARY_COLOR)
            self.page.snack_bar.open = True
            self.page.update()
