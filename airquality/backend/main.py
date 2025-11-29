from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
import os
import psycopg2
from io import StringIO

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://35.208.207.194:8080"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()

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
            ORDER BY station, time ASC; -- Order by time ASC within the day
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
