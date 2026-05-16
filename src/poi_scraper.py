#!/usr/bin/env python3
"""
POI Scraper and Spatial Feature Engineer – Data Storm v7.0
Executes the Bronze -> Gold pipeline for external geospatial data.
"""

import json
import logging
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from sklearn.neighbors import BallTree
from urllib3.util.retry import Retry

# --- LAKEHOUSE ARCHITECTURE PATHS ---
BRONZE_EXT_DIR = Path("../data/bronze/external_pois")
BRONZE_EXT_DIR.mkdir(parents=True, exist_ok=True)
POI_CSV = BRONZE_EXT_DIR / "all_pois_master.csv"

GOLD_DIR = Path("../data/gold")
GOLD_DIR.mkdir(parents=True, exist_ok=True)
FEATURE_CSV = GOLD_DIR / "gold_outlet_spatial_features.csv"

OUTLET_COORDS_CSV = "../data/bronze/outlet_coordinates.csv"

# --- CONFIGURATION ---
TEST_MODE = True  # Set to False for the full 4-province run

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
]

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

ALL_BBOXES: Dict[str, Tuple[float, float, float, float]] = {
    "Western":      (6.80, 79.80, 7.10, 80.20),
    "Central":      (6.80, 80.50, 7.40, 81.00),
    "NorthWestern": (7.50, 79.80, 8.20, 80.30),
    "Southern":     (5.90, 80.10, 6.50, 81.20),
}
TEST_BBOXES: Dict[str, Tuple[float, float, float, float]] = {
    "Southern": (5.90, 80.10, 6.50, 81.20),
}
BBOXES = TEST_BBOXES if TEST_MODE else ALL_BBOXES

MAX_ELEMENTS_PER_QUERY = 40_000
REQUEST_DELAY          = 2.0
SERVER_TIMEOUT_S       = 60
HTTP_TIMEOUT_S         = 30

logging.basicConfig(level=logging.INFO, format="%(asctime)s │ %(levelname)-8s │ %(message)s")
logger = logging.getLogger(__name__)

# --- OVERPASS API ABSTRACTION ---
def _bbox_str(bbox: Tuple[float, float, float, float]) -> str:
    return "_".join(f"{v:.4f}" for v in bbox)

def build_overpass_query(tags: List[str], bbox: Tuple[float, float, float, float]) -> str:
    south, west, north, east = bbox
    coord = f"{south:.4f},{west:.4f},{north:.4f},{east:.4f}"
    lines: List[str] = []
    for tag in tags:
        if "=" in tag:
            key, value = tag.split("=", 1)
            filter_str = f'["{key}"]' if value == "*" else f'["{key}"="{value}"]'
        else:
            filter_str = f'["{tag}"]'
        lines.append(f"  nwr{filter_str}({coord});")
    body = "\n".join(lines)
    return f"[out:json][timeout:{SERVER_TIMEOUT_S}];\n(\n{body}\n);\nout center;"

def _make_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=2, backoff_factor=1.0,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://",  adapter)
    return session

def _overpass_request(query: str, session: requests.Session, url: str) -> Optional[requests.Response]:
    # CRITICAL: Bypassing the WAF 406 Error
    headers = {"User-Agent": "DataStorm-Analytics-Project/1.0 (Python)"}
    
    try:
        resp = session.post(url, data={"data": query}, headers=headers, timeout=HTTP_TIMEOUT_S)
        if resp.status_code == 200:
            return resp
        logger.warning("POST %s → HTTP %d.", url, resp.status_code)
    except Exception as exc:
        logger.warning("POST %s failed: %s: %s", url, type(exc).__name__, exc)
    return None

def request_overpass(query: str, session: requests.Session) -> Optional[dict]:
    for url in OVERPASS_URLS:
        resp = _overpass_request(query, session, url)
        if resp is None:
            continue
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", 30))
            time.sleep(wait)
    return None

# --- RECURSIVE DOWNLOAD LOGIC ---
def parse_elements(data: dict, category: str) -> List[Tuple[float, float, str]]:
    results = []
    for elem in data.get("elements", []):
        if "center" in elem:
            lat, lon = elem["center"]["lat"], elem["center"]["lon"]
        elif elem.get("type") == "node" and "lat" in elem:
            lat, lon = elem["lat"], elem["lon"]
        else:
            continue
        results.append((lat, lon, category))
    return results

def _recursive_split(tags, bbox, session, category, province) -> List[Tuple[float, float, str]]:
    south, west, north, east = bbox
    mid_lat, mid_lon = (south + north) / 2, (west + east) / 2
    quadrants = [
        (south, west, mid_lat, mid_lon), (south, mid_lon, mid_lat, east),
        (mid_lat, west, north, mid_lon), (mid_lat, mid_lon, north, east),
    ]
    all_pois = []
    for q in quadrants:
        time.sleep(REQUEST_DELAY)
        all_pois.extend(download_poi_with_splitting(tags, q, session, category, province))
    return all_pois

def download_poi_with_splitting(tags, bbox, session, category_name, province) -> List[Tuple[float, float, str]]:
    cache_file = BRONZE_EXT_DIR / f"{province}_{category_name}_{_bbox_str(bbox)}.json"
    if cache_file.exists():
        with open(cache_file, "r", encoding="utf-8") as fh:
            return parse_elements(json.load(fh), category_name)

    data = request_overpass(build_overpass_query(tags, bbox), session)
    if data is None:
        return []

    elements = data.get("elements", [])
    if len(elements) >= MAX_ELEMENTS_PER_QUERY or ("remark" in data and "too much data" in data["remark"].lower()):
        return _recursive_split(tags, bbox, session, category_name, province)

    with open(cache_file, "w", encoding="utf-8") as fh:
        json.dump(data, fh)
    return parse_elements(data, category_name)

# --- SPATIAL MATH (BALLTREE) ---
def create_balltrees_and_features(outlets_csv: str, pois_df: pd.DataFrame, radii_meters: List[int] = [500, 1500]) -> pd.DataFrame:
    outlets = pd.read_csv(outlets_csv).rename(columns=lambda x: x.strip().lower())
    outlets = outlets.rename(columns={"latitude": "lat", "longitude": "lon", "outlet_id": "outlet_id"})
    outlets = outlets.dropna(subset=["lat", "lon"])
    
    outlets_rad = np.deg2rad(outlets[["lat", "lon"]].values)
    results = outlets[["outlet_id"]].copy()

    for cat in pois_df["category"].unique():
        cat_pois = pois_df[pois_df["category"] == cat][["poi_lat", "poi_lon"]].values
        if len(cat_pois) == 0:
            results[f"dist_nearest_{cat}"] = np.nan
            for r in radii_meters:
                results[f"density_{cat}_{r}m"] = 0
            continue
            
        tree = BallTree(np.deg2rad(cat_pois), metric="haversine")
        dist_rad, _ = tree.query(outlets_rad, k=1)
        results[f"dist_nearest_{cat}"] = dist_rad.flatten() * 6_371_000
        
        for r in radii_meters:
            radius_rad = r / 6_371_000.0
            results[f"density_{cat}_{r}m"] = tree.query_radius(outlets_rad, r=radius_rad, count_only=True)
            
    return results

# --- EXECUTION ---
def main() -> None:
    session = _make_session()
    all_pois: List[Tuple[float, float, str]] = []

    for province, bbox in BBOXES.items():
        logger.info("━━━ Province: %s ━━━", province)
        for category_name, tags in CATEGORY_TAGS.items():
            pois = download_poi_with_splitting(tags, bbox, session, category_name, province)
            all_pois.extend(pois)
            time.sleep(REQUEST_DELAY)

    pois_df = pd.DataFrame(all_pois, columns=["poi_lat", "poi_lon", "category"])
    pois_df.to_csv(POI_CSV, index=False)
    logger.info("Total POIs saved to %s", POI_CSV)

    if not pois_df.empty:
        features_df = create_balltrees_and_features(OUTLET_COORDS_CSV, pois_df, radii_meters=[500, 1500])
        features_df.to_csv(FEATURE_CSV, index=False)
        logger.info("Features saved to %s", FEATURE_CSV)

if __name__ == "__main__":
    main()