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

Github repository - https://github.com/imaadh-ifthi/data-storm-v7

## Frontend — Launching the app (development)

Prerequisites:

- Node 22 (check with `node --version` — expect a `v22.x` output)
- Bun (https://bun.sh) (check with `bun --version`)

Environment setup (run from the project root):

```bash
# create your local env file
cp .env.example .env

# edit .env and set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL
# (for Gemini OpenAI-compatible API, use:
#  LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
#  LLM_MODEL=gemini-1.5-flash )
```

Backend (run from the project root):

```bash
# seed the sqlite database
bun src/outlet_app/backend/seed-db.ts

# start the backend api server
bun src/outlet_app/backend/server.ts
```

Frontend (run from the project root):

```bash
# change into the frontend app directory
cd src/outlet_app

# install dependencies with Bun
bun install

# start the dev server
bun run dev
```

Notes:

- The frontend consumes CSV data placed under the `data/` folder (notably `data/gold/`). CSV reading is performed server-side by the app to avoid shipping large files to the browser.
- If you encounter issues with Bun or Node versions, ensure your environment is using Node 22 and a recent Bun release.

