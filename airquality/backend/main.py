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

    final_img = np.nan_to_num(final_img, nan=0).astype("float32")

    with MemoryFile() as memfile:
        with memfile.open(
            driver="GTiff",
            width=final_img.shape[1],
            height=final_img.shape[0],
            count=1,
            dtype="float32"
        ) as dataset:
            dataset.write(final_img, 1)

        tiff_bytes = memfile.read()

    from PIL import Image
    import io

    clean = np.nan_to_num(final_img, nan=0)
    scaled = np.clip(clean / 100, 0, 1)

    # Inferno 256-color colormap (compressed as array)
    INFERNO = np.array([
        [0, 0, 4], [1, 0, 5], [1, 1, 6], [2, 1, 8], [4, 2, 11],
        [7, 3, 14], [10, 5, 18], [15, 7, 23], [20, 9, 28],
        [26, 12, 34], [33, 15, 41], [41, 18, 48], [49, 22, 55],
        [58, 25, 63], [67, 29, 71], [77, 33, 79], [87, 38, 87],
        [98, 42, 95], [108, 47, 103], [119, 52, 111],
        [130, 57, 118], [140, 62, 124], [150, 67, 130],
        [160, 72, 134], [170, 77, 138], [179, 82, 141],
        [188, 87, 142], [197, 92, 142], [205, 96, 142],
        [213, 101, 140], [221, 106, 137], [228, 111, 133],
        [235, 116, 129], [241, 121, 123], [247, 126, 118],
        [252, 131, 111], [255, 137, 105], [255, 143, 98],
        [254, 149, 92], [252, 156, 86], [249, 163, 81],
        [245, 169, 76], [241, 176, 72], [236, 183, 68],
        [230, 189, 65], [224, 196, 62], [218, 202, 60],
        [211, 208, 57], [204, 214, 55], [196, 220, 53],
        [189, 225, 52], [181, 231, 50], [173, 236, 49],
    ], dtype=np.uint8)

    idx = (scaled * (len(INFERNO) - 1)).astype(np.int32)
    rgb = INFERNO[idx]     

    h, w = clean.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    rgba[..., :3] = rgb
    rgba[..., 3] = np.where(clean == 0, 0, 255)

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
