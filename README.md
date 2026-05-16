# Data Storm v7

This repository rebuilds the prediction model using Jupyter notebooks only.

Run the notebooks from the project root in the exact order below.

## Step 1 — Data cleaning

- Open `src/data_clean.ipynb` and run all cells.
- Output: cleaned silver-layer data written to `data/silver/`.

## Step 2 — Data analysis

- Open `src/data_analysis.ipynb` and run all cells for exploration and validation.

## Step 3 — Build the feature matrix

- Open `src/03a_build_feature_matrix.ipynb` and run all cells to generate the feature matrix.
- Output: `data/gold/master_training_matrix.csv`.

## Step 4 — Train the model and generate predictions

- Open `src/03b_model_lightgbm.ipynb` and run all cells to train the model and produce outputs.
- Outputs: `data/gold/validation_results.csv` and `data/gold/fih_predictions.csv`.

## Expected Outputs

- Cleaned data in `data/silver/`
- Feature matrix in `data/gold/master_training_matrix.csv`
- Validation results in `data/gold/validation_results.csv`
- Final predictions in `data/gold/fih_predictions.csv`

## Notes

- The Python scripts use relative paths, so run them from `src/python files/`.
- If you change the data preparation logic, rerun the steps above in the same order.
 
Note on paths:

- The original notebooks were developed in Google Colab and referenced files under a mounted Drive path (`/content/drive/MyDrive/data_storm/...`).
- These notebooks have been updated to use a repository-relative base path (e.g., `Path('..') / 'data'`) so they run locally without a Drive mount. If you need to run them in Colab, revert paths or mount Drive accordingly.
