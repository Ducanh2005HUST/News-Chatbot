# Vietnamese News RAG Chatbot

Chatbot hỏi đáp tin tức tiếng Việt sử dụng RAG (Retrieval-Augmented Generation). Hỗ trợ trả lời câu hỏi dựa trên tin tức được thu thập tự động từ 3 nguồn báo: **VnExpress**, **Tuổi Trẻ**, và **Thanh Niên**.

---

## Tech Stack

- **Frontend:** React + TailwindCSS (Vite)
- **Backend:** FastAPI (Python)
  - **Vector DB:** FAISS (semantic search)
  - **Embedding:** OpenAI `text-embedding-3-small`
  - **LLM:** `gpt-4o-mini` (fallback: Claude Haiku)
  - **Crawler:** RSS feeds (tự động mỗi 60 phút)
  - **Scheduler:** APScheduler
- **Deployment:** Docker + docker-compose

---

## Quick Start (Recommended)

```bash
# Clone & cd vào project
cd Chatbot-KHDL

# Deploy với Docker (tất cả dependencies được tự động cài)
docker-compose up --build

# Truy cập:
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:8000
# - API Docs: http://localhost:8000/docs
```

---

## API Endpoints

| Method | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `POST` | `/chat` | Gửi câu hỏi, nhận câu trả lời và nguồn trích dẫn |
| `GET` | `/stats` | Thống kê số bài báo/chunk trong database |
| `GET` | `/health` | Health check |
| `POST` | `/stt` | Speech-to-text (Whisper API) |

---

## Nguồn dữ liệu

| Chủ đề | VnExpress | Tuổi Trẻ | Thanh Niên |
| :--- | :---: | :---: | :---: |
| Công nghệ | ✓ | ✓ | ✓ |
| Kinh tế | ✓ | ✓ | ✓ |
| Thể thao | ✓ | ✓ | ✓ |
| Thế giới | ✓ | ✓ | ✓ |

---

## Cấu hình Environment

Tạo file `backend/.env` từ `.env.example`:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...  # optional (fallback)
CRAWLER_INTERVAL_MINUTES=60
LOG_LEVEL=INFO
```

---

## Development (Local)

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend 
cd frontend
npm install
npm run dev
```