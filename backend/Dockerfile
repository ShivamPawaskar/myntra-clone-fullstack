FROM python:3.12-slim

WORKDIR /app

# System deps for psycopg2 / building wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# The API process. The worker + scheduler run as separate commands
# (see docker-compose.yml) sharing this same image.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
