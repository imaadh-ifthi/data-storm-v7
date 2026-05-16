#!/usr/bin/env python3
import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- CONFIGURATION ---
BRONZE_EXT_DIR = Path("../data/bronze/external_pois")
BRONZE_EXT_DIR.mkdir(parents=True, exist_ok=True)

# Dynamic timestamp to prevent PermissionError
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
POI_CSV = BRONZE_EXT_DIR / f"all_pois_master_{TIMESTAMP}.csv"

TEST_MODE = False
OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://z.overpass-api.de/api/interpreter"]
MAX_ELEMENTS_PER_QUERY = 40_000
REQUEST_DELAY = 2.0
HTTP_TIMEOUT_S = 30

CATEGORY_TAGS: Dict[str, List[str]] = {
    "transit":    ["public_transport=station", "railway=station", "amenity=bus_station"],
    "schools":    ["amenity=school"],
    "hospitals":  ["amenity=hospital", "amenity=clinic"],
    "worship":    ["amenity=place_of_worship"],
    "financial":  ["amenity=bank", "amenity=atm"],
    "industrial": ["landuse=industrial", "industrial=*"],
    "markets":    ["amenity=marketplace"],
    "tourism":    ["tourism=hotel", "tourism=guest_house"],
    "offices":    ["office=government", "office=company", "building=office"],
}

ALL_BBOXES = {
    "Western":      (6.80, 79.80, 7.10, 80.20),
    "Central":      (6.80, 80.50, 7.40, 81.00),
    "NorthWestern": (7.50, 79.80, 8.20, 80.30),
    "Southern":     (5.90, 80.10, 6.50, 81.20),
}
BBOXES = {"Southern": (5.90, 80.10, 6.50, 81.20)} if TEST_MODE else ALL_BBOXES

logging.basicConfig(level=logging.INFO, format="%(asctime)s │ %(levelname)-8s │ %(message)s")
logger = logging.getLogger(__name__)

# --- NETWORK LOGIC ---
def _bbox_str(bbox): return "_".join(f"{v:.4f}" for v in bbox)

def build_overpass_query(tags, bbox):
    south, west, north, east = bbox
    coord = f"{south:.4f},{west:.4f},{north:.4f},{east:.4f}"
    lines = [f'  nwr["{tag.split("=")[0]}"]({coord});' if "=" in tag and tag.split("=")[1] == "*" 
             else f'  nwr["{tag.split("=")[0]}"="{tag.split("=")[1]}"]({coord});' if "=" in tag 
             else f'  nwr["{tag}"]({coord});' for tag in tags]
    return f"[out:json][timeout:60];\n(\n{chr(10).join(lines)}\n);\nout center;"

def _make_session():
    session = requests.Session()
    retry = Retry(total=2, backoff_factor=1.0, status_forcelist=[500, 502, 503, 504], allowed_methods=["GET", "POST"])
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session

def request_overpass(query, session):
    headers = {"User-Agent": "DataStorm-Analytics-Project/1.0 (Python)"}
    for url in OVERPASS_URLS:
        try:
            resp = session.post(url, data={"data": query}, headers=headers, timeout=HTTP_TIMEOUT_S)
            if resp.status_code == 200: return resp.json()
            if resp.status_code == 429: time.sleep(int(resp.headers.get("Retry-After", 30)))
        except Exception: continue
    return None

def parse_elements(data, category):
    return [(e.get("center", e).get("lat"), e.get("center", e).get("lon"), category) 
            for e in data.get("elements", []) if "lat" in e.get("center", e)]

def download_poi_with_splitting(tags, bbox, session, category, province):
    cache_file = BRONZE_EXT_DIR / f"{province}_{category}_{_bbox_str(bbox)}.json"
    if cache_file.exists():
        with open(cache_file, "r", encoding="utf-8") as fh: return parse_elements(json.load(fh), category)

    data = request_overpass(build_overpass_query(tags, bbox), session)
    if not data: return []

    elements = data.get("elements", [])
    if len(elements) >= MAX_ELEMENTS_PER_QUERY or ("remark" in data and "too much data" in data["remark"].lower()):
        s, w, n, e = bbox
        mlat, mlon = (s + n) / 2, (w + e) / 2
        quads = [(s, w, mlat, mlon), (s, mlon, mlat, e), (mlat, w, n, mlon), (mlat, mlon, n, e)]
        res = []
        for q in quads:
            time.sleep(REQUEST_DELAY)
            res.extend(download_poi_with_splitting(tags, q, session, category, province))
        return res

    with open(cache_file, "w", encoding="utf-8") as fh: json.dump(data, fh)
    return parse_elements(data, category)

def main():
    import pandas as pd
    session = _make_session()
    all_pois = []
    for province, bbox in BBOXES.items():
        logger.info("━━━ Province: %s ━━━", province)
        for category, tags in CATEGORY_TAGS.items():
            all_pois.extend(download_poi_with_splitting(tags, bbox, session, category, province))
            time.sleep(REQUEST_DELAY)
            
    pd.DataFrame(all_pois, columns=["poi_lat", "poi_lon", "category"]).to_csv(POI_CSV, index=False)
    logger.info("Raw POIs saved to %s", POI_CSV)

if __name__ == "__main__": main()