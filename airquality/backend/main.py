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
from typing import List

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


@app.get("/average-pm25-data/{model_short}")
def average_pm25_data(model_short: str):
    """
    Finds all TIF files for a given model, reads the raster arrays,
    calculates the pixel-wise average, and returns the result as an in-memory GeoTIFF.
    
    :param model_short: The short code for the model (e.g., 'rf', 'xgb').
    """
    tif_folder = "tif"
    pattern = re.compile(rf"^pm25_{re.escape(model_short)}_(\d{{4}}-\d{{2}}-\d{{2}})\.tif$")
    
    matching_files = [f for f in os.listdir(tif_folder) if pattern.match(f)]
    
    if not matching_files:
        raise HTTPException(status_code=404, detail=f"No TIF files found for model: {model_short}")

    raster_arrays = []
    profile = None
    
    try:
        for i, filename in enumerate(matching_files):
            file_path = os.path.join(tif_folder, filename)
            with rasterio.open(file_path) as src:
                if i == 0:
                    profile = src.profile
                    profile.update(dtype=rasterio.float32, count=1) 
                
                raster_arrays.append(src.read(1).astype(np.float32))

        if not raster_arrays:
            raise HTTPException(status_code=500, detail="Failed to read any raster data.")
            
        stacked_arrays = np.stack(raster_arrays)
        average_array = np.mean(stacked_arrays, axis=0)

        memfile = BytesIO()
        with rasterio.open(memfile, 'w', **profile) as dst:
            dst.write(average_array, 1)

        memfile.seek(0)
        
        return Response(content=memfile.read(), media_type="image/tiff")

    except Exception as e:
        print(f"Error during TIF processing: {e}")
        raise HTTPException(status_code=500, detail=f"Server error during TIF processing: {str(e)}")