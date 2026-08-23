"""
ItaliaBus - Vista Impostazioni & Configurazione Regione
"""
import flet as ft
from ...core.transit_data import REGIONS
from ..theme import PRIMARY_COLOR, CARD_COLOR, TEXT_COLOR, TEXT_MUTED, BORDER_COLOR

class SettingsView(ft.Container):
    def __init__(self, page: ft.Page, on_region_change=None):
        super().__init__(expand=True)
        self.page = page
        self.on_region_change = on_region_change
        self.init_ui()

    def init_ui(self):
        region_options = [
            ft.dropdown.Option(key=r["id"], text=f"{r['icon']} {r['name']} ({r['capoluogo']})")
            for r in REGIONS
        ]

        self.region_select = ft.Dropdown(
            label="Regione Attiva",
            options=region_options,
            value="calabria",
            border_color=BORDER_COLOR,
            focused_border_color=PRIMARY_COLOR,
            border_radius=8,
            on_change=lambda e: self.on_region_change(e.control.value) if self.on_region_change else None
        )

        self.content = ft.Column(
            expand=True,
            spacing=0,
            controls=[
                ft.Container(
                    bgcolor=CARD_COLOR,
                    padding=ft.padding.symmetric(horizontal=16, vertical=12),
                    border=ft.border.only(bottom=ft.BorderSide(1, BORDER_COLOR)),
                    content=ft.Row([
                        ft.Icon(ft.Icons.SETTINGS_ROUNDED, color=PRIMARY_COLOR, size=24),
                        ft.Text("Impostazioni & Rete Trasporti", size=17, weight=ft.FontWeight.BOLD, color=TEXT_COLOR)
                    ])
                ),
                ft.ListView(
                    expand=True,
                    padding=16,
                    spacing=12,
                    controls=[
                        ft.Text("Territorio e Regione", size=14, weight=ft.FontWeight.BOLD, color=TEXT_COLOR),
                        self.region_select,
                        ft.Divider(height=1, color=BORDER_COLOR),
                        ft.Text("Notifiche e Servizi", size=14, weight=ft.FontWeight.BOLD, color=TEXT_COLOR),
                        ft.Switch(label="Notifiche Push Prossima Partenza", value=True, active_color=PRIMARY_COLOR),
                        ft.Switch(label="Suoni Chime e Avvisi Audio", value=True, active_color=PRIMARY_COLOR),
                        ft.Switch(label="Modalità Offline (Database Locale)", value=True, active_color=PRIMARY_COLOR),
                        ft.Divider(height=1, color=BORDER_COLOR),
                        ft.Text("Informazioni sull'App", size=14, weight=ft.FontWeight.BOLD, color=TEXT_COLOR),
                        ft.Text("ItaliaBus Mobile v2.0 (Flet Python Engine)", size=12, color=TEXT_MUTED),
                        ft.Text("Progetto TPL Pullman Corigliano-Rossano & Calabria", size=12, color=TEXT_MUTED)
                    ]
                )
            ]
        )
