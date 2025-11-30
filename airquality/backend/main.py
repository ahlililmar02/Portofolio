from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import os
import psycopg2
from io import StringIO
from io import BytesIO
import re
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from typing import List, Dict, Any


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
@app.get("/list-files", response_model=List[str])
def list_all_files():
    """Lists all TIF files in the 'tif' directory."""
    folder = "tif"
    try:
        all_files = [f for f in os.listdir(folder) if f.endswith(".tif")]
        return all_files
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="TIF data directory ('tif/') not found.")


def _get_matching_files(model_short: str) -> List[str]:
    tif_folder = "tif"
    pattern = re.compile(rf"^pm25_{re.escape(model_short)}_(\d{{4}}-\d{{2}}-\d{{2}})\.tif$")
    return [f for f in os.listdir(tif_folder) if pattern.match(f)]


def _process_rasters(model_short: str, selected_date: str = "All Dates") -> Dict[str, Any]:
    """
    Core function to read, align, and average (if necessary) rasters.
    Returns the processed numpy array (image) and metadata (meta).
    """
    tif_folder = "tif"
    matching_files = _get_matching_files(model_short)

    if not matching_files:
        raise HTTPException(status_code=404, detail=f"No TIF files found for model: {model_short}")

    if selected_date != "All Dates":
        file_name = f"pm25_{model_short}_{selected_date}.tif"
        if file_name not in matching_files:
            raise HTTPException(status_code=404, detail=f"File not found for date: {selected_date}")

        tif_path = os.path.join(tif_folder, file_name)
        try:
            with rasterio.open(tif_path) as src:
                img = src.read(1).astype(np.float32)
                if src.nodata is not None:
                    img = np.where(img == src.nodata, np.nan, img)
                meta = src.meta.copy()
                meta.update(dtype=rasterio.float32, count=1) 
                return {"image": img, "meta": meta}
        except rasterio.RasterioIOError as rio_err:
            raise HTTPException(status_code=500, detail=f"Error reading TIF file {file_name}: {rio_err}")
    
    reference_meta = None
    for filename in matching_files:
        try:
            tif_path = os.path.join(tif_folder, filename)
            with rasterio.open(tif_path) as src:
                reference_meta = src.meta.copy()
                reference_meta.update(dtype=rasterio.float32, count=1)
                break 
        except rasterio.RasterioIOError:
             print(f"WARNING: Skipping unreadable file {filename} while establishing reference grid.")
             continue
    
    if reference_meta is None:
        raise HTTPException(status_code=500, detail="Failed to establish a valid reference grid.")

    raster_stack = []
    for tif_file in matching_files:
        tif_path = os.path.join(tif_folder, tif_file)
        try:
            with rasterio.open(tif_path) as src_temp:
                img_temp = src_temp.read(1).astype(np.float32)
                if src_temp.nodata is not None:
                    img_temp = np.where(img_temp == src_temp.nodata, np.nan, img_temp)

                img_resampled = np.empty(reference_meta['shape'], dtype=np.float32)
                reproject(
                    source=img_temp,
                    destination=img_resampled,
                    src_transform=src_temp.transform,
                    src_crs=src_temp.crs,
                    dst_transform=reference_meta["transform"],
                    dst_crs=reference_meta["crs"],
                    resampling=Resampling.bilinear,
                )
                raster_stack.append(img_resampled)

        except rasterio.RasterioIOError as rio_err:
            print(f"WARNING: Skipping corrupted TIF file {tif_file} during stacking: {rio_err}")
            continue

    if not raster_stack:
        raise HTTPException(status_code=500, detail="Failed to read any valid raster data for averaging.")
        
    average_array = np.nanmean(raster_stack, axis=0)
    
    return {"image": average_array, "meta": reference_meta}
        

@app.get("/get-pm25-data/{model_short}/{selected_date}", response_model=List[Dict[str, float]])
def get_pm25_data(model_short: str, selected_date: str):

    try:
        result = _process_rasters(model_short, selected_date)
        image = result["image"]
        meta = result["meta"]
        
        transform = meta['transform']
        rows, cols = image.shape
        data = []
        
        for row in range(rows):
            for col in range(cols):
                pm25_value = image[row, col]
                
                if np.isnan(pm25_value):
                    continue
                
                lon, lat = rasterio.transform.xy(transform, row, col)
                
                data.append({
                    "latitude": round(lat, 5),
                    "longitude": round(lon, 5),
                    "pm25": round(float(pm25_value), 3)
                })
        
        return data

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating JSON data: {e}")
        raise HTTPException(status_code=500, detail=f"Server error generating JSON: {str(e)}")