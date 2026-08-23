"""
ItaliaBus - Search & Live Departures Engine
Motore di ricerca tratte e generazione partenze live con countdown orari.
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from .transit_data import Line, Stop, get_lines_for_stop, get_stop_by_id, REAL_LINES

def get_upcoming_departures_for_stop(stop_id: str, limit: int = 6) -> List[Dict[str, Any]]:
    """Genera le prossime partenze in transito per una specifica fermata con orari e countdown."""
    lines = get_lines_for_stop(stop_id)
    if not lines:
        lines = REAL_LINES[:3]
        
    now = datetime.now()
    current_minutes = now.hour * 60 + now.minute
    
    departures = []
    
    for idx, line in enumerate(lines):
        schedule = line.schedule.get("weekday", ["06:30", "07:15", "08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30", "20:00"])
        
        # Destinazione finale
        dest_stop = get_stop_by_id(line.stops_ids[-1]) if line.stops_ids else None
        dest_name = dest_stop.name if dest_stop else line.name.split("➔")[-1].strip()
        
        # Trova la prossima partenza
        next_time_str = None
        min_diff = float('inf')
        
        for t_str in schedule:
            try:
                h, m = map(int, t_str.split(":"))
                t_min = h * 60 + m
                diff = t_min - current_minutes
                if 0 < diff < min_diff:
                    min_diff = diff
                    next_time_str = t_str
            except Exception:
                continue
                
        if not next_time_str:
            next_time_str = schedule[0]
            min_diff = 45  # fallback
            
        departures.append({
            "line_code": line.code,
            "line_name": line.name,
            "line_color": line.color,
            "operator": line.operator,
            "destination": dest_name,
            "bus_model": line.bus_model,
            "scheduled_time": next_time_str,
            "minutes_left": int(min_diff) if min_diff != float('inf') else 15,
            "platform": f"Corsia {idx + 1}"
        })
        
    departures.sort(key=lambda d: d["minutes_left"])
    return departures[:limit]

def search_trips(origin_id: str, dest_id: str) -> List[Dict[str, Any]]:
    """Cerca le corse disponibili tra due fermate."""
    results = []
    origin = get_stop_by_id(origin_id)
    dest = get_stop_by_id(dest_id)
    
    if not origin or not dest:
        return results
        
    for line in REAL_LINES:
        if origin_id in line.stops_ids and dest_id in line.stops_ids:
            idx_orig = line.stops_ids.index(origin_id)
            idx_dest = line.stops_ids.index(dest_id)
            
            if idx_orig < idx_dest:
                results.append({
                    "line": line,
                    "origin": origin,
                    "destination": dest,
                    "duration_min": line.duration_min,
                    "price": line.price_base,
                    "direct": True
                })
                
    return results
