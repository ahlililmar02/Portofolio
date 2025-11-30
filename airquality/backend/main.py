from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import os
import psycopg2
from io import StringIO
import numpy as np
import rasterio
from rasterio.warp import Resampling
from typing import List
from rasterio.warp import reproject, Resampling
from rasterio.io import MemoryFile
import base64

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
            ORDER BY station, date DESC;

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

    # ---------------------------------------------------------------------
    # ----------------------- APPLY TURBO COLOR MAP ------------------------
    # ---------------------------------------------------------------------

    # Keep NaN as NaN for transparency
    cleaned = final_img.copy()

    # Turbo colormap between 0–80
    vmin, vmax = 0, 80
    norm = colors.Normalize(vmin=vmin, vmax=vmax)
    cmap = cm.turbo

    # Map values → RGBA
    rgba = (cmap(norm(cleaned)) * 255).astype(np.uint8)  # H x W x 4

    # TRANSPARENT RULE:
    # NaN → fully transparent
    # value == 0 → fully transparent
    transparency_mask = np.isnan(cleaned) | (cleaned == 0)
    rgba[..., 3] = np.where(transparency_mask, 0, 255)

    # Convert RGBA array → PNG
    pil_img = Image.fromarray(rgba, mode="RGBA")
    buffer = io.BytesIO()
    pil_img.save(buffer, format="PNG")

    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    # ---------------------------------------------------------------------

    return {
        "image": b64,
        "bounds": {
            "left": bounds.left,
            "right": bounds.right,
            "top": bounds.top,
            "bottom": bounds.bottom
        }
    }