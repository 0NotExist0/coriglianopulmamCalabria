"""
ItaliaBus - Applicazione Android Nativa in Python (Flet)
Punto di ingresso principale per l'app mobile.
"""
import flet as ft
from ui.theme import get_app_theme, PRIMARY_COLOR, CARD_COLOR, TEXT_COLOR
from ui.views.map_view import MapView
from ui.views.live_board_view import LiveBoardView
from ui.views.search_view import SearchView
from ui.views.tickets_view import TicketsView
from ui.views.settings_view import SettingsView

def main(page: ft.Page):
    page.title = "ItaliaBus - Orari & Navigatore Pullman"
    page.theme = get_app_theme()
    page.theme_mode = ft.ThemeMode.LIGHT
    page.padding = 0
    page.window.width = 420
    page.window.height = 780
    
    # Callback per navigare direttamente al tabellone di una fermata
    def open_board_for_stop(stop_id: str):
        board_view.set_stop(stop_id)
        nav_bar.selected_index = 1
        switch_view(1)

    # Inizializza le 5 Viste Principali
    map_view = MapView(page, on_open_board=open_board_for_stop)
    board_view = LiveBoardView(page)
    search_view = SearchView(page)
    tickets_view = TicketsView(page)
    settings_view = SettingsView(page)

    views = [map_view, board_view, search_view, tickets_view, settings_view]
    
    # Contenitore centrale per la vista attiva
    body = ft.Container(content=views[0], expand=True)

    def switch_view(index: int):
        body.content = views[index]
        page.update()

    # Barra di navigazione inferiore Android (Material 3 NavigationBar)
    nav_bar = ft.NavigationBar(
        selected_index=0,
        bgcolor=CARD_COLOR,
        on_change=lambda e: switch_view(e.control.selected_index),
        destinations=[
            ft.NavigationBarDestination(icon=ft.Icons.MAP_OUTLINED, selected_icon=ft.Icons.MAP_ROUNDED, label="Mappa"),
            ft.NavigationBarDestination(icon=ft.Icons.SCHEDULE_OUTLINED, selected_icon=ft.Icons.SCHEDULE_ROUNDED, label="Tabellone"),
            ft.NavigationBarDestination(icon=ft.Icons.SEARCH_OUTLINED, selected_icon=ft.Icons.SEARCH_ROUNDED, label="Cerca"),
            ft.NavigationBarDestination(icon=ft.Icons.CONFIRMATION_NUMBER_OUTLINED, selected_icon=ft.Icons.CONFIRMATION_NUMBER_ROUNDED, label="Biglietti"),
            ft.NavigationBarDestination(icon=ft.Icons.SETTINGS_OUTLINED, selected_icon=ft.Icons.SETTINGS_ROUNDED, label="Impostazioni")
        ]
    )

    page.add(
        ft.Column(
            expand=True,
            spacing=0,
            controls=[
                # Top App Bar
                ft.Container(
                    bgcolor=PRIMARY_COLOR,
                    padding=ft.padding.only(left=16, right=16, top=10, bottom=10),
                    content=ft.Row(
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                        controls=[
                            ft.Row([
                                ft.Icon(ft.Icons.DIRECTIONS_BUS_ROUNDED, color=ft.Colors.WHITE, size=24),
                                ft.Text("Italia<span>Bus</span>", size=18, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE)
                            ]),
                            ft.Container(
                                bgcolor="#026aa2",
                                padding=ft.padding.symmetric(horizontal=8, vertical=4),
                                border_radius=6,
                                content=ft.Text("☀️ Calabria", size=11, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE)
                            )
                        ]
                    )
                ),
                # Vista Corrente
                body,
                # Barra Navigazione Inferiore
                nav_bar
            ]
        )
    )

if __name__ == "__main__":
    ft.app(target=main)
