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
            SELECT station, date,
                   ROUND(AVG(aqi)::numeric, 2) AS aqi
            FROM aqi
            GROUP BY station, date
            ORDER BY station, date DESC;
        """)
        rows = cur.fetchall()

    from collections import defaultdict
    daily_data = defaultdict(list)
    for station, date, aqi in rows:
        daily_data[station].append({
            "date": date.isoformat(),
            "aqi": aqi,
        })

    return [{"station": s, "daily": daily_data[s]} for s in daily_data]


@app.get("/stations/today")
def get_all_today():
    with conn.cursor() as cur:
        cur.execute("""
            SELECT station, MAX(date) as latest_date
            FROM aqi
            GROUP BY station;
        """)
        latest_dates = cur.fetchall()

        today_data = []
        for station, latest_date in latest_dates:
            cur.execute("""
                SELECT *
                FROM aqi
                WHERE station = %s AND date = %s
                ORDER BY time;
            """, (station, latest_date))
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            today_data.append({
                "station": station,
                "date": latest_date.isoformat(),
                "data": [dict(zip(columns, r)) for r in rows]
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
