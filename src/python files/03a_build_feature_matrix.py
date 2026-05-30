#!/usr/bin/env python3
import pandas as pd
import numpy as np
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s │ %(levelname)-8s │ %(message)s")
logger = logging.getLogger(__name__)

# --- PATHS (Relative to src/) ---
SILVER_MASTER_CSV = Path('../data/silver/outlet_master_clean.csv')
SILVER_TXN_CSV = Path('../data/silver/monthly_transactions.csv')
GOLD_SPATIAL_CSV = Path('../data/gold/gold_outlet_spatial_features.csv')
BRONZE_HOLIDAY_CSV = Path('../data/bronze/holiday_list.csv')
BRONZE_SEASONALITY_CSV = Path('../data/bronze/distributor_season    ality_details.csv')
OUTPUT_MATRIX_CSV = Path('../data/gold/master_training_matrix.csv')

def prep_holidays(holiday_path: Path) -> pd.DataFrame:
    df = pd.read_csv(holiday_path)
    df['Date'] = pd.to_datetime(df['Date'])
    df['Year'] = df['Date'].dt.year
    df['Month'] = df['Date'].dt.month
    return df.groupby(['Year', 'Month']).size().reset_index(name='holiday_count')

def prep_seasonality(seasonality_path: Path) -> pd.DataFrame:
    df = pd.read_csv(seasonality_path)
    mapping = {'Un-Favorable': 0, 'Moderate': 1, 'Favorable': 2}
    df['Seasonality_Score'] = df['Seasonality_Index'].map(mapping)
    return df

def main():
    logger.info("Loading Data Layers...")
    
    master = pd.read_csv(SILVER_MASTER_CSV)
    transactions = pd.read_csv(SILVER_TXN_CSV) 
    spatial = pd.read_csv(GOLD_SPATIAL_CSV)
    holidays = prep_holidays(BRONZE_HOLIDAY_CSV)
    seasonality = prep_seasonality(BRONZE_SEASONALITY_CSV)
    
    logger.info("Merging Feature Matrix...")
    
    df = pd.merge(transactions, master, left_on='Outlet_ID', right_on='outlet_id', how='inner')
    
    if 'outlet_id' in df.columns:
        df = df.drop(columns=['outlet_id'])
        
    df = pd.merge(df, spatial, left_on='Outlet_ID', right_on='outlet_id', how='left')
    df = pd.merge(df, holidays, on=['Year', 'Month'], how='left')
    df['holiday_count'] = df['holiday_count'].fillna(0)
    
    if 'Distributor_ID' in df.columns:
        df = pd.merge(df, seasonality, on=['Distributor_ID', 'Year', 'Month'], how='left')
        df['Seasonality_Score'] = df['Seasonality_Score'].fillna(1) 
    
    spatial_cols = [c for c in df.columns if 'decayed_' in c or 'saturation' in c]
    df[spatial_cols] = df[spatial_cols].fillna(0.0)
    
    deprecated_cols = [col for col in df.columns if 'density_' in col or 'dist_nearest_' in col]
    if deprecated_cols:
        logger.info(f"Purging outdated spatial metrics: {deprecated_cols}")
        df = df.drop(columns=deprecated_cols, errors='ignore')
    
    cat_cols = ['Outlet_Type', 'Province', 'Distributor_ID']
    for col in cat_cols:
        if col in df.columns:
            df[col] = df[col].astype('category')
            
    df.to_csv(OUTPUT_MATRIX_CSV, index=False)
    logger.info("Feature matrix complete: %s", OUTPUT_MATRIX_CSV)

if __name__ == "__main__":
    main()