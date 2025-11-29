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

from collections import defaultdict

@app.get("/stations/daily")
from fastapi import FastAPI
from psycopg2 import connect

app = FastAPI()
conn = connect("your_connection_string_here")

@app.get("/stations/daily")
def get_all_daily():
    with conn.cursor() as cur:
        cur.execute("""
            SELECT station, time::date AS date,
                   ROUND(AVG(aqi)::numeric, 2) AS aqi
            FROM aqi
            WHERE time::date <= (SELECT MAX(time::date) FROM aqi)
              AND time::date >= (SELECT MAX(time::date) FROM aqi) - INTERVAL '6 days'
              AND aqi IS NOT NULL
            GROUP BY station, date
            ORDER BY station, date DESC;
        """)
        rows = cur.fetchall()

    result = [
        {
            "station": station,
            "date": date.isoformat(),  
            "aqi": float(aqi)          
        }
        for station, date, aqi in rows
    ]

    return result





@app.get("/stations/today")
def get_all_today():
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(time::date) FROM aqi;")
        latest_date = cur.fetchone()[0]
        if latest_date is None:
            return []  

        cur.execute("""
            SELECT station, time, aqi, pm25, latitude, longitude, sourceid,
                   time::date AS date
            FROM aqi
            WHERE time::date = %s
            ORDER BY station, time;
        """, (latest_date,))
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]

        # Group by station
        from collections import defaultdict
        station_data = defaultdict(list)
        for r in rows:
            row_dict = dict(zip(columns, r))

            for col in ["aqi", "pm25", "latitude", "longitude"]:
                if row_dict[col] is not None:
                    row_dict[col] = float(row_dict[col])
                    
            station_data[row_dict["station"]].append(row_dict)

        today_data = []
        for station, data_list in station_data.items():
            today_data.append({
                "station": station,
                "date": latest_date.isoformat(),
                "data": data_list
            })

    return today_data



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

        # CSV buffer
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
