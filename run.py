import uvicorn
from app.config import PORT

if __name__ == "__main__":
    # Bound to localhost on purpose: this app holds your Groq key and Gmail token.
    uvicorn.run("app.main:app", host="127.0.0.1", port=PORT, reload=False)
