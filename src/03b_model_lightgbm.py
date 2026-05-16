#!/usr/bin/env python3
import pandas as pd
import numpy as np
import lightgbm as lgb
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s │ %(levelname)-8s │ %(message)s")
logger = logging.getLogger(__name__)

def calculate_pinball_loss(y_true, y_pred, tau=0.95):
    """Calculates the asymmetric Pinball Loss for validation verification."""
    err = y_true - y_pred
    return np.mean(np.where(err >= 0, tau * err, (tau - 1) * err))

def prep_holidays(holiday_path):
    """Processes external holiday list into monthly aggregations."""
    df = pd.read_csv(holiday_path)
    df['Date'] = pd.to_datetime(df['Date'])
    df['Year'] = df['Date'].dt.year
    df['Month'] = df['Date'].dt.month
    return df.groupby(['Year', 'Month']).size().reset_index(name='holiday_count')

def main():
    logger.info("Loading Unified Feature Matrix...")
    df = pd.read_csv('../data/gold/master_training_matrix.csv')
    
    # Extract chronological boundaries before casting to categorical types
    last_year = df['Year'].max()
    last_month = df[df['Year'] == last_year]['Month'].max()
    
    # COMPUTE HISTORICAL CEILING FLOOR
    logger.info("Extracting peak historical capacity volumes per outlet...")
    historical_max = df.groupby('Outlet_ID')['monthly_volume'].max().reset_index()
    historical_max.rename(columns={'monthly_volume': 'Historical_Max_Volume'}, inplace=True)
    
    # 1. Structural Categorical Transformation
    cat_cols = ['Outlet_Size', 'Outlet_Type', 'Month']
    for col in cat_cols:
        df[col] = df[col].astype('category')
        
    # Retain precise training category structure to guarantee inference alignment
    cat_structures = {col: df[col].cat.categories for col in cat_cols}
        
    # 2. Chronological Train/Validation Split
    val_mask = (df['Year'] == last_year) & (df['Month'] == last_month)
    train_df = df[~val_mask].copy()
    val_df = df[val_mask].copy()
    
    logger.info(f"Training on historical records up to {last_year}-{last_month - 1}")
    logger.info(f"Validating on holdout: {last_year}-{last_month} ({len(val_df)} records)")
    
    # Drop target leakage (bill value) and keys; retain Month for seasonal tracking
    drop_cols = ['Outlet_ID', 'monthly_volume', 'monthly_bill_value', 'Year']
    features = [c for c in df.columns if c not in drop_cols]
    
    X_train, y_train = train_df[features], train_df['monthly_volume']
    X_val, y_val = val_df[features], val_df['monthly_volume']
    
    # 3. Model Parameters (Optimized for 95th Percentile Ceilings)
    TAU = 0.95
    params = {
        'objective': 'quantile',
        'alpha': TAU,
        'metric': 'quantile',
        'learning_rate': 0.05,
        'num_leaves': 45,             
        'min_data_in_leaf': 100,      
        'feature_fraction': 0.8,
        'verbose': -1,
        'n_jobs': -1
    }
    
    logger.info("Training LightGBM Quantile Model (alpha=0.95)...")
    train_data = lgb.Dataset(X_train, label=y_train, categorical_feature=cat_cols)
    val_data = lgb.Dataset(X_val, label=y_val, reference=train_data, categorical_feature=cat_cols)
    
    model = lgb.train(
        params, 
        train_data, 
        num_boost_round=300,
        valid_sets=[val_data],
        callbacks=[lgb.early_stopping(stopping_rounds=30, verbose=False)]
    )
    
    # 4. Model Performance Validation
    val_preds = model.predict(X_val)
    pinball = calculate_pinball_loss(y_val.values, val_preds, tau=TAU)
    logger.info(f"Validation Pinball Loss: {pinball:.4f}")
    
    capture_rate = np.mean(val_preds >= y_val.values) * 100
    logger.info(f"Validation Capture Rate: {capture_rate:.1f}%")
    
    safe_actuals = np.where(y_val.values == 0, 1e-5, y_val.values)
    uplift_ratio = np.median(val_preds / safe_actuals)
    logger.info(f"Median Uplift Ratio: {uplift_ratio:.2f}x")
    
    # Export verification layer
    val_df['Predicted_Ceiling'] = val_preds
    val_export = val_df[['Outlet_ID', 'monthly_volume', 'Predicted_Ceiling']]
    val_export.to_csv('../data/validation_results.csv', index=False)
    logger.info("Validation performance trace exported to '../data/validation_results.csv'.")

    # 5. January 2026 Future Inference Matrix Setup
    logger.info("Constructing January 2026 target matrix...")
    raw_df = pd.read_csv('../data/gold/master_training_matrix.csv')
    static_cols = ['Outlet_ID'] + [c for c in features if c not in ['holiday_count', 'Month']]
    
    # Extract structural outlet settings from the most recent historical entry
    jan_2026_df = raw_df[static_cols].drop_duplicates(subset=['Outlet_ID'], keep='last').copy()
    jan_2026_df['Year'] = 2026
    jan_2026_df['Month'] = 1
    
    # Incorporate target temporal indicators
    holidays = prep_holidays('../data/bronze/holiday_list.csv')
    jan_2026_df = pd.merge(jan_2026_df, holidays, on=['Year', 'Month'], how='left')
    jan_2026_df['holiday_count'] = jan_2026_df['holiday_count'].fillna(0)
    
    # Align category definitions precisely with training configuration
    for col in cat_cols:
        jan_2026_df[col] = pd.Categorical(jan_2026_df[col], categories=cat_structures[col])
            
    X_inference = jan_2026_df[features]
    
    # 6. Prediction and Boundary Constraints Execution
    logger.info("Generating raw model predictions for January 2026...")
    jan_2026_df['Predicted_Raw'] = model.predict(X_inference)
    
    logger.info("Executing empirical bounding checks against all-time historical peaks...")
    jan_2026_df = pd.merge(jan_2026_df, historical_max, on='Outlet_ID', how='left')
    
    # Bound the prediction using the maximum verified historical volume floor
    jan_2026_df['Maximum_Monthly_Liters'] = np.maximum(
        jan_2026_df['Predicted_Raw'], 
        jan_2026_df['Historical_Max_Volume'].fillna(0)
    )
    
    # 7. Deliverable Generation
    submission = jan_2026_df[['Outlet_ID', 'Maximum_Monthly_Liters']]
    output_path = '../data/fih_predictions.csv'
    submission.to_csv(output_path, index=False)
    logger.info(f"Execution complete. Final submission binary saved to: {output_path}")

if __name__ == "__main__":
    main()