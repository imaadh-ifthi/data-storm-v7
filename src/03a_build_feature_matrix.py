#!/usr/bin/env python3
import pandas as pd
import numpy as np
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s │ %(levelname)-8s │ %(message)s")
logger = logging.getLogger(__name__)

def prep_holidays(holiday_path: str) -> pd.DataFrame:
    """Aggregates holiday counts per Year-Month."""
    df = pd.read_csv(holiday_path)
    df['Date'] = pd.to_datetime(df['Date'])
    df['Year'] = df['Date'].dt.year
    df['Month'] = df['Date'].dt.month
    return df.groupby(['Year', 'Month']).size().reset_index(name='holiday_count')

def prep_seasonality(seasonality_path: str) -> pd.DataFrame:
    """Converts categorical seasonality into ordinal integers."""
    df = pd.read_csv(seasonality_path)
    mapping = {'Un-Favorable': 0, 'Moderate': 1, 'Favorable': 2}
    df['Seasonality_Score'] = df['Seasonality_Index'].map(mapping)
    return df

def main():
    logger.info("Loading Data Layers...")
    
    # 1. Base Data (Silver Layer)
    master = pd.read_csv('../data/silver/outlet_master_clean.csv')
    transactions = pd.read_csv('../data/silver/monthly_transactions.csv') 
    
    # 2. Spatial Data (Gold Layer)
    spatial = pd.read_csv('../data/gold/gold_outlet_spatial_features.csv')
    
    # 3. Temporal Data (Bronze/Silver Layer)
    holidays = prep_holidays('../data/bronze/holiday_list.csv')
    seasonality = prep_seasonality('../data/bronze/distributor_seasonality_details.csv')
    
    logger.info("Merging Feature Matrix...")
    
    # Merge Transactions + Master + Spatial
    df = pd.merge(transactions, master, left_on='Outlet_ID', right_on='outlet_id', how='inner')
    # Drop duplicate ID column if it exists
    if 'outlet_id' in df.columns:
        df = df.drop(columns=['outlet_id'])
        
    df = pd.merge(df, spatial, left_on='Outlet_ID', right_on='outlet_id', how='left')
    
    # Merge Temporal Data
    df = pd.merge(df, holidays, on=['Year', 'Month'], how='left')
    df['holiday_count'] = df['holiday_count'].fillna(0)
    
    if 'Distributor_ID' in df.columns:
        df = pd.merge(df, seasonality, on=['Distributor_ID', 'Year', 'Month'], how='left')
        df['Seasonality_Score'] = df['Seasonality_Score'].fillna(1) # Default to Moderate
    
    # Fill missing spatial features with 0 (e.g., no transit within radius)
    spatial_cols = [c for c in df.columns if 'dist_nearest' in c or 'density' in c]
    df[spatial_cols] = df[spatial_cols].fillna(0)
    
    # Ensure correct data types for categorical columns
    cat_cols = ['Outlet_Type', 'Province', 'Distributor_ID']
    for col in cat_cols:
        if col in df.columns:
            df[col] = df[col].astype('category')
            
    output_path = Path('../data/gold/master_training_matrix.csv')
    df.to_csv(output_path, index=False)
    logger.info("Feature matrix complete: %s", output_path)

if __name__ == "__main__":
    main()