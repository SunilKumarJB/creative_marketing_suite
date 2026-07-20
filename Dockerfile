# ==========================================
# Stage 1: Build the React static frontend
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ==========================================
# Stage 2: Build the FastAPI python runner
# ==========================================
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy FastAPI backend code
COPY backend.py .

# Copy built React frontend assets from Stage 1
COPY --from=frontend-builder /app/dist ./dist

# Expose port 8080 (standard for Cloud Run)
EXPOSE 8080
ENV PORT=8080

# Run Uvicorn server
CMD ["uvicorn", "backend:app", "--host", "0.0.0.0", "--port", "8080"]
