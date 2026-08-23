"""
ItaliaBus - Geo Engine & Navigation Locator
Calcolo geodesico distanze e determinazione rigorosa della fermata più vicina alla posizione fisica.
"""
import math
from typing import Tuple, Optional, List, Dict, Any
from .transit_data import Stop, get_stops_by_region, REAL_PULLMAN_STOPS

def haversine_distance(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
    """Calcola la distanza in metri tra due coordinate GPS (lat, lng)."""
    R = 6371000.0  # Raggio terra in metri
    lat1, lon1 = math.radians(coord1[0]), math.radians(coord1[1])
    lat2, lon2 = math.radians(coord2[0]), math.radians(coord2[1])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat / 2.0)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2.0)**2
    c = 2.0 * math.asin(math.sqrt(a))
    return R * c

def find_nearest_stop(user_lat: float, user_lng: float, region: str = "all") -> Optional[Tuple[Stop, float]]:
    """
    Trova la fermata FISICAMENTE PIÙ VICINA all'utente (in metri),
    senza override forzati a stazioni distanti.
    """
    stops = get_stops_by_region(region) if region != "all" else REAL_PULLMAN_STOPS
    if not stops:
        stops = REAL_PULLMAN_STOPS
        
    best_stop = None
    min_dist = float('inf')
    
    user_pos = (user_lat, user_lng)
    for stop in stops:
        d = haversine_distance(user_pos, (stop.lat, stop.lng))
        if d < min_dist:
            min_dist = d
            best_stop = stop
            
    if best_stop:
        return best_stop, min_dist
    return None

def estimate_walk_time_minutes(distance_meters: float, speed_kmh: float = 4.8) -> int:
    """Stima il tempo di camminata a piedi in minuti."""
    speed_ms = (speed_kmh * 1000.0) / 3600.0
    seconds = distance_meters / speed_ms
    return max(1, math.ceil(seconds / 60.0))
