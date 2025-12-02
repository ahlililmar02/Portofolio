from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import os
import psycopg2
from io import StringIO
import pandas as pd
import numpy as np
import rasterio
from rasterio.warp import Resampling
from typing import List
from rasterio.warp import reproject, Resampling
from rasterio.io import MemoryFile
import base64
from pydantic import BaseModel
from typing import Optional
import geopandas as gpd
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
from google import genai #

app = FastAPI()

load_dotenv()

FRONTEND_URL = os.getenv("FRONTEND_URL")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

conn = psycopg2.connect(
    host=os.getenv("DB_HOST"),
    database=os.getenv("DB_NAME"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASS"),
)

@app.get("/stations")
def get_stations():
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (station) station, latitude, longitude, sourceid
            FROM aqi
            ORDER BY station, time DESC;
        """)
        rows = cur.fetchall()
        stations = []
        for row in rows:
            stations.append({
                "station": row[0],
                "latitude": row[1],
                "longitude": row[2],
                "sourceid": row[3],
            })
    return stations


@app.get("/stations/latest")
def get_all_latest():
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (aqi.station)
                aqi.station,
                aqi.time,
                aqi.aqi,
                aqi.pm25,
                aqi.latitude,
                aqi.longitude,
                aqi.sourceid
            FROM aqi,
                (SELECT MAX(time) AS max_time FROM aqi) AS latest
            WHERE aqi.time >= latest.max_time - INTERVAL '3 hours'
            AND aqi.aqi IS NOT NULL
            AND aqi.aqi <> 0
            AND aqi.aqi::text <> 'NaN'   
            ORDER BY aqi.station, aqi.time DESC;
        """)
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in rows]


@app.get("/stations/daily")
def get_all_daily():
    with conn.cursor() as cur:
        cur.execute("""
            SELECT station, time::date AS date,
                ROUND(AVG(aqi::numeric), 2) AS aqi
            FROM aqi
            WHERE time::date <= (SELECT MAX(time::date) FROM aqi)
            AND time::date >= (SELECT MAX(time::date) FROM aqi) - INTERVAL '6 days'
            AND aqi IS NOT NULL
            AND aqi <> 'NaN'
            AND aqi <> 0 
            GROUP BY station, date
            ORDER BY station, date ASC;

        """)
        rows = cur.fetchall()
        
    grouped_results = {}

    for station, date, aqi in rows:
        daily_data = {
            "date": date.isoformat(),
            "aqi": float(aqi)
        }
        
        if station not in grouped_results:
            grouped_results[station] = {
                "station": station,
                "daily": []
            }
        
        grouped_results[station]["daily"].append(daily_data)

    result = list(grouped_results.values())
    
    return result



@app.get("/stations/today")
def get_all_today():
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                station, 
                time, 
                aqi
            FROM 
                aqi
            WHERE 
                time::date = (SELECT MAX(time::date) FROM aqi)
                AND aqi IS NOT NULL
                AND aqi <> 'NaN'
                AND aqi <> 0
            ORDER BY station, time ASC; 
        """)
        rows = cur.fetchall()

    grouped_results = {}

    for station_name, time_obj, aqi_val in rows:
        data_point = {
            "time": time_obj.isoformat(),
            "aqi": float(aqi_val)
        }
        
        if station_name not in grouped_results:
            grouped_results[station_name] = {
                "station": station_name,
                "today": [] 
            }
        
        grouped_results[station_name]["today"].append(data_point)

    result = list(grouped_results.values())
    
    return result



@app.get("/download")
def download_data(start: str = Query(...), end: str = Query(...)):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT *
            FROM aqi
            WHERE time >= %s AND time <= %s
            ORDER BY time;
        """, (start, end))
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]

        stream = StringIO()
        stream.write(",".join(columns) + "\n")
        for r in rows:
            stream.write(",".join([str(c) for c in r]) + "\n")
        stream.seek(0)

        return StreamingResponse(
            stream,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=data.csv"},
        )

app.mount("/tif", StaticFiles(directory="tif"), name="tif_files")

TIF_DIR = "tif"

@app.get("/list-files", response_model=List[str])
def list_all_files():
    """Lists all TIF files in the 'tif' directory."""
    try:
        return [f for f in os.listdir(TIF_DIR) if f.endswith(".tif")]
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="TIF data directory not found.")

@app.get("/extract-tif")
def extract_tif(model: str, date: str):
    import io
    from PIL import Image
    from matplotlib import cm, colors

    tif_dir = "tif"
    files = os.listdir(tif_dir)

    matched = [f for f in files if f"pm25_{model}_" in f]

    if len(matched) == 0:
        raise HTTPException(404, f"No files found for model: {model}")

    if date == "All Dates":
        raster_stack = []
        reference_meta = None
        reference_shape = None

        for i, tif_file in enumerate(matched):
            with rasterio.open(os.path.join(tif_dir, tif_file)) as src:
                arr = src.read(1).astype(float)
                if src.nodata is not None:
                    arr[arr == src.nodata] = np.nan

                if i == 0:
                    reference_meta = src.meta.copy()
                    reference_shape = arr.shape
                    bounds = src.bounds
                    raster_stack.append(arr)
                else:
                    # Resample to match reference grid
                    arr_resampled = np.empty(reference_shape, dtype=float)
                    reproject(
                        arr,
                        arr_resampled,
                        src_transform=src.transform,
                        src_crs=src.crs,
                        dst_transform=reference_meta["transform"],
                        dst_crs=reference_meta["crs"],
                        resampling=Resampling.bilinear
                    )
                    raster_stack.append(arr_resampled)

        final_img = np.nanmean(raster_stack, axis=0)

    else:
        # Pick exact date file
        selected = [f for f in matched if date in f]
        if len(selected) == 0:
            raise HTTPException(404, f"No file found for that date: {date}")

        file_path = os.path.join(tif_dir, selected[0])

        with rasterio.open(file_path) as src:
            final_img = src.read(1).astype(float)
            bounds = src.bounds
            nodata = src.nodata
            if nodata is not None:
                final_img[final_img == nodata] = np.nan


    # Keep NaN as NaN for transparency
    cleaned = final_img.copy()

    # Turbo colormap between 0–80
    vmin, vmax = 0, 80
    norm = colors.Normalize(vmin=vmin, vmax=vmax)
    cmap = cm.turbo

    # Map values → RGBA
    rgba = (cmap(norm(cleaned)) * 255).astype(np.uint8)  # H x W x 4

    transparency_mask = np.isnan(cleaned) | (cleaned == 0)
    rgba[..., 3] = np.where(transparency_mask, 0, 255)

    # Convert RGBA array → PNG
    pil_img = Image.fromarray(rgba, mode="RGBA")
    buffer = io.BytesIO()
    pil_img.save(buffer, format="PNG")

    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")


    return {
        "image": b64,
        "bounds": {
            "left": bounds.left,
            "right": bounds.right,
            "top": bounds.top,
            "bottom": bounds.bottom
        }
    }

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
try:
    client = genai.Client()
except Exception as e:
    print(f"Gemini Client Initialization Error: {e}")
    # Handle the error, maybe by raising an exception or using a dummy client
    client = None

try:
    DATA_PATH = "daily_complete.csv" 
    daily_df = pd.read_csv(DATA_PATH)
    daily_df['date'] = pd.to_datetime(daily_df['date']).dt.strftime('%Y-%m-%d')
except Exception as e:
    print(f"Error loading daily_complete.csv: {e}")
    daily_df = pd.DataFrame()


def assign_zones(df):
    if df.empty:
        return df

    # Ensure latitude and longitude are float
    df['latitude'] = pd.to_numeric(df['latitude'], errors='coerce')
    df['longitude'] = pd.to_numeric(df['longitude'], errors='coerce')
    
    conditions = {
        "North": df["latitude"] > -6.1,
        "Central": (df["latitude"].between(-6.2, -6.1)) & (df["longitude"].between(106.78, 106.85)),
        "West": df["longitude"] < 106.75,
        "East": df["longitude"] > 106.9,
        "South": df["latitude"] < -6.25
    }

    zone_col = []
    for i in range(len(df)):
        assigned = [z for z, cond in conditions.items() if cond.iloc[i]]
        zone_col.append(assigned[0] if assigned else "Unknown")
    
    df["zone"] = zone_col
    return df


def get_zone_summary(df, model_col):
    """Generates the zone-based error summary table."""
    
    df_working = df.rename(columns={'pm25': 'station_val', model_col: 'raster_val'})
    
    df_working['error'] = df_working['raster_val'] - df_working['station_val']
    
    # Filter out rows where zone is 'Unknown' if not needed
    summary_df = df_working[df_working['zone'] != 'Unknown']

    zone_summary = (
        summary_df.groupby("zone")
        .agg({
            "station_val": "mean",
            "raster_val": "mean",
            "error": ["mean", "std"]
        })
        .round(3)
    )
    zone_summary.columns = ["Station Mean", "Model Mean", "Mean Error", "Error Std"]
    
    return zone_summary

def get_gemini_analysis(df, selected_date, selected_model, metrics, zone_summary):

    model_col = f'pm25_{selected_model}'
    R2 = metrics['R2']
    MAE = metrics['MAE']
    Bias = metrics['Bias']

    sample_df = df.rename(columns={'pm25': 'station_val', model_col: 'raster_val'})
    
    sample_df['error'] = sample_df['raster_val'] - sample_df['station_val']
    
    
    example_summary = """
    - Overall Model: R² = 0.83 indicates good correlation, though underestimation occurs in the South.
    - Spatial Pattern: Central and West zones show higher bias, possibly due to coarse urban emission estimates.
    - Notes: High estimated PM2.5 in East Jakarta possibly due to Industrial activity near Bekasi and Karawang.
    """
    
    prompt = f"""
    You are an environmental data analyst. Analyze the spatiotemporal results for PM2.5 model performance in Jakarta, do not show the data directly, use bullet points to explain analysis

    Date
    {selected_date}

    Machine Learning model used
    {selected_model.upper()}

    Evaluation Metrics (Calculated on Frontend)
    - R² = {R2:.3f}
    - MAE = {MAE:.3f}
    - Bias = {Bias:.3f}

    Example Format
    {example_summary}

    Tasks
    1. Provide a concise overall spatial and temporal(seasonality based on dates) and performance summary (under 100 words).
    2. Identify which Jakarta city (zones) show high bias or variability and analyze the PM2.5 spatial pattern.
    3. Explain model behavior possible environmental or model causes (topography, urban sources, etc.).
    """
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        return response.text
    except Exception as e:
        return f"**Error calling Gemini API:** {e}"
class AnalysisResult(BaseModel):
    date: str
    model: str
    metrics: dict
    zone_summary: str
    gemini_analysis: str

@app.get("/analyze-pm25", response_model=AnalysisResult)
async def analyze_pm25(
    date: str = Query(..., description="Date in YYYY-MM-DD format, or 'All Dates'"),
    model: str = Query(..., description="Model abbreviation: 'xgb', 'rf', or 'lgbm'"),
    R2: float = Query(..., description="R-squared metric"),
    MAE: float = Query(..., description="Mean Absolute Error metric"),
    Bias: float = Query(..., description="Bias metric"),
):
    metrics = {
        'R2': R2, 
        'MAE': MAE, 
        'Bias': Bias, 
    }

    if daily_df.empty:
        return AnalysisResult(
            date=date, model=model, metrics={}, zone_summary="Data Error", 
            gemini_analysis="Data failed to load. Cannot proceed with analysis."
        )

    if date.lower() == 'all dates':
        filtered_df = daily_df.copy()
        selected_date = "All Dates (Averaged)"
    else:
        filtered_df = daily_df[daily_df['date'] == date].copy()
        selected_date = date

    if filtered_df.empty:
        return AnalysisResult(
            date=date, model=model, metrics={}, zone_summary="No Data", 
            gemini_analysis=f"No data found for the date: {selected_date}"
        )

    model_col = f'pm25_{model.lower()}'
    if model_col not in filtered_df.columns:
        return AnalysisResult(
            date=date, model=model, metrics={}, zone_summary="Model Error", 
            gemini_analysis=f"Model column '{model_col}' not found in data."
        )


    df_with_zones = assign_zones(filtered_df)
    zone_summary = get_zone_summary(df_with_zones, model_col)
    zone_summary_markdown = zone_summary.to_markdown()

    gemini_analysis_text = get_gemini_analysis(
        df_with_zones, 
        selected_date, 
        model, 
        metrics, 
        zone_summary
    )

    return AnalysisResult(
        date=selected_date,
        model=model.upper(),
        metrics=metrics,
        zone_summary=zone_summary_markdown,
        gemini_analysis=gemini_analysis_text
    )

@app.get("/greenspace")
def get_greenspace():
    # 1. Load GeoJSON
    gdf = gpd.read_file("greenspace.geojson")

    # 2. Select numeric columns except "cluster"
    exclude_cols = ["cluster"]
    numeric_cols = [c for c in gdf.columns if gdf[c].dtype != "object" and c not in exclude_cols]

    # 3. Normalize using MinMaxScaler
    scaler = MinMaxScaler()
    gdf[numeric_cols] = scaler.fit_transform(gdf[numeric_cols])

    # 4. Convert geometry to geojson-friendly format
    gdf["geometry"] = gdf["geometry"].apply(lambda x: x.__geo_interface__)

    # 5. Convert GeoDataFrame to list of dicts
    result = gdf.to_dict(orient="records")

    return result