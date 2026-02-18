FROM python:3.11-slim

WORKDIR /app

# Install system deps for torch and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Try installing ezkl (may fail on some architectures)
RUN pip install ezkl || echo "EZKL not available, using simulated mode"

COPY . .

# Model artifacts are mounted via docker-compose volumes at /app/model
# No COPY needed for zkml/ files

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
