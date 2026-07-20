from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import logging
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception
from google.genai.errors import APIError
from pydantic import BaseModel, Field
from typing import List, Optional
import base64
import io
import json
from PIL import Image, ImageDraw
from google import genai
from google.genai import types

app = FastAPI(title="Cymbal Creative Marketing Assistant API")

# Enable CORS for local Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Google GenAI client
# Resolves project ID dynamically from environment, fallback to SAMPLE_PROJECT_ID for local dev
project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "SAMPLE_PROJECT_ID")
client = genai.Client(vertexai=True, project=project_id, location="global")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Check if exception is resource exhaustion / 429 error
def is_rate_limit_error(exception):
    if isinstance(exception, APIError) and hasattr(exception, 'code') and exception.code == 429:
        logger.warning("Rate limit hit (429). Retrying with backoff...")
        return True
    if "429" in str(exception) or "RESOURCE_EXHAUSTED" in str(exception):
        logger.warning("Resource exhausted (429). Retrying with backoff...")
        return True
    return False

# Exponential backoff wrapper around gemini api calls
@retry(
    retry=retry_if_exception(is_rate_limit_error),
    wait=wait_exponential(multiplier=2, min=2, max=12),
    stop=stop_after_attempt(5),
    reraise=True
)
def generate_content_with_retry(model, contents, config=None):
    return client.models.generate_content(
        model=model,
        contents=contents,
        config=config
    )


# Helper function to generate default Cymbal logo
def get_default_logo():
    img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Draw a beautiful gold insignia (double concentric circles and letter C style symbol)
    draw.ellipse([60, 60, 452, 452], outline=(212, 175, 55, 255), width=24)
    draw.arc([120, 120, 392, 392], start=45, end=315, fill=(212, 175, 55, 255), width=20)
    # Save to base64
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('utf-8')

# Input parameters structure from the UI
class GeneratePromptsRequest(BaseModel):
    Channel: str
    channel_guidelines: List[str] = []
    Dimensions: str
    Category: str
    Campaign_Theme: str
    Product_Description: str = Field(alias="Product Description")
    Offers: str
    Emotion: str
    Festival_Theme: str
    Reference_Style: Optional[str] = None
    Logo_Image_Details: str
    Headline_Text_Source: str = Field(alias="Headline Text Source")
    Language: str = "English"
    reference_image: Optional[str] = None

    class Config:
        populate_by_name = True

# Structured output Pydantic schemas for Gemini
class TextMessage(BaseModel):
    title: str = Field(description="Headline or title of the ad copy")
    img_overlay_text: Optional[str] = Field(None, description="Short text overlay to be placed on the image, or empty/null if no text is present in the reference layout")
    description: str = Field(description="Body description of the ad copy")

class MarketingMessage(BaseModel):
    text_message: TextMessage

class BaseImagePrompt(BaseModel):
    prompt_text: str = Field(description="A detailed, narrative prompt to generate the product/lifestyle base image. It must focus entirely on the subject, composition, background environment, lighting, materials, and stylistic details from the Reference_Style, ensuring it has NO logos, product labels, or text overlays.")
    recommended_aspect_ratio: str = Field(description="Recommended aspect ratio from: 1:1, 9:16, 16:9, 4:3, 3:4")

class EditPrompt(BaseModel):
    prompt_text: str = Field(description="A precise, step-by-step instruction prompt to overlay [Logo] onto [Image1] exactly as per the logo placement in the Reference Style, and render the generated In_Image_Text (if present). Outlines placement, font style, color, weight, and size.")

class GeneratePromptsResponse(BaseModel):
    marketing_message: MarketingMessage
    base_image_generation_prompt: BaseImagePrompt
    nano_banana_edit_prompt: EditPrompt
    aspect_ratio: str = Field(description="Aspect ratio based on the final Dimensions (e.g. 16:9 or 1:1)")
    outpainting_prompt: str = Field(description="Prompt to fill or extend the image background for seamless text overlay, preserving the original style")

@app.post("/api/generate-prompts", response_model=GeneratePromptsResponse)
def generate_prompts(req: GeneratePromptsRequest):
    system_instruction = (
        "You are a creative marketing assistant for the 'Fashion, retail and electronic' brand, "
        "skilled in crafting compelling ad copy and generating detailed image prompts. You are an expert "
        "at adapting to different visual styles based on reference samples, and specializing in writing "
        "precise, semantic layout instructions for Google's Nano Banana Pro image generation and editing "
        "models to flawlessly integrate brand assets, logo placements, and multi-language typography "
        "into final creatives. Ensure all text message fields, base image prompt, and Nano Banana edit prompt "
        "are fully aligned in tone, style, and messaging."
    )

    contents = []
    
    prompt = f"""
Based on the following input parameters:
- Channel: {req.Channel}
- Channel Guidelines: {", ".join(req.channel_guidelines)}
- Dimensions: {req.Dimensions}
- Category: {req.Category}
- Campaign Theme: {req.Campaign_Theme}
- Product Description: {req.Product_Description}
- Offers: {req.Offers}
- Emotion: {req.Emotion}
- Festival Theme: {req.Festival_Theme}
- Logo Image Details: {req.Logo_Image_Details}
- Headline Text Source option: {req.Headline_Text_Source}
- Target Language: {req.Language}
"""

    if req.reference_image:
        ref_image_bytes = base64.b64decode(req.reference_image)
        contents.append(types.Part(text="Here is the reference style/layout image [ReferenceImage] to adapt the visual style, background, logo placement, and typography from:"))
        contents.append(types.Part(inline_data=types.Blob(data=ref_image_bytes, mime_type="image/png")))
        prompt += """
CRITICAL MULTIMODAL GUIDELINES:
1. Analyze [ReferenceImage] layout, lighting, color palette, and background.
2. Subject Centering: The generated base image prompt must explicitly instruct the model to place the primary product/subject horizontally and vertically centered in the composition for a balanced catalog/ad layout.
3. The generated base image prompt must instruct the model to produce a product/lifestyle visual matching the style, background, composition, and lighting of [ReferenceImage] (e.g. if [ReferenceImage] has an isolated plain background, do that; if it has a specific setting, describe it).
4. Background Composition & Theme Flavor: In the generated base image prompt, if the background is plain or solid, keep it minimal but **add extremely subtle, soft, out-of-focus background atmospheric elements or lighting filters that reflect the Campaign Theme and Festival Theme** (e.g., a warm sunbeam or tropical leaf silhouette shadow overlay for Summer; a cozy firelight glow or faint holiday sparkle bokeh for Winter/Diwali). Ensure these details are extremely subtle, out of focus, and do not compete with the product.
5. The logo placement in the edit prompt must be positioned exactly as it is placed in [ReferenceImage] (e.g. if the logo is in the top-right corner of [ReferenceImage], place it in the top-right corner in the editing instructions).
6. Headline Text Generation based on Headline Text Source & Target Language:
   - If Headline Text Source is 'GENERATE_NEW': You must generate a brand new, highly creative and engaging marketing tagline/headline that reflects the Campaign Theme and Festival Theme. If Target Language is not 'English', generate the tagline directly in the chosen language script (e.g. Devanagari script for Hindi, Tamil script for Tamil, Telugu script for Telugu, etc.). Return it as `img_overlay_text`, and instruct the edit prompt to render this exact localized text following the coordinates, styling, and typography of [ReferenceImage]. Do NOT just copy raw offers strings or copy exact text from [ReferenceImage].
   - If Headline Text Source is 'USE_REFERENCE': You must extract the exact text visible in [ReferenceImage]'s layout, translate it to the Target Language script if needed (or keep it in the script of [ReferenceImage]), return it as `img_overlay_text`, and instruct the edit prompt to render it exactly at its place matching [ReferenceImage].
   - If Headline Text Source is 'NONE': Set `img_overlay_text` to empty or null, and the edit prompt must not instruct the model to render any text (it should ONLY overlay the brand logo).
7. Legal Line Overlay: The editing prompt (Nano Banana Edit Prompt) must always instruct the model to render a small, clean legal disclaimer line reading exactly '*T&Cs apply' in a tiny, subtle but legible font at the very bottom margin or footer (e.g., bottom-right or bottom-center) of the final image.
8. Focus on the Specific Subject (Especially for Food): The base image generation prompt must strictly focus on the specific item/dish described in the Product Description and Campaign Theme. Do NOT add other complementary side dishes, side drinks, condiments, table spreads, or accessory foods in the base image prompt unless they are explicitly requested in the inputs. E.g., if the product is a Burger, only prompt for the burger itself on the plate/backdrop, with no fries or cola unless mentioned.
9. Logo and Image References: In the generated `nano_banana_edit_prompt` (EditPrompt), always refer to the logo image using the placeholder `[Logo]` (e.g. 'overlay the brand logo [Logo] at the top center...') and refer to the base image as `[Image1]`. Do NOT refer to it by specific name (e.g. do not say 'overlay the logo' or 'overlay the Cymbal Fashion logo'), as this prevents the image editing model from correctly binding the user's custom uploaded logo.
"""
    else:
        # Fallback to text description
        prompt += f"- Reference Style Description: {req.Reference_Style}\n"
        prompt += """
CRITICAL GUIDELINES:
1. Logo Placement: The logo placement should be determined solely based on the Reference Style and description provided (e.g. if the reference description mentions a logo in the top-right corner, position the logo there. If not specified, determine a clean, standard placement suited to the reference layout).
2. Subject Centering: The generated base image prompt must explicitly instruct the model to place the primary product/subject horizontally and vertically centered in the composition for a balanced catalog/ad layout.
3. Headline Text Generation based on Headline Text Source & Target Language:
   - If Headline Text Source is 'GENERATE_NEW': Generate a brand new, highly creative and engaging marketing tagline/headline that reflects the Campaign Theme and Festival Theme. If Target Language is not 'English', generate the tagline directly in the chosen language script (e.g. Devanagari script for Hindi, Tamil script for Tamil, Telugu script for Telugu, etc.). Return it as `img_overlay_text`, and instruct the edit prompt to render it following the styling and layout of the Reference Style. Do NOT just copy raw offers strings or copy the exact text from the Reference Style.
   - If Headline Text Source is 'USE_REFERENCE': Extract the exact text mentioned in the Reference Style description, translate it to the Target Language script if needed, return it as `img_overlay_text`, and instruct the edit prompt to render it exactly as described.
   - If Headline Text Source is 'NONE': Set `img_overlay_text` to empty or null, and do not instruct the model to render any text (only overlay the logo).
4. Background Composition & Theme Flavor: The generated base image must be designed on a plain backdrop OR exactly following the background specified in the Reference Style. **Add extremely subtle, soft, out-of-focus background atmospheric elements or lighting filters that reflect the Campaign Theme and Festival Theme** (e.g., a warm sunbeam or tropical leaf silhouette shadow overlay for Summer; a cozy firelight glow or faint holiday sparkle bokeh for Winter/Diwali). Ensure these details are extremely subtle, out of focus, and do not compete with the product.
5. The editing prompt (Nano Banana Edit Prompt) must describe how to overlay the logo and render the generated headline text (if any) such that the final composition, typography style, layout, weight, margins, and position closely mimic the structure of a premium advertising banner from the reference template.
6. Legal Line Overlay: The editing prompt (Nano Banana Edit Prompt) must always instruct the model to render a small, clean legal disclaimer line reading exactly '*T&Cs apply' in a tiny, subtle but legible font at the very bottom margin or footer (e.g., bottom-right or bottom-center) of the final image.
7. Focus on the Specific Subject (Especially for Food): The base image generation prompt must strictly focus on the specific item/dish described in the Product Description and Campaign Theme. Do NOT add other complementary side dishes, side drinks, condiments, table spreads, or accessory foods in the base image prompt unless they are explicitly requested in the inputs. E.g., if the product is a Burger, only prompt for the burger itself on the plate/backdrop, with no fries or cola unless mentioned.
8. Logo and Image References: In the generated `nano_banana_edit_prompt` (EditPrompt), always refer to the logo image using the placeholder `[Logo]` (e.g. 'overlay the brand logo [Logo] at the top center...') and refer to the base image as `[Image1]`. Do NOT refer to it by specific name (e.g. do not say 'overlay the logo' or 'overlay the Cymbal Fashion logo'), as this prevents the image editing model from correctly binding the user's custom uploaded logo.
"""

    prompt += "\nGenerate the marketing copy and precise prompts matching the output schema."
    contents.append(types.Part(text=prompt))

    try:
        response = generate_content_with_retry(
            model="gemini-3.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=GeneratePromptsResponse,
                temperature=0.7,
            )
        )
        return JSONResponse(
            content=json.loads(response.text),
            headers={"Content-Type": "application/json; charset=utf-8"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate prompts: {str(e)}")

class GenerateBaseImageRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "1:1"
    resolution: str = "1K"

class ImageResponse(BaseModel):
    image_base64: str

@app.post("/api/generate-base-image", response_model=ImageResponse)
def generate_base_image(req: GenerateBaseImageRequest):
    try:
        # Use gemini-3-pro-image via generate_content
        # Ensure aspect ratio prompt instruction or formatting if needed, but since gemini-3-pro-image is a generative content model,
        # we can prompt it directly.
        prompt = f"Generate a beautiful image with no text, no letters, and no logos: {req.prompt}. Aspect ratio should be {req.aspect_ratio}, with output resolution quality matching {req.resolution}."
        
        response = generate_content_with_retry(
            model="gemini-3-pro-image",
            contents=prompt
        )
        
        # Look for inline image in candidates
        img_bytes = None
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                img_bytes = part.inline_data.data
                break
                
        if not img_bytes:
            raise HTTPException(status_code=500, detail="Model did not return any image data.")
            
        base64_img = base64.b64encode(img_bytes).decode('utf-8')
        return ImageResponse(image_base64=base64_img)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate base image: {str(e)}")

class EditImageRequest(BaseModel):
    base_image: str  # base64 encoded
    logo_image: Optional[str] = None  # base64 encoded (optional, falls back to Cymbal logo)
    reference_image: Optional[str] = None  # base64 encoded (optional, visual layout reference)
    edit_prompt: str
    aspect_ratio: Optional[str] = "1:1"

@app.post("/api/edit-image", response_model=ImageResponse)
def edit_image(req: EditImageRequest):
    try:
        base_img_bytes = base64.b64decode(req.base_image)
        
        # Use user-provided logo or generate default one
        logo_b64 = req.logo_image if req.logo_image else get_default_logo()
        logo_bytes = base64.b64decode(logo_b64)
        
        # Construct multimodal inputs for editing using gemini-3-pro-image
        instruction = (
            f"You are a professional graphic designer and image editing model. "
            f"Your task is to take the base image [Image1] and perform a clean overlay edit. "
            f"CRITICAL CONSTRAINT: You must preserve [Image1] exactly. The subject, products, layout, placement, background, colors, "
            f"shadows, lighting, and details of [Image1] must remain 100% identical and unchanged in the output. "
            f"Do NOT regenerate, modify, move, or alter the base image [Image1] in any way. "
            f"You must ONLY overlay the brand logo [Logo] and render the requested typography text over [Image1]. "
            f"The output image aspect ratio MUST be exactly {req.aspect_ratio}."
        )
        
        contents = [
            types.Part(text=instruction),
            types.Part(text="Here is the base image [Image1]:"),
            types.Part(inline_data=types.Blob(data=base_img_bytes, mime_type="image/png")),
            types.Part(text="Here is the brand logo [Logo] to overlay:"),
            types.Part(inline_data=types.Blob(data=logo_bytes, mime_type="image/png"))
        ]
        
        if req.reference_image:
            ref_bytes = base64.b64decode(req.reference_image)
            contents.insert(0, types.Part(text=(
                "You must match the layout, margins, logo alignment, font styles, colors, and typography details of [ReferenceImage] "
                "when placing the logo and text on top of [Image1]. Treat [ReferenceImage] purely as a design template guide. "
                "Do NOT copy any text, background, or brand logo from [ReferenceImage] directly into the output. "
                "Only overlay the brand logo [Logo] and render the new generated text on top of the original [Image1] in the exact "
                "positions defined by the template layout."
            )))
            contents.append(types.Part(text="Here is the layout reference image [ReferenceImage]:"))
            contents.append(types.Part(inline_data=types.Blob(data=ref_bytes, mime_type="image/png")))
            
        contents.append(types.Part(text=f"Please apply the following edit and layout prompt precisely on [Image1] incorporating [Logo]:\n{req.edit_prompt}"))
        
        response = generate_content_with_retry(
            model="gemini-3-pro-image",
            contents=contents
        )
        
        img_bytes = None
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                img_bytes = part.inline_data.data
                break
                
        if not img_bytes:
            raise HTTPException(status_code=500, detail="Model did not return any edited image data.")
            
        base64_img = base64.b64encode(img_bytes).decode('utf-8')
        return ImageResponse(image_base64=base64_img)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to edit image: {str(e)}")

# Get default logo endpoint (utility)
@app.get("/api/default-logo")
def get_logo():
    return {"logo_base64": get_default_logo()}

class MultimodalLayoutEditRequest(BaseModel):
    reference_creative: str  # base64 encoded
    logo_image: Optional[str] = None  # base64 encoded (optional)
    edit_instruction: str
    aspect_ratio: str = "1:1"

@app.post("/api/multimodal-layout-edit", response_model=ImageResponse)
def multimodal_layout_edit(req: MultimodalLayoutEditRequest):
    try:
        ref_creative_bytes = base64.b64decode(req.reference_creative)
        
        # Use user logo or default Cymbal logo
        logo_b64 = req.logo_image if req.logo_image else get_default_logo()
        logo_bytes = base64.b64decode(logo_b64)
        
        contents = [
            types.Part(text=f"You are a professional graphic designer and layout composition model. Edit the uploaded reference creative [ReferenceCreative] by incorporating the brand logo [Logo] and applying the edit instructions. Ensure the output image preserves the overall layout structure, margins, font sizes, visual hierarchy, and brand positioning of [ReferenceCreative] while applying the visual/text updates. The output image aspect ratio MUST be exactly {req.aspect_ratio}."),
            types.Part(text="Here is the reference creative [ReferenceCreative]:"),
            types.Part(inline_data=types.Blob(data=ref_creative_bytes, mime_type="image/png")),
            types.Part(text="Here is the brand logo [Logo] to overlay/integrate:"),
            types.Part(inline_data=types.Blob(data=logo_bytes, mime_type="image/png")),
            types.Part(text=f"Please apply the following layout/content modifications precisely:\n{req.edit_instruction}")
        ]
        
        response = generate_content_with_retry(
            model="gemini-3-pro-image",
            contents=contents
        )
        
        img_bytes = None
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                img_bytes = part.inline_data.data
                break
                
        if not img_bytes:
            raise HTTPException(status_code=500, detail="Model did not return any layout edited image data.")
            
        base64_img = base64.b64encode(img_bytes).decode('utf-8')
        return ImageResponse(image_base64=base64_img)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to perform layout edit: {str(e)}")

# LLM as Judge validation schemas
class JudgeValidationResult(BaseModel):
    score: int = Field(description="Score out of 10 (integer between 0 and 10)")
    text_style_and_logo_placement: str = Field(description="Detailed evaluation of text style and logo placement alignment with reference image")
    offer_callout_check: str = Field(description="Evaluation of whether offer callout is rendered exactly as entered, with no paraphrasing")
    typo_check: str = Field(description="Evaluation checking for typos in the final image")
    legal_line_check: str = Field(description="Evaluation of whether legal line '*T&Cs apply' is present in the footer")
    product_dominance_check: str = Field(description="Evaluation of whether product is the dominant visual and not buried under copy")
    overall_reasoning: str = Field(description="Detailed overall summary and explanation of the evaluation and score")

class JudgeValidationRequest(BaseModel):
    reference_image: Optional[str] = None  # base64 encoded (optional)
    edited_image: str  # base64 encoded (required)
    edit_prompt: str  # text edit prompt used
    offer_callout: Optional[str] = None  # the target offer callout text (optional)

@app.post("/api/validate-creative", response_model=JudgeValidationResult)
def validate_creative(req: JudgeValidationRequest):
    try:
        edited_bytes = base64.b64decode(req.edited_image)
        
        system_instruction = (
            "You are an expert advertising quality assurance auditor and graphic design critic. "
            "Your job is to objectively critique the final edited advertisement [FinalCreative] against the design template [ReferenceCreative] "
            "and verify the text content rules."
        )
        
        contents = [
            types.Part(text="Here is the final edited advertisement creative [FinalCreative]:"),
            types.Part(inline_data=types.Blob(data=edited_bytes, mime_type="image/png")),
        ]
        
        if req.reference_image:
            ref_bytes = base64.b64decode(req.reference_image)
            contents.append(types.Part(text="Here is the layout reference design template [ReferenceCreative]:"))
            contents.append(types.Part(inline_data=types.Blob(data=ref_bytes, mime_type="image/png")))
            
        offer_check_instruction = (
            f"Check if the specific offer callout \"{req.offer_callout}\" is rendered exactly as entered on [FinalCreative], with no paraphrasing, translations, or modifications."
            if req.offer_callout else
            "Evaluate if all elements and visual content updates requested in the instructions [EditPrompt] are executed cleanly with correct contextual placement, high-contrast legibility, and premium alignment."
        )
            
        prompt = f"""
Please perform a rigorous quality check of the generated final creative [FinalCreative] using the reference template [ReferenceCreative] (if provided) and the edit prompt [EditPrompt] as sources of truth.

Verify the following check items:
1. Text style & logo placement: Compare [FinalCreative] with [ReferenceCreative] (if present). Verify if the text styling, margins, logo alignment, colors, and layout structure match the template style.
2. Offer callout/Content check: {offer_check_instruction}
3. Typo Check: Read all text visible in [FinalCreative] and verify there are no spelling mistakes, broken characters, garbled unicode glyphs, or formatting typos.
4. Legal Line: Verify that a small, legible legal disclaimer reading exactly '*T&Cs apply' is present in the footer area (bottom margin) of [FinalCreative].
5. Product Dominance: Ensure the primary product/subject is clearly the dominant visual element in the frame and is not covered, obscured, or buried under the text layers.

The [EditPrompt] used to compose [FinalCreative] was:
"{req.edit_prompt}"

Provide an integer score out of 10 (where 10 means perfect execution, and points are deducted for any failures in the checks above) and write detailed reasoning for each item.
"""
        contents.append(types.Part(text=prompt))
        
        response = generate_content_with_retry(
            model="gemini-3.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=JudgeValidationResult,
                temperature=0.2,  # Low temperature for highly objective evaluation
            )
        )
        
        return JSONResponse(
            content=json.loads(response.text),
            headers={"Content-Type": "application/json; charset=utf-8"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to validate creative: {str(e)}")

# Mount static files from 'dist' directory as fallback for frontend static assets
if os.path.exists("dist"):
    app.mount("/", StaticFiles(directory="dist", html=True), name="static")
