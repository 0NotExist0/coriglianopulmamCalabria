"""
ItaliaBus - Vista Cerca Corse & Pianificatore Tratte
Ricerca itinerari tra fermata di partenza e destinazione con prezzi, orari e dettagli.
"""
import flet as ft
from ...core.transit_data import REAL_PULLMAN_STOPS, get_stop_by_id
from ...core.search_engine import search_trips
from ..theme import PRIMARY_COLOR, CARD_COLOR, TEXT_COLOR, TEXT_MUTED, BORDER_COLOR, SUCCESS_COLOR

class SearchView(ft.Container):
    def __init__(self, page: ft.Page):
        super().__init__(expand=True)
        self.page = page
        self.origin_id = REAL_PULLMAN_STOPS[0].id
        self.dest_id = REAL_PULLMAN_STOPS[4].id  # Rossano Scalo
        self.init_ui()

    def init_ui(self):
        stops = REAL_PULLMAN_STOPS
        options = [
            ft.dropdown.Option(
                key=s.id,
                text=f"{'⭐ ' if s.is_main_hub else '📍 '}{s.name} ({s.area})"
            ) for s in stops
        ]

        self.origin_select = ft.Dropdown(
            label="Da dove parti (Fermata / Stazione)",
            options=options,
            value=self.origin_id,
            border_color=BORDER_COLOR,
            focused_border_color=PRIMARY_COLOR,
            border_radius=8,
            expand=True
        )

        self.dest_select = ft.Dropdown(
            label="Dove vuoi arrivare (Destinazione)",
            options=options,
            value=self.dest_id,
            border_color=BORDER_COLOR,
            focused_border_color=PRIMARY_COLOR,
            border_radius=8,
            expand=True
        )

        self.results_list = ft.ListView(
            expand=True,
            spacing=8,
            padding=ft.padding.symmetric(horizontal=12, vertical=8)
        )

        self.content = ft.Column(
            expand=True,
            spacing=0,
            controls=[
                # Form di ricerca
                ft.Container(
                    bgcolor=CARD_COLOR,
                    padding=16,
                    border=ft.border.only(bottom=ft.BorderSide(1, BORDER_COLOR)),
                    content=ft.Column(
                        spacing=10,
                        controls=[
                            ft.Row([
                                ft.Icon(ft.Icons.SEARCH_ROUNDED, color=PRIMARY_COLOR, size=24),
                                ft.Text("Pianifica Viaggio & Cerca Corse", size=17, weight=ft.FontWeight.BOLD, color=TEXT_COLOR)
                            ]),
                            self.origin_select,
                            ft.Row(
                                alignment=ft.MainAxisAlignment.CENTER,
                                controls=[
                                    ft.IconButton(
                                        icon=ft.Icons.SWAP_VERT_ROUNDED,
                                        icon_color=PRIMARY_COLOR,
                                        tooltip="Inverti partenza e arrivo",
                                        on_click=self.swap_stops
                                    )
                                ]
                            ),
                            self.dest_select,
                            ft.ElevatedButton(
                                text="Cerca Soluzioni di Viaggio",
                                icon=ft.Icons.DIRECTIONS_BUS_ROUNDED,
                                bgcolor=PRIMARY_COLOR,
                                color=ft.Colors.WHITE,
                                height=44,
                                on_click=self.on_search
                            )
                        ]
                    )
                ),
                
                # Risultati
                self.results_list
            ]
        )

    def swap_stops(self, e):
        temp = self.origin_select.value
        self.origin_select.value = self.dest_select.value
        self.dest_select.value = temp
        self.page.update()

    def on_search(self, e):
        self.results_list.controls.clear()
        orig_id = self.origin_select.value
        dest_id = self.dest_select.value
        
        if orig_id == dest_id:
            self.page.snack_bar = ft.SnackBar(ft.Text("Origine e destinazione non possono coincidere!"), bgcolor=ft.Colors.RED)
            self.page.snack_bar.open = True
            self.page.update()
            return
            
        results = search_trips(orig_id, dest_id)
        
        if not results:
            self.results_list.controls.append(
                ft.Container(
                    padding=30,
                    alignment=ft.alignment.center,
                    content=ft.Column(
                        horizontal_alignment=ft.CrossAxisAlignment.center,
                        spacing=8,
                        controls=[
                            ft.Icon(ft.Icons.BUS_ALERT_ROUNDED, color=TEXT_MUTED, size=48),
                            ft.Text("Nessuna corsa diretta trovata per questa combinazione.", size=14, color=TEXT_MUTED, text_align=ft.TextAlign.CENTER)
                        ]
                    )
                )
            )
        else:
            for r in results:
                line = r["line"]
                self.results_list.controls.append(
                    ft.Container(
                        bgcolor=CARD_COLOR,
                        border=ft.border.all(1, BORDER_COLOR),
                        border_radius=12,
                        padding=14,
                        content=ft.Column(
                            spacing=8,
                            controls=[
                                ft.Row(
                                    alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                                    controls=[
                                        ft.Container(
                                            bgcolor=line.color,
                                            padding=ft.padding.symmetric(horizontal=8, vertical=4),
                                            border_radius=6,
                                            content=ft.Text(line.code, size=12, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE)
                                        ),
                                        ft.Text(f"€ {line.price_base:.2f}", size=17, weight=ft.FontWeight.BOLD, color=SUCCESS_COLOR)
                                    ]
                                ),
                                ft.Text(line.name, size=14, weight=ft.FontWeight.BOLD, color=TEXT_COLOR),
                                ft.Row(
                                    alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                                    controls=[
                                        ft.Text(f"⏱️ Durata: ~{line.duration_min} min", size=12, color=TEXT_MUTED),
                                        ft.Text(f"🏢 {line.operator}", size=12, color=TEXT_MUTED)
                                    ]
                                ),
                                ft.ElevatedButton(
                                    text="Acquista Biglietto / Prenota",
                                    icon=ft.Icons.CONFIRMATION_NUMBER_ROUNDED,
                                    bgcolor=SUCCESS_COLOR,
                                    color=ft.Colors.WHITE,
                                    on_click=lambda e, l=line: self.book_ticket(l)
                                )
                            ]
                        )
                    )
                )
        self.page.update()

    def book_ticket(self, line):
        self.page.snack_bar = ft.SnackBar(ft.Text(f"Biglietto virtuale confermato per {line.code}!"), bgcolor=SUCCESS_COLOR)
        self.page.snack_bar.open = True
        self.page.update()
