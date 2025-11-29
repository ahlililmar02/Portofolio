from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
import os
import psycopg2
from io import StringIO

app = FastAPI()

# Allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
            SELECT DISTINCT ON (station) station, latitude, longitude, sourceid, date
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
                "date": row[4].isoformat() if row[4] else None
            })
    return stations


@app.get("/stations/{station}/latest")
def get_latest(station: str):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT *
            FROM aqi
            WHERE station = %s
            ORDER BY time DESC
            LIMIT 1;
        """, (station,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Station not found")
        columns = [desc[0] for desc in cur.description]
        return dict(zip(columns, row))


@app.get("/stations/{station}/daily")
def get_daily(station: str):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT date,
                   ROUND(AVG(aqi)::numeric, 2) AS aqi,
                   ROUND(AVG("pm2.5")::numeric, 2) AS "pm2.5"
            FROM aqi
            WHERE station = %s
            GROUP BY date
            ORDER BY date DESC
            LIMIT 7;
        """, (station,))
        rows = cur.fetchall()
        return [{"date": r[0].isoformat(), "aqi": r[1], "pm2.5": r[2]} for r in reversed(rows)]


@app.get("/stations/{station}/today")
def get_today(station: str):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT MAX(date)
            FROM aqi
            WHERE station = %s;
        """, (station,))
        latest_date = cur.fetchone()[0]
        if not latest_date:
            raise HTTPException(status_code=404, detail="Station not found")


        cur.execute("""
            SELECT *
            FROM aqi
            WHERE station = %s AND date = %s
            ORDER BY time;
        """, (station, latest_date))
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, r)) for r in rows]


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
