# Use an official, lightweight Python base image
FROM python:3.9-slim

# Set environment variables to optimize Python container behavior
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set the working directory in the container
WORKDIR /app

# Copy the backend requirements file first to leverage Docker layer caching
COPY backend/requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend directory contents
COPY backend/ /app/backend/

# Set working directory to the backend folder where app.py resides
WORKDIR /app/backend

# Expose port 8000 for the FastAPI application
EXPOSE 8000

# Start the application using uvicorn, binding to all network interfaces
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
