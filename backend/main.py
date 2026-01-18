import os
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv
from pypdf import PdfReader
import io
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import uuid
import json
import asyncio

# Load environment variables
load_dotenv()

app = FastAPI(title="Mock Interview Simulator", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all. Restrict in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")

print("----------------------------------------------------------------")
if not GEMINI_API_KEY:
    print("CRITICAL ERROR: GEMINI_API_KEY is missing from environment!")
else:
    print(f"Server starting with API Key: {GEMINI_API_KEY[:4]}...******")

# --- DATABASE ABSTRACTION (MongoDB with JSON Fallback) ---
# --- DATABASE ABSTRACTION (MongoDB with JSON Fallback) ---
import tempfile

class JSONStorage:
    def __init__(self, filename="chat_history.json"):
        # On Vercel/Lambda, root is read-only. Use /tmp if needed.
        self.filename = filename
        self.is_writable = True
        
        try:
            if not os.path.exists(filename):
                with open(filename, 'w') as f:
                    json.dump([], f)
        except OSError:
            # Fallback to temp directory
            print(f"Warning: Could not write to {filename}. Using temp directory.")
            self.filename = os.path.join(tempfile.gettempdir(), "chat_history.json")
            try:
                if not os.path.exists(self.filename):
                    with open(self.filename, 'w') as f:
                        json.dump([], f)
            except Exception as e:
                print(f"Critical: Could not write to temp storage either: {e}")
                self.is_writable = False

    def _load(self):
        if not self.is_writable: return []
        try:
            with open(self.filename, 'r') as f:
                return json.load(f)
        except:
            return []

    def _save(self, data):
        if not self.is_writable: return
        try:
            with open(self.filename, 'w') as f:
                json.dump(data, f, default=str, indent=2)
        except Exception as e:
            print(f"Error saving to JSON: {e}")

    async def insert_one(self, document):
        data = self._load()
        document["_id"] = str(uuid.uuid4())
        data.append(document)
        self._save(data)
    
    async def find_session(self, session_id):
        data = self._load()
        # Sort by timestamp (assuming timestamp string iso format or similar logic)
        return [d for d in data if d.get("session_id") == session_id]

# Initialize Database
db = None
use_mongo = False

try:
    client = AsyncIOMotorClient(MONGODB_URL, serverSelectionTimeoutMS=2000)
    db = client.interview_simulator
    # Force a connection check
    # client.server_info() # Synchronous call not allowed here, but motor connects lazily
    print(f"Attempting to connect to MongoDB at {MONGODB_URL}...")
    use_mongo = True
except Exception as e:
    print(f"MongoDB connection failed clearly: {e}")

# Global variable for Storage wrapper
json_db = JSONStorage()

print("----------------------------------------------------------------")

# Global variables
RESUME_CONTEXT = ""
CURRENT_SESSION_ID = str(uuid.uuid4())

class ChatRequest(BaseModel):
    message: str

@app.get("/api")
def read_root():
    return {"message": "Mock Interview Simulator API is running"}

@app.post("/api/upload")
async def upload_resume(file: UploadFile = File(...)):
    global RESUME_CONTEXT, CURRENT_SESSION_ID
    CURRENT_SESSION_ID = str(uuid.uuid4()) 
    
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    try:
        content = await file.read()
        pdf_reader = PdfReader(io.BytesIO(content))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text()
        
        RESUME_CONTEXT = (
            "You are an expert technical interviewer named 'Alex'. "
            "You are interviewing a candidate based on their resume:\n\n"
            f"{text[:5000]}\n\n"
            "**Guidelines:**\n"
            "1. **Be Conversational**: Do NOT be robotically formal. Speak like a lead engineer chatting with a colleague.\n"
            "2. **Dynamic Intro**: Do NOT always say 'Hello I am your interviewer'. Instead, vary it. E.g., 'Hey there, I have your resume here, let's dive in', or 'Hi! Impressive work on [ProjectName], tell me more'.\n"
            "3. **Follow Up**: If the candidate gives a short answer, dig deeper. 'Why did you choose that stack?'\n"
            "4. **Strict but Friendly**: Assess skills thoroughly but keep the tone encouraging.\n"
            "Start the conversation now by picking ONE specific interesting detail from their resume and asking about it directly."
        )
        
        return {"message": "Resume processed successfully", "context_length": len(RESUME_CONTEXT)}
    except Exception as e:
        print(f"Error processing PDF: {e}")
        raise HTTPException(status_code=500, detail="Failed to process PDF")

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    if not GEMINI_API_KEY:
         raise HTTPException(status_code=500, detail="Gemini API Key not configured")
    
    try:
        # Save User Message
        msg_doc = {
            "session_id": CURRENT_SESSION_ID,
            "role": "user",
            "content": request.message,
            "timestamp": datetime.now()
        }
        
        # Try Mongo, fallback to JSON
        try:
            await db.chats.insert_one(msg_doc)
        except:
            await json_db.insert_one(msg_doc)

        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-flash-latest')
        
        prompt = request.message
        if RESUME_CONTEXT:
            prompt = f"System Instruction: {RESUME_CONTEXT}\n\nUser: {request.message}"
            
        response = model.generate_content(prompt)
        bot_reply = response.text

        # Save Bot Message
        reply_doc = {
            "session_id": CURRENT_SESSION_ID,
            "role": "assistant",
            "content": bot_reply,
            "timestamp": datetime.now()
        }
        
        try:
            await db.chats.insert_one(reply_doc)
        except:
            await json_db.insert_one(reply_doc)

        return {"response": bot_reply}
    except Exception as e:
        print(f"Error during Gemini API call: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/end_interview")
async def end_interview():
    try:
        history = []
        try:
            cursor = db.chats.find({"session_id": CURRENT_SESSION_ID}).sort("timestamp", 1)
            history = await cursor.to_list(length=100)
        except:
            print("MongoDB unavailable, using JSON history.")
            history = await json_db.find_session(CURRENT_SESSION_ID)
        
        if not history:
            return {"error": "No chat history found for this session"}
        
        transcript = "\n".join([f"{msg['role'].upper()}: {msg['content']}" for msg in history])
        
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-flash-latest')
        
        analysis_prompt = (
            "Analyze the following technical interview transcript.\n"
            "Provide a performance report in strictly VALID JSON format (no markdown formatting).\n"
            "The JSON must have these keys: 'technical_score' (1-10), 'communication_score' (1-10), "
            "'problem_solving_score' (1-10), 'feedback' (string), 'strengths' (list of strings), 'weaknesses' (list of strings).\n\n"
            f"Transcript:\n{transcript}"
        )
        
        response = model.generate_content(analysis_prompt)
        cleaned_response = response.text.replace("```json", "").replace("```", "").strip()
        
        return {"report": cleaned_response}
    except Exception as e:
         print(f"Error generating report: {e}")
         raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
