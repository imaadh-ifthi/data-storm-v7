#!/usr/bin/env python3
import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s │ %(levelname)-8s │ %(message)s")
logger = logging.getLogger(__name__)

# --- PATHS ---
BRONZE_EXT_DIR = Path("../data/bronze/external_pois")
OUTLET_COORDS_CSV = Path("../data/bronze/outlet_coordinates.csv")

GOLD_DIR = Path("../data/gold")
GOLD_DIR.mkdir(parents=True, exist_ok=True)
FEATURE_CSV = GOLD_DIR / "gold_outlet_spatial_features.csv"

def get_latest_poi_file() -> Path:
    """Finds the most recently generated POI master file in the Bronze directory."""
    files = list(BRONZE_EXT_DIR.glob("all_pois_master*.csv"))
    if not files:
        raise FileNotFoundError("No POI master file found. Run 02a_ingest_external_bronze.py first.")
    return max(files, key=lambda p: p.stat().st_mtime)

def engineer_features(outlets_csv: Path, pois_csv: Path, radii_meters: list) -> pd.DataFrame:
    logger.info("Loading latest Bronze POI data: %s", pois_csv.name)
    pois_df = pd.read_csv(pois_csv)
    
    outlets = pd.read_csv(outlets_csv).rename(columns=lambda x: x.strip().lower())
    outlets = outlets.rename(columns={"latitude": "lat", "longitude": "lon", "outlet_id": "outlet_id"})
    
    # Clean invalid coordinates
    outlets = outlets.dropna(subset=["lat", "lon"])
    outlets = outlets[(outlets['lat'] != 0.0) & (outlets['lon'] != 0.0)]
    
    outlets_rad = np.deg2rad(outlets[["lat", "lon"]].values)
    results = outlets[["outlet_id"]].copy()

    for cat in pois_df["category"].unique():
        logger.info("Processing KD-Tree for category: %s", cat)
        cat_pois = pois_df[pois_df["category"] == cat][["poi_lat", "poi_lon"]].values
        
        if len(cat_pois) == 0:
            results[f"dist_nearest_{cat}"] = np.nan
            for r in radii_meters: results[f"density_{cat}_{r}m"] = 0
            continue
            
        tree = BallTree(np.deg2rad(cat_pois), metric="haversine")
        dist_rad, _ = tree.query(outlets_rad, k=1)
        results[f"dist_nearest_{cat}"] = dist_rad.flatten() * 6_371_000
        
        for r in radii_meters:
            results[f"density_{cat}_{r}m"] = tree.query_radius(outlets_rad, r=(r / 6_371_000.0), count_only=True)
            
    return results

def main():
    latest_poi_file = get_latest_poi_file()
    features_df = engineer_features(OUTLET_COORDS_CSV, latest_poi_file, radii_meters=[500, 1500])
    
    features_df.to_csv(FEATURE_CSV, index=False)
    logger.info("Gold features successfully engineered and saved to %s", FEATURE_CSV)

if __name__ == "__main__":
    main()