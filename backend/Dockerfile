# Dockerfile for FastAPI backend
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir -r requirements-dev.txt

# Copy source
COPY . .

# Create data directory
RUN mkdir -p faiss_data

# Expose port
EXPOSE 8000

# Run server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
