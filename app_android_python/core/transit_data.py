"""
ItaliaBus - Core Transit Data & Model Engine
Contiene tutti i dati verificati per fermate, stazioni, linee, orari e modalità di trasporto.
"""
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any

@dataclass
class Stop:
    id: str
    name: str
    code: str
    area: str
    region: str
    locality_type: str
    address: str
    lat: float
    lng: float
    platforms: List[str] = field(default_factory=list)
    is_main_hub: bool = False
    operator_name: str = "Servizio TPL"
    gmaps_url: str = ""
    street_view_url: str = ""
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    radiotaxi_name: Optional[str] = None

@dataclass
class Line:
    id: str
    code: str
    name: str
    short_name: str
    type: str  # urban, suburban, regional, national
    operator: str
    region: str
    stops_ids: List[str] = field(default_factory=list)
    schedule: Dict[str, List[str]] = field(default_factory=dict)
    duration_min: int = 45
    price_base: float = 2.50
    bus_model: str = "Autobus Climatizzato Euro 6"
    color: str = "#0284c7"

# Dataset Hub Reali Pullman
REAL_PULLMAN_STOPS = [
    Stop(
        id="HUB_CAL_CORIGLIANO_SCALO_FS",
        name="Corigliano Scalo - Terminal Bus Stazione FS (Piazza Salvo D'Acquisto)",
        code="COR-FS-01",
        area="Corigliano-Rossano",
        region="calabria",
        locality_type="city",
        address="Piazza Salvo D'Acquisto, 87064 Corigliano Scalo (CS)",
        lat=39.5960,
        lng=16.5180,
        platforms=["Corsia 1 - Urbano", "Corsia 2 - UNICAL / Cosenza", "Corsia 3 - Grandi Linee"],
        is_main_hub=True,
        operator_name="IAS Scura / Consorzio Autolinee",
        gmaps_url="https://www.google.com/maps/search/?api=1&query=39.5960,16.5180"
    ),
    Stop(
        id="HUB_CAL_CORIGLIANO_CENTRO",
        name="Corigliano Centro Storico - Piazza del Popolo / Castello",
        code="COR-CEN-01",
        area="Corigliano-Rossano",
        region="calabria",
        locality_type="city",
        address="Piazza del Popolo, 87064 Corigliano Centro (CS)",
        lat=39.5945,
        lng=16.5110,
        platforms=["Fermata Centro 1", "Fermata Centro 2"],
        is_main_hub=True,
        operator_name="IAS Scura / Consorzio Autolinee"
    ),
    Stop(
        id="HUB_CAL_SCHIAVONEA_LUNGOMARE",
        name="Schiavonea - Lungomare / Piazza Portofino (Santuario Madonna Nera)",
        code="SCH-MAR-01",
        area="Corigliano-Rossano",
        region="calabria",
        locality_type="city",
        address="Piazza Portofino - Viale Salerno, 87064 Schiavonea (CS)",
        lat=39.6480,
        lng=16.5380,
        platforms=["Banchina Mare 1", "Banchina Mare 2"],
        is_main_hub=True,
        operator_name="IAS Scura / Consorzio Autolinee"
    ),
    Stop(
        id="HUB_CAL_SCHIAVONEA_PORTO",
        name="Schiavonea - Area Portuale / Banchina Capitaneria",
        code="SCH-POR-01",
        area="Corigliano-Rossano",
        region="calabria",
        locality_type="city",
        address="Viale Jonio - Area Portuale, 87064 Corigliano-Rossano (CS)",
        lat=39.6540,
        lng=16.5350,
        platforms=["Banchina Porto"],
        is_main_hub=True,
        operator_name="IAS Scura / Consorzio Autolinee"
    ),
    Stop(
        id="HUB_CAL_ROSSANO_SCALO_FS",
        name="Rossano Scalo - Terminal Bus Stazione FS / Viale Michelangelo",
        code="ROS-FS-01",
        area="Corigliano-Rossano",
        region="calabria",
        locality_type="city",
        address="Viale Michelangelo / Viale Luca De Rosis, 87067 Rossano Scalo (CS)",
        lat=39.5760,
        lng=16.6340,
        platforms=["Corsia A - Urbano", "Corsia B - Cosenza / Catanzaro", "Corsia C - Grandi Linee"],
        is_main_hub=True,
        operator_name="IAS Scura / Simet / Autolinee Federico"
    ),
    Stop(
        id="HUB_CAL_CANTINELLA",
        name="Cantinella - Bivio Statale 106 Jonica",
        code="CAN-SS106-01",
        area="Corigliano-Rossano",
        region="calabria",
        locality_type="city",
        address="Bivio Cantinella SS106, 87064 Corigliano-Rossano (CS)",
        lat=39.6720,
        lng=16.4800,
        platforms=["Fermata Nord", "Fermata Sud"],
        is_main_hub=True,
        operator_name="IAS Scura / SAJ Autolinee"
    ),
    Stop(
        id="HUB_CAL_SIBARI_FS",
        name="Sibari - Stazione FS / Bivio Jonio-Tirreno",
        code="SIB-FS-01",
        area="Cassano all'Ionio",
        region="calabria",
        locality_type="city",
        address="Piazzale Stazione FS, 87011 Sibari (CS)",
        lat=39.7460,
        lng=16.4520,
        platforms=["Corsia 1", "Corsia 2"],
        is_main_hub=True,
        operator_name="SAJ / Consorzio Autolinee"
    ),
    Stop(
        id="HUB_CAL_CASTROVILLARI_AUTOSTAZIONE",
        name="Castrovillari - Autostazione Terminal Bus (Via Polisportivo)",
        code="CAS-AUT-01",
        area="Castrovillari",
        region="calabria",
        locality_type="city",
        address="Via Polisportivo, 87012 Castrovillari (CS)",
        lat=39.8150,
        lng=16.2050,
        platforms=["Corsia 1", "Corsia 2", "Corsia 3", "Corsia 4"],
        is_main_hub=True,
        operator_name="Ferrovie della Calabria / SAJ"
    ),
    Stop(
        id="HUB_CAL_COSENZA_AUTOSTAZIONE",
        name="Cosenza - Autostazione Terminal Bus (Corsie 1-12, Via Medaglie d'Oro)",
        code="CS-AUT-01",
        area="Cosenza",
        region="calabria",
        locality_type="city",
        address="Via Medaglie d'Oro / Piazza Mancini, 87100 Cosenza",
        lat=39.3085,
        lng=16.2490,
        platforms=["Corsia 1 - Corigliano / Rossano", "Corsia 2 - Castrovillari", "Corsia 3 - Tirrenica", "Corsia 4 - Catanzaro", "Corsia 5 - Reggio", "Corsia 6 - Roma / Milano"],
        is_main_hub=True,
        operator_name="Consorzio Autolinee / AMACO / FDC"
    ),
    Stop(
        id="HUB_CAL_RENDE_UNICAL",
        name="Rende - Terminal Bus Campus Universitario UNICAL (Arcavacata)",
        code="REN-UNI-01",
        area="Rende",
        region="calabria",
        locality_type="city",
        address="Piazzale Terminal Bus UNICAL, 87036 Rende (CS)",
        lat=39.3620,
        lng=16.2260,
        platforms=["Pensilina 1 - Corigliano / Rossano Express", "Pensilina 2 - Castrovillari", "Pensilina 3 - Cosenza", "Pensilina 4 - Paola", "Pensilina 5 - Crotone / Catanzaro"],
        is_main_hub=True,
        operator_name="Consorzio Autolinee / IAS Scura / FDC"
    ),
    Stop(
        id="HUB_CAL_PAOLA_FS",
        name="Paola - Terminal Bus Stazione FS (Piazzale Antonio Bandiera)",
        code="PAO-FS-01",
        area="Paola",
        region="calabria",
        locality_type="city",
        address="Piazzale Antonio Bandiera, 87027 Paola (CS)",
        lat=39.3590,
        lng=16.0370,
        platforms=["Banchina 1 - Cosenza / UNICAL", "Banchina 2 - Riviera dei Cedri", "Banchina 3 - Lamezia"],
        is_main_hub=True,
        operator_name="Consorzio Autolinee / Preite"
    ),
    Stop(
        id="HUB_CAL_LAMEZIA_AEROPORTO",
        name="Lamezia Terme - Aeroporto Internazionale (SUF) Terminal Bus",
        code="SUF-BUS-01",
        area="Lamezia Terme",
        region="calabria",
        locality_type="city",
        address="Via Aeroporto - Terminal Arrivi / Partenze, 88046 Lamezia Terme (CZ)",
        lat=38.9054,
        lng=16.2423,
        platforms=["Stallo 1 - Navetta Cosenza", "Stallo 2 - Navetta Catanzaro", "Stallo 3 - Shuttle FS"],
        is_main_hub=True,
        operator_name="SACAL / Ferrovie della Calabria / IAS Scura"
    ),
    Stop(
        id="HUB_CAL_CATANZARO_MATTEOTTI",
        name="Catanzaro - Terminal Bus Piazza Matteotti / Cavatore",
        code="CZ-MAT-01",
        area="Catanzaro",
        region="calabria",
        locality_type="city",
        address="Piazza Giacomo Matteotti, 88100 Catanzaro",
        lat=38.9080,
        lng=16.5910,
        platforms=["Corsia 1 - Urbano", "Corsia 2 - Lamezia / Cosenza", "Corsia 3 - Soverato"],
        is_main_hub=True,
        operator_name="AMC Catanzaro / Ferrovie della Calabria"
    ),
    Stop(
        id="HUB_CAL_CROTONE_AUTOSTAZIONE",
        name="Crotone - Terminal Autostazione Bus (Via Di Vittorio)",
        code="KR-AUT-01",
        area="Crotone",
        region="calabria",
        locality_type="city",
        address="Via Giuseppe Di Vittorio, 88900 Crotone",
        lat=39.0810,
        lng=17.1180,
        platforms=["Corsia 1 - Corigliano / Rossano", "Corsia 2 - Catanzaro", "Corsia 3 - Roma / Milano"],
        is_main_hub=True,
        operator_name="Romano Autolinee Regionali S.p.A."
    ),
    Stop(
        id="HUB_CAL_REGGIO_CALABRIA_FS",
        name="Reggio Calabria - Terminal Bus Stazione Centrale FS (Piazza Garibaldi)",
        code="RC-FS-01",
        area="Reggio Calabria",
        region="calabria",
        locality_type="city",
        address="Piazza Giuseppe Garibaldi, 89127 Reggio Calabria",
        lat=38.1040,
        lng=15.6420,
        platforms=["Corsia 1 - Aeroporto Stretto", "Corsia 2 - Jonica", "Corsia 3 - Grandi Linee"],
        is_main_hub=True,
        operator_name="ATAM S.p.A. & Federico TPL"
    ),
    # Piemonte Hubs (Cuorgnè / Torino)
    Stop(
        id="HUB_PIE_CUORGNE_CENTRO",
        name="Cuorgnè - Centro / Piazza Martiri della Libertà",
        code="CUO-CEN-01",
        area="Cuorgnè",
        region="piemonte",
        locality_type="town",
        address="Piazza Martiri della Libertà, 10082 Cuorgnè (TO)",
        lat=45.3905,
        lng=7.6498,
        platforms=["Pensilina 1 - Ivrea / Rivarolo", "Pensilina 2 - Valli Orco / Soana"],
        is_main_hub=True,
        operator_name="GTT Torino / Extra.TO"
    ),
    Stop(
        id="HUB_PIE_CUORGNE_PEDAGGIO",
        name="Cuorgnè - Località Pedaggio (Via Bruni / Cascinette)",
        code="CUO-PED-01",
        area="Cuorgnè",
        region="piemonte",
        locality_type="town",
        address="Via Bruni / Bivio Pedaggio, 10082 Cuorgnè (TO)",
        lat=45.3970,
        lng=7.6530,
        platforms=["Fermata 1"],
        is_main_hub=False,
        operator_name="GTT Torino"
    ),
    Stop(
        id="HUB_PIE_TORINO_VITTORIO",
        name="Torino - Terminal Bus Corso Vittorio Emanuele II (Palagiustizia / Porta Susa)",
        code="TO-VITT-01",
        area="Torino",
        region="piemonte",
        locality_type="city",
        address="Corso Vittorio Emanuele II 131, 10138 Torino",
        lat=45.0680,
        lng=7.6620,
        platforms=["Stallo A - Canavese", "Stallo B - Grandi Linee"],
        is_main_hub=True,
        operator_name="Extra.TO / GTT Torino"
    ),
    # Grandi Hub Nazionali
    Stop(
        id="HUB_LAZ_ROMA_TIBURTINA",
        name="Roma - Autostazione Tiburtina Tibus (Terminal Bus Nazionali)",
        code="RM-TIBUS-01",
        area="Roma",
        region="lazio",
        locality_type="city",
        address="Largo Guido Mazzoni, 00162 Roma",
        lat=41.9100,
        lng=12.5290,
        platforms=["Stallo 1 - Calabria / Sud", "Stallo 2 - Campania / Puglia", "Stallo 3 - Nord Italia"],
        is_main_hub=True,
        operator_name="TIBUS Roma / FlixBus / MarinoBus / Itabus"
    ),
    Stop(
        id="HUB_LOM_MILANO_LAMPUGNANO",
        name="Milano - Autostazione Terminal Bus Lampugnano (Metro M1)",
        code="MI-LAMP-01",
        area="Milano",
        region="lombardia",
        locality_type="city",
        address="Via Giulio Natta 22, 20151 Milano",
        lat=45.4890,
        lng=9.1270,
        platforms=["Stallo 1 - Grandi Linee Sud", "Stallo 2 - Nazionali"],
        is_main_hub=True,
        operator_name="Milano Lampugnano / FlixBus / Simet"
    )
]

# Real Lines
REAL_LINES = [
    Line(
        id="LINE_COR_ROS_01",
        code="LINEA 1",
        name="Linea Urbana: Corigliano Scalo FS ⇄ Schiavonea ⇄ Rossano Scalo FS",
        short_name="L1",
        type="urban",
        operator="IAS Scura / Simet TPL",
        region="calabria",
        stops_ids=["HUB_CAL_CORIGLIANO_CENTRO", "HUB_CAL_CORIGLIANO_SCALO_FS", "HUB_CAL_SCHIAVONEA_LUNGOMARE", "HUB_CAL_SCHIAVONEA_PORTO", "HUB_CAL_ROSSANO_SCALO_FS"],
        schedule={"weekday": ["06:15", "07:00", "07:45", "08:30", "09:15", "10:00", "10:45", "11:30", "12:15", "13:00", "13:45", "14:30", "15:15", "16:00", "16:45", "17:30", "18:15", "19:00", "19:45", "20:30", "21:30"]},
        duration_min=35,
        price_base=1.50,
        bus_model="Mercedes Citaro Hybrid Euro 6",
        color="#0284c7"
    ),
    Line(
        id="LINE_COR_UNICAL_02",
        code="EXP-UNICAL",
        name="Linea Rapida Express: Corigliano Scalo FS ➔ UNICAL Arcavacata ➔ Cosenza Autostazione",
        short_name="UNICAL",
        type="suburban",
        operator="Consorzio Autolinee / IAS Scura",
        region="calabria",
        stops_ids=["HUB_CAL_CORIGLIANO_SCALO_FS", "HUB_CAL_CANTINELLA", "HUB_CAL_RENDE_UNICAL", "HUB_CAL_COSENZA_AUTOSTAZIONE"],
        schedule={"weekday": ["06:45", "07:30", "08:15", "09:30", "11:00", "12:30", "13:45", "15:00", "16:30", "17:45", "19:00", "20:15"]},
        duration_min=65,
        price_base=4.20,
        bus_model="Setra S 419 UL Business",
        color="#16a34a"
    ),
    Line(
        id="LINE_COR_SUF_05",
        code="SHUTTLE-SUF",
        name="Navetta Aeroporto: Corigliano Scalo ➔ Lamezia Aeroporto (SUF) ➔ Catanzaro",
        short_name="SUF-BUS",
        type="suburban",
        operator="Ferrovie della Calabria / IAS Scura",
        region="calabria",
        stops_ids=["HUB_CAL_ROSSANO_SCALO_FS", "HUB_CAL_CORIGLIANO_SCALO_FS", "HUB_CAL_COSENZA_AUTOSTAZIONE", "HUB_CAL_LAMEZIA_AEROPORTO", "HUB_CAL_CATANZARO_MATTEOTTI"],
        schedule={"weekday": ["05:30", "07:00", "09:30", "12:00", "14:30", "17:00", "19:30", "21:30"]},
        duration_min=90,
        price_base=8.50,
        bus_model="Setra S 515 HD ComfortClass",
        color="#0284c7"
    ),
    Line(
        id="LINE_COR_ROMA_07",
        code="NAT-ROMA",
        name="Autolinea Nazionale: Corigliano-Rossano ➔ Cosenza ➔ Roma Tiburtina Tibus",
        short_name="ROMA",
        type="national",
        operator="IAS Scura / Simet Grandi Linee",
        region="calabria",
        stops_ids=["HUB_CAL_ROSSANO_SCALO_FS", "HUB_CAL_CORIGLIANO_SCALO_FS", "HUB_CAL_COSENZA_AUTOSTAZIONE", "HUB_LAZ_ROMA_TIBURTINA"],
        schedule={"weekday": ["06:00", "08:30", "13:30", "16:00", "22:30", "23:45"]},
        duration_min=330,
        price_base=26.00,
        bus_model="Setra S 517 HDH TopClass",
        color="#0f172a"
    ),
    Line(
        id="LINE_PIE_CUORGNE_TO_01",
        code="3092",
        name="Autolinea 3092: Cuorgnè ➔ Rivarolo Canavese ➔ Torino Porta Susa",
        short_name="3092",
        type="suburban",
        operator="GTT Torino / Extra.TO",
        region="piemonte",
        stops_ids=["HUB_PIE_CUORGNE_PEDAGGIO", "HUB_PIE_CUORGNE_CENTRO", "HUB_PIE_TORINO_VITTORIO"],
        schedule={"weekday": ["06:00", "06:45", "07:30", "08:15", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30", "20:00"]},
        duration_min=55,
        price_base=4.00,
        bus_model="Iveco Crossway Pro Euro 6",
        color="#0284c7"
    )
]

REGIONS = [
    {"id": "calabria", "name": "Calabria", "capoluogo": "Catanzaro", "icon": "☀️"},
    {"id": "piemonte", "name": "Piemonte", "capoluogo": "Torino", "icon": "🏔️"},
    {"id": "lombardia", "name": "Lombardia", "capoluogo": "Milano", "icon": "🏙️"},
    {"id": "lazio", "name": "Lazio", "capoluogo": "Roma", "icon": "🏛️"},
    {"id": "campania", "name": "Campania", "capoluogo": "Napoli", "icon": "🌋"},
    {"id": "sicilia", "name": "Sicilia", "capoluogo": "Palermo", "icon": "🏖️"}
]

def get_stops_by_region(region_id: str) -> List[Stop]:
    if region_id == "all":
        return REAL_PULLMAN_STOPS
    return [s for s in REAL_PULLMAN_STOPS if s.region == region_id]

def get_stop_by_id(stop_id: str) -> Optional[Stop]:
    for s in REAL_PULLMAN_STOPS:
        if s.id == stop_id:
            return s
    return None

def get_lines_by_region(region_id: str) -> List[Line]:
    if region_id == "all":
        return REAL_LINES
    return [l for l in REAL_LINES if l.region == region_id]

def get_lines_for_stop(stop_id: str) -> List[Line]:
    return [l for l in REAL_LINES if stop_id in l.stops_ids]
