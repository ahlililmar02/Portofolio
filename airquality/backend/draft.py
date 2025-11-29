from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
import os
import pandas as pd
import psycopg2
from datetime import date
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

df = pd.read_sql("SELECT * FROM aqi", conn)
   
df["time"] = pd.to_datetime(df["time"])

# Precompute date column for efficiency
df["date"] = df["time"].dt.date


@app.get("/stations")
def get_stations():
    stations = df.groupby("station_name").agg({
        "latitude": "first",
        "longitude": "first",
        "sourceid": "first",
        "date":"first"
    }).reset_index()
    return stations.to_dict(orient="records")


@app.get("/stations/{station}/latest")
def get_latest(station: str):
    d = df[df["station_name"] == station].sort_values("time", ascending=False).iloc[0]
    return d.to_dict()


@app.get("/stations/{station}/daily")
def get_daily(station: str):
    d = df[df["station_name"] == station].copy()

    daily = (
        d.groupby("date")
         .agg({"aqi": "mean", "pm2.5": "mean"})
         .reset_index()
         .sort_values("date")
    )

    return daily.tail(7).to_dict(orient="records")


@app.get("/stations/{station}/today")
def get_today(station: str):
    d = df[df["station_name"] == station].copy()

    latest_date = d["date"].max()

    d_latest = d[d["date"] == latest_date].sort_values("time")

    return d_latest.to_dict(orient="records")

@app.get("/download")
def download_data(start: str = Query(...), end: str = Query(...)):
    start = pd.to_datetime(start)
    end = pd.to_datetime(end)

    filtered = df[(df["time"] >= start) & (df["time"] <= end)].copy()

    # ✅ Sort by time
    filtered = filtered.sort_values("time")

    # CSV buffer
    stream = StringIO()
    filtered.to_csv(stream, index=False)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=data.csv"},
    )
