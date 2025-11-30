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

    from PIL import Image
    import io

    clean = np.nan_to_num(final_img, nan=0)
    scaled = np.clip(clean / 100, 0, 1)

    # Inferno 256-color colormap (compressed as array)
    TURBO = np.array([
        [48,18,59],[50,21,67],[51,25,74],[52,29,82],[53,33,89],[54,37,97],[55,41,105],[56,45,113],
        [57,49,122],[57,53,130],[58,57,138],[58,61,147],[59,65,155],[59,69,163],[58,73,171],[58,77,179],
        [58,81,187],[57,85,195],[56,89,202],[55,93,209],[53,96,216],[51,100,223],[49,104,229],[46,108,235],
        [43,111,240],[40,115,245],[36,118,249],[32,121,252],[28,125,255],[23,128,255],[18,131,255],[11,134,254],
        [5,137,252],[0,140,249],[0,143,245],[0,146,242],[0,149,238],[0,152,234],[0,155,229],[0,158,225],
        [0,161,220],[0,163,215],[0,166,210],[0,169,206],[0,171,201],[0,174,197],[0,177,192],[0,179,188],
        [0,182,184],[0,184,180],[0,187,176],[0,189,172],[0,192,168],[0,194,165],[1,197,161],[5,199,158],
        [10,201,154],[15,203,151],[20,206,147],[25,208,144],[31,210,141],[36,212,138],[42,214,135],
        [48,216,132],[54,218,129],[60,220,126],[66,221,123],[72,223,121],[78,224,118],[84,226,115],
        [90,227,113],[96,229,110],[102,230,108],[108,231,106],[114,233,103],[121,234,101],[127,235,99],
        [133,236,97],[139,237,95],[145,238,93],[151,239,91],[157,240,89],[163,241,87],[168,242,85],
        [174,243,83],[180,244,81],[185,245,79],[191,245,77],[196,246,75],[202,247,73],[207,248,70],
        [212,248,68],[217,249,66],[222,249,64],[227,250,61],[232,250,59],[236,251,56],[241,251,54],
        [245,252,51],[249,252,48],[253,253,45],[255,252,42],[255,250,40],[255,248,38],[255,246,36],
        [255,244,34],[255,242,32],[255,240,30],[255,237,28],[255,235,26],[255,232,23],[255,229,21],
        [255,226,19],[255,223,17],[255,220,15],[255,216,13],[255,213,11],[255,209,9],[255,206,7],
        [255,202,5],[255,198,4],[255,194,3],[255,190,2],[255,185,1],[255,181,1],[255,176,1],
        [254,172,1],[254,167,1],[253,162,1],[252,157,1],[251,152,1],[250,147,1],[248,142,1],
        [247,137,1],[245,132,1],[243,127,1],[241,121,1],[239,116,1],[237,110,1],[234,105,1],
        [232,99,1],[229,93,1],[226,87,1],[223,81,1],[220,75,1],[216,69,1],[213,63,1],
        [209,56,1],[205,50,1],[201,43,1],[197,37,1],[192,30,1],[188,23,1],[183,16,1],[178,9,1],
        [173,2,1],[168,0,2],[162,0,6],[156,0,10],[151,0,14],[145,0,18],[139,0,22],[133,0,26],
        [127,0,30],[121,0,34],[115,0,38],[109,0,41],[103,0,45],[97,0,48],[91,0,52],[85,0,55],
        [79,0,59],[73,0,62],[67,0,65],[61,0,68],[55,0,71],[49,0,74],[43,0,77],[37,0,80],
        [32,0,83],[26,0,85],[20,0,88],[15,0,91],[9,0,93],[4,0,96],[0,0,98],[0,0,101],
        [0,0,103],[0,0,105],[0,0,108],[0,0,110],[0,0,112],[0,1,114],[0,3,116],[0,5,118],
        [1,7,120],[2,9,121],[4,11,123],[6,13,125],[9,15,126],[12,17,128],[15,19,129],[18,21,131],
        [21,23,132],[25,25,134],[29,27,135],[33,29,137],[38,31,138],[42,33,139],[47,35,141],
        [52,37,142],[57,39,143],[62,41,145],[67,43,146],[72,45,147],[78,47,149],[83,50,150],
        [89,52,151],[95,54,153],[100,56,154],[106,58,155],[112,60,156],[118,62,158],[124,64,159],
        [130,66,160],[136,68,162],[142,70,163],[148,72,164],[154,74,165],[160,76,167],[166,78,168],
        [171,80,169],[177,82,170],[183,84,171],[188,86,173],[194,88,174],[199,90,175],[205,92,176],
        [210,94,177],[216,95,178],[221,97,179],[226,99,180],[232,101,181],[237,103,182],[242,104,183],
        [247,106,184],[251,108,185],[255,110,186]
    ], dtype=np.uint8)


    idx = (scaled * (len(TURBO) - 1)).astype(np.int32)
    rgb = TURBO[idx]     

    h, w = clean.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    rgba[..., :3] = rgb
    rgba[..., 3] = np.where(clean == 0, 0, 255)

    pil_img = Image.fromarray(rgba, mode="RGBA")
    pil_img = pil_img.resize((w, h), resample=Image.NEAREST)  
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
