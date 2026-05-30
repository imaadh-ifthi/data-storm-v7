#!/usr/bin/env python3
import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s │ %(levelname)-8s │ %(message)s")
logger = logging.getLogger(__name__)

# --- PATHS ---
BRONZE_EXT_DIR = Path("../../data/bronze/external_pois")
OUTLET_COORDS_CSV = Path("../../data/bronze/outlet_coordinates.csv")

GOLD_DIR = Path("../../data/gold")
GOLD_DIR.mkdir(parents=True, exist_ok=True)
FEATURE_CSV = GOLD_DIR / "gold_outlet_spatial_features.csv"

EARTH_RADIUS_M = 6_371_000.0

# Define category-specific spatial configurations
# lambda: Exponential decay constant. Higher values = faster decay / steeper drop-off
DECAY_CONFIGS = {
    "competitors": {"radius": 1500, "lambda": 0.005}, 
    "transit": {"radius": 2000, "lambda": 0.001},
    "schools": {"radius": 1500, "lambda": 0.002},
    "hospitals": {"radius": 3000, "lambda": 0.0005},
    "markets": {"radius": 2000, "lambda": 0.0015},
    "financial": {"radius": 1500, "lambda": 0.002},
    "tourism": {"radius": 2000, "lambda": 0.001},
    "offices": {"radius": 1500, "lambda": 0.002},
    "industrial": {"radius": 2500, "lambda": 0.001},
    "worship": {"radius": 1500, "lambda": 0.002}
}

DEFAULT_CONFIG = {"radius": 2000, "lambda": 0.002}

def get_latest_poi_file() -> Path:
    """Finds the most recently generated POI master file in the Bronze directory."""
    files = list(BRONZE_EXT_DIR.glob("all_pois_master*.csv"))
    if not files:
        raise FileNotFoundError("No POI master file found. Run 02a_ingest_external_bronze.py first.")
    return max(files, key=lambda p: p.stat().st_mtime)

def calculate_spatial_decay(outlets_rad: np.ndarray, pois_rad: np.ndarray, radius_m: float, decay_lambda: float) -> np.ndarray:
    """Computes the exponential distance-decay score using O(log N) BallTree queries."""
    if len(pois_rad) == 0:
        return np.zeros(len(outlets_rad))

    tree = BallTree(pois_rad, metric="haversine")
    radius_rad = radius_m / EARTH_RADIUS_M
    
    _, distances_rad = tree.query_radius(outlets_rad, r=radius_rad, return_distance=True)

    decay_scores = np.zeros(len(outlets_rad))
    for i, dist_array_rad in enumerate(distances_rad):
        if len(dist_array_rad) > 0:
            dist_array_m = dist_array_rad * EARTH_RADIUS_M
            # Sum of e^(-lambda * distance_in_meters)
            decay_scores[i] = np.sum(np.exp(-decay_lambda * dist_array_m))

    return decay_scores

def engineer_features(outlets_csv: Path, pois_csv: Path) -> pd.DataFrame:
    logger.info("Loading latest Bronze POI data: %s", pois_csv.name)
    pois_df = pd.read_csv(pois_csv)
    
    outlets = pd.read_csv(outlets_csv).rename(columns=lambda x: x.strip().lower())
    outlets = outlets.rename(columns={"latitude": "lat", "longitude": "lon", "outlet_id": "outlet_id"})
    
    # Clean invalid coordinates
    outlets = outlets.dropna(subset=["lat", "lon"])
    outlets = outlets[(outlets['lat'] != 0.0) & (outlets['lon'] != 0.0)]
    
    outlets_rad = np.deg2rad(outlets[["lat", "lon"]].values)
    results = outlets[["outlet_id"]].copy()

    # Process external POIs
    for cat in pois_df["category"].unique():
        logger.info("Calculating spatial decay for category: %s", cat)
        cat_pois = pois_df[pois_df["category"] == cat][["poi_lat", "poi_lon"]].values
        
        if len(cat_pois) == 0:
            results[f"decayed_{cat}_score"] = 0.0
            continue
            
        pois_rad = np.deg2rad(cat_pois)
        config = DECAY_CONFIGS.get(cat, DEFAULT_CONFIG)
        
        results[f"decayed_{cat}_score"] = calculate_spatial_decay(
            outlets_rad, pois_rad, radius_m=config["radius"], decay_lambda=config["lambda"]
        )

    # Process intra-network competitive saturation
    logger.info("Calculating internal network saturation...")
    internal_scores = calculate_spatial_decay(
        outlets_rad, outlets_rad, radius_m=1000.0, decay_lambda=0.004
    )
    # Subtract 1.0 to neutralize self-intersection distance (distance = 0 -> exp(0) = 1)
    results["internal_network_saturation"] = np.maximum(0.0, internal_scores - 1.0)
            
    return results

def main():
    latest_poi_file = get_latest_poi_file()
    features_df = engineer_features(OUTLET_COORDS_CSV, latest_poi_file)
    
    features_df.to_csv(FEATURE_CSV, index=False)
    logger.info("Gold features successfully engineered and saved to %s", FEATURE_CSV)

if __name__ == "__main__":
    main()