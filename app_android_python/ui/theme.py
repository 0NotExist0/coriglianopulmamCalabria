"""
ItaliaBus Material Design 3 Theme
"""
import flet as ft

PRIMARY_COLOR = "#0284c7"
SECONDARY_COLOR = "#0f172a"
SUCCESS_COLOR = "#10b981"
WARNING_COLOR = "#f59e0b"
ERROR_COLOR = "#dc2626"
SURFACE_COLOR = "#f8fafc"
CARD_COLOR = "#ffffff"
TEXT_COLOR = "#0f172a"
TEXT_MUTED = "#64748b"
BORDER_COLOR = "#e2e8f0"

def get_app_theme():
    return ft.Theme(
        color_scheme_seed=PRIMARY_COLOR,
        font_family="Roboto",
        use_material3=True,
        visual_density=ft.ThemeVisualDensity.COMPACT
    )
