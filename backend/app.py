import os
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Initialize FastAPI application
app = FastAPI(
    title="⚡ Intelligent Power Demand Forecasting API",
    description=(
        "A high-performance REST API serving a Random Forest Regressor "
        "to forecast electricity demand based on meteorological and temporal parameters."
    ),
    version="1.0.0",
)

# Enable CORS (Cross-Origin Resource Sharing) to allow frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local development/testing
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Determine the absolute path to the model.pkl file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model.pkl")

# Load the serialized model on startup
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"Model file not found at expected path: {MODEL_PATH}")

try:
    model = joblib.load(MODEL_PATH)
    print("✅ Machine learning model loaded successfully.")
except Exception as e:
    raise RuntimeError(f"Failed to load the serialized model: {str(e)}")


# Define Pydantic request schema for strict input validation
class PredictionRequest(BaseModel):
    Temperature: float = Field(
        ..., 
        description="Ambient temperature in °C", 
        json_schema_extra={"example": 25.5}
    )
    Humidity: float = Field(
        ..., 
        description="Relative humidity percentage (%)", 
        json_schema_extra={"example": 60.0}
    )
    WindSpeed: float = Field(
        ..., 
        description="Wind speed in m/s", 
        json_schema_extra={"example": 2.1}
    )
    Hour: int = Field(
        ..., 
        description="Hour of the day (0-23)", 
        ge=0, 
        le=23, 
        json_schema_extra={"example": 14}
    )
    Day: int = Field(
        ..., 
        description="Day of the month (1-31)", 
        ge=1, 
        le=31, 
        json_schema_extra={"example": 15}
    )
    Month: int = Field(
        ..., 
        description="Month of the year (1-12)", 
        ge=1, 
        le=12, 
        json_schema_extra={"example": 6}
    )
    Weekday: int = Field(
        ..., 
        description="Day of the week (0 = Monday, 6 = Sunday)", 
        ge=0, 
        le=6, 
        json_schema_extra={"example": 2}
    )
    Weekend: int = Field(
        ..., 
        description="Weekend indicator (1 if Saturday or Sunday, else 0)", 
        ge=0, 
        le=1, 
        json_schema_extra={"example": 0}
    )


# Define Pydantic response schema
class PredictionResponse(BaseModel):
    predicted_load: float = Field(
        ..., 
        description="Predicted total regional power demand in kW"
    )


@app.get("/")
def read_root():
    """
    Status endpoint to check if the API is running and the model is loaded.
    """
    return {
        "status": "online",
        "message": "Intelligent Power Demand Forecasting API is fully operational.",
        "model": "Random Forest Regressor",
        "features_expected": [
            "Temperature",
            "Humidity",
            "WindSpeed",
            "Hour",
            "Day",
            "Month",
            "Weekday",
            "Weekend"
        ]
    }


@app.get("/weather")
def get_weather():
    """
    Returns sample meteorological forecast data for Dhanbad, Jharkhand, India.
    This simulates integration with an external live weather API.
    """
    return {
        "location": "Dhanbad, Jharkhand, India",
        "station": "Dhanbad Meteorological Observatory",
        "current": {
            "Temperature": 28.5,
            "Humidity": 70.0,
            "WindSpeed": 2.5,
            "condition": "Scattered Clouds"
        },
        "forecast_today": [
            {"hour": 8, "Temperature": 24.2, "Humidity": 85.0, "WindSpeed": 1.8, "condition": "Mist"},
            {"hour": 12, "Temperature": 30.5, "Humidity": 65.0, "WindSpeed": 2.2, "condition": "Partly Cloudy"},
            {"hour": 16, "Temperature": 31.8, "Humidity": 60.0, "WindSpeed": 2.8, "condition": "Scattered Clouds"},
            {"hour": 20, "Temperature": 27.0, "Humidity": 75.0, "WindSpeed": 1.5, "condition": "Clear"},
            {"hour": 0, "Temperature": 23.5, "Humidity": 88.0, "WindSpeed": 1.0, "condition": "Clear"}
        ]
    }


@app.get("/holidays")
def get_holidays():
    """
    Reads the data/holidays.csv file and returns all official holiday records.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    holidays_path = os.path.join(base_dir, "..", "data", "holidays.csv")
    
    if not os.path.exists(holidays_path):
        raise HTTPException(
            status_code=404, 
            detail=f"Holidays database file not found at expected path: {holidays_path}"
        )
    try:
        df_holidays = pd.read_csv(holidays_path)
        # Parse Dates as strings to ensure robust JSON serialization
        df_holidays["Date"] = df_holidays["Date"].astype(str)
        holidays_list = df_holidays.to_dict(orient="records")
        return {
            "total_holidays": len(holidays_list),
            "holidays": holidays_list
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read holiday database: {str(e)}"
        )


@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest):
    """
    Predict endpoint that takes weather and time parameters and returns the forecasted power demand.
    """
    try:
        # Convert request parameters into a DataFrame with exact feature names and order
        input_data = pd.DataFrame([{
            "Temperature": request.Temperature,
            "Humidity": request.Humidity,
            "WindSpeed": request.WindSpeed,
            "Hour": request.Hour,
            "Day": request.Day,
            "Month": request.Month,
            "Weekday": request.Weekday,
            "Weekend": request.Weekend
        }])
        
        # Execute model inference
        prediction = model.predict(input_data)
        
        # Extract and return the predicted value
        predicted_value = float(prediction[0])
        
        return PredictionResponse(predicted_load=predicted_value)
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"An error occurred during model inference: {str(e)}"
        )
