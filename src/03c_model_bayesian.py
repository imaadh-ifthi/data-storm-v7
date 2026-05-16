#!/usr/bin/env python3
"""
Bayesian Hierarchical Censored Model – Data Storm v7.0
Uses PyMC to estimate unconstrained latent demand via MCMC sampling.
"""

import pandas as pd
import numpy as np
import pymc as pm
import arviz as az
import logging
import warnings
from pathlib import Path

# Suppress PyTensor/PyMC warnings for clean console output
warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s │ %(message)s")

def main():
    logging.info("Loading Unified Feature Matrix...")
    df = pd.read_csv('../data/gold/master_training_matrix.csv')
    
    # 1. Define the Hierarchy (Grouping by Province)
    if 'Province' not in df.columns:
        # Fallback to Outlet_Type if Province wasn't mapped
        group_col = 'Outlet_Type' 
    else:
        group_col = 'Province'
        
    group_idx, groups = pd.factorize(df[group_col])
    coords = {"group": groups}
    
    # 2. Select and Standardize Spatial Features
    # Standardization is strictly required for MCMC chains to converge quickly
    spatial_features = [c for c in df.columns if 'dist_nearest' in c or 'density' in c]
    
    # Add temporal/score features if they exist
    if 'holiday_count' in df.columns: spatial_features.append('holiday_count')
    if 'Seasonality_Score' in df.columns: spatial_features.append('Seasonality_Score')
    
    X_raw = df[spatial_features].values
    X_mean = X_raw.mean(axis=0)
    X_std = X_raw.std(axis=0)
    X_std[X_std == 0] = 1 # Prevent division by zero
    X_scaled = (X_raw - X_mean) / X_std
    
    y_obs = df['Volume'].values
    
    # 3. Define the Censoring Limit (The Cap)
    # We must define the upper bound that constrained the outlet.
    # If Cooler_Capacity exists, use it (e.g., Capacity * multiplier). 
    # Otherwise, use the 90th percentile of the outlet's category as a proxy cap.
    if 'Cooler_Count' in df.columns:
        # Assuming 1 cooler = ~150 liters of monthly throughput capacity
        df['Censoring_Limit'] = df['Cooler_Count'] * 150 
    else:
        cap_proxy = df['Volume'].quantile(0.90)
        df['Censoring_Limit'] = np.maximum(y_obs, cap_proxy)
        
    c_limit = df['Censoring_Limit'].values

    logging.info(f"Compiling PyMC Hierarchical Model (Grouping by {group_col})...")
    with pm.Model(coords=coords) as hierarchical_model:
        # --- Data Containers ---
        X_data = pm.ConstantData("X", X_scaled)
        
        # --- Global Hyperpriors ---
        # The overarching average across all regions
        mu_a = pm.Normal("mu_a", mu=y_obs.mean(), sigma=y_obs.std())
        sigma_a = pm.HalfNormal("sigma_a", sigma=y_obs.std())
        
        # --- Group-Level Intercepts (Partial Pooling) ---
        # Each province gets its own baseline volume, drawn from the global distribution
        a = pm.Normal("a", mu=mu_a, sigma=sigma_a, dims="group")
        
        # --- Feature Coefficients (Slopes) ---
        b = pm.Normal("b", mu=0, sigma=100, shape=len(spatial_features))
        
        # --- The Latent Unconstrained Demand (mu) ---
        mu = a[group_idx] + pm.math.dot(X_data, b)
        
        # Error variance
        sigma = pm.HalfNormal("sigma", sigma=y_obs.std())
        
        # --- The Censored Likelihood ---
        # This tells the model: "The true demand is 'mu', but we could only observe up to 'c_limit'"
        y_latent = pm.Normal.dist(mu=mu, sigma=sigma)
        obs = pm.Censored("obs", y_latent, lower=0, upper=c_limit, observed=y_obs)
        
        logging.info("Initiating MCMC Sampling. Your CPU will heat up now...")
        # Using 2 chains and fewer draws for hackathon expediency. 
        # In production, use chains=4, draws=2000.
        trace = pm.sample(
            draws=1000, 
            tune=1000, 
            chains=2, 
            cores=2, 
            target_accept=0.90, 
            progressbar=True
        )
        
    logging.info("Sampling complete. Extracting posterior expectations...")
    
    # Extract the mean of the posterior distributions to reconstruct the unconstrained potential
    post_a = trace.posterior["a"].mean(dim=["chain", "draw"]).values
    post_b = trace.posterior["b"].mean(dim=["chain", "draw"]).values
    
    # Calculate Latent Potential: a[province] + (X * b)
    latent_mu = post_a[group_idx] + np.dot(X_scaled, post_b)
    
    # Post-processing enforcement: Potential cannot be lower than actuals
    df['Latent_Potential_Volume'] = np.maximum(latent_mu, y_obs)
    
    # Save final predictions
    output_path = Path('../data/teamname_bayesian_predictions.csv')
    submission = df[['Outlet_ID', 'Latent_Potential_Volume']]
    submission.to_csv(output_path, index=False)
    
    logging.info(f"Bayesian pipeline complete. CSV saved to {output_path}")

    # Optional: Print summary statistics of the MCMC trace
    print("\n--- Bayesian Parameter Summary ---")
    summary = az.summary(trace, var_names=["mu_a", "sigma_a", "b"])
    print(summary)

if __name__ == "__main__":
    main()