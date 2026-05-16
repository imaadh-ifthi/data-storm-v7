#!/usr/bin/env python3
import pandas as pd
import numpy as np
import lightgbm as lgb
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s │ %(message)s")

def main():
    logging.info("Loading Unified Feature Matrix...")
    df = pd.read_csv('../data/gold/master_training_matrix.csv')
    
    # Convert string columns to category for LightGBM native handling
    cat_cols = df.select_dtypes(include=['object']).columns
    for col in cat_cols:
        df[col] = df[col].astype('category')
        
    # Define features and target
    drop_cols = ['Outlet_ID', 'Volume', 'Year', 'Month']
    features = [c for c in df.columns if c not in drop_cols and c != 'outlet_id']
    
    X = df[features]
    y = df['Volume']
    
    # Configure LightGBM for Quantile Regression (95th Percentile)
    params = {
        'objective': 'quantile',
        'alpha': 0.95,  # Target the 95th percentile (the uncapped ceiling)
        'metric': 'quantile',
        'learning_rate': 0.05,
        'num_leaves': 31,
        'feature_fraction': 0.8,
        'verbose': -1
    }
    
    logging.info("Training LightGBM Quantile Model (alpha=0.95)...")
    train_data = lgb.Dataset(X, label=y, categorical_feature='auto')
    
    # Train the model
    model = lgb.train(params, train_data, num_boost_round=150)
    
    # Predict the potential ceiling
    logging.info("Calculating unconstrained potential...")
    df['Predicted_Potential'] = model.predict(X)
    
    # Post-processing: Potential cannot be lower than what was actually sold
    df['Predicted_Potential'] = np.maximum(df['Predicted_Potential'], df['Volume'])
    
    # Save final predictions
    submission = df[['Outlet_ID', 'Predicted_Potential']]
    submission.to_csv('../data/teamname_lgbm_predictions.csv', index=False)
    logging.info("Pipeline complete. Predictions saved to teamname_lgbm_predictions.csv")

if __name__ == "__main__":
    main()