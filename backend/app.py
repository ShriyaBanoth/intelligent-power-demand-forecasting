import os
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
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
