#!/bin/bash
# ==============================================================================
# Cloud Run Deployment Script for Cymbal Creative Marketing Suite
# ==============================================================================
set -e

# Configuration
REGION="us-central1"
REPO_NAME="cymbal-creative-repo"
SERVICE_NAME="cymbal-creative-service"
IMAGE_NAME="cymbal-creative-app"

echo "=================================================="
echo "1. Checking active GCP Project..."
echo "=================================================="
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo "ERROR: No GCP project active. Please login and configure: gcloud auth login && gcloud config set project <PROJECT_ID>"
    exit 1
fi
echo "Active Project: $PROJECT_ID"

echo "=================================================="
echo "2. Enabling Required GCP Services..."
echo "=================================================="
gcloud services enable \
    artifactregistry.googleapis.com \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    aiplatform.googleapis.com

echo "=================================================="
echo "3. Creating Artifact Registry Repository (if not exists)..."
echo "=================================================="
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" &>/dev/null; then
    gcloud artifacts repositories create "$REPO_NAME" \
        --repository-format=docker \
        --location="$REGION" \
        --description="Repository for Cymbal Creative marketing application containers"
else
    echo "Repository '$REPO_NAME' already exists in $REGION. Skipping creation."
fi

echo "=================================================="
echo "4. Submitting Docker build to GCP Cloud Build..."
echo "=================================================="
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest"
gcloud builds submit --tag "$IMAGE_TAG" .

echo "=================================================="
echo "5. Deploying Container to Google Cloud Run..."
echo "=================================================="
gcloud run deploy "$SERVICE_NAME" \
    --image="$IMAGE_TAG" \
    --region="$REGION" \
    --platform=managed \
    --allow-unauthenticated \
    --port=8080 \
    --set-env-vars=GOOGLE_CLOUD_PROJECT="$PROJECT_ID"

echo "=================================================="
echo "Deployment Complete!"
echo "=================================================="
gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)'
