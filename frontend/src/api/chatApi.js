// Trong Docker: nginx proxy /chat, /stats, /health, /stt về backend → dùng URL tương đối (empty).
// Trong dev local: Vite proxy cũng handle → vẫn dùng empty.
// Nếu muốn override (e.g., staging), set VITE_API_BASE trong .env
const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Send a chat question to the backend RAG pipeline.
 * @param {string} question
 * @param {{ sources?: string[], categories?: string[] }} filters
 * @returns {Promise<{ answer: string, sources: Array, intent: string }>}
 */
export async function sendChatMessage(question, filters = {}) {
    const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question,
            filters: {
                sources: filters.sources || [],
                categories: filters.categories || [],
            },
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
            errorData.detail || `Server error (${response.status})`
        );
    }

    return response.json();
}

/**
 * Fetch crawl / vector store statistics.
 * @returns {Promise<{ total_articles: number, total_chunks: number, last_crawled_at: string|null, sources_breakdown: object, categories_breakdown: object }>}
 */
export async function fetchStats() {
    const response = await fetch(`${API_BASE}/stats`);

    if (!response.ok) {
        throw new Error(`Failed to fetch stats (${response.status})`);
    }

    return response.json();
}

/**
 * Gửi file audio lên backend để chạy STT local (faster-whisper).
 * @param {Blob} audioBlob  – Audio blob từ MediaRecorder (WebM/WAV)
 * @returns {Promise<string>} – Text đã nhận dạng
 */
export async function transcribeAudio(audioBlob) {
    const formData = new FormData();
    // Backend FastAPI nhận field tên "file"
    // Gửi với extension .webm – MediaRecorder mặc định xuất audio/webm.
    // Backend sẽ tự detect magic bytes nếu cần, nhưng đặt tên đúng giúp Whisper API hint codec.
    formData.append('file', audioBlob, 'recording.webm');

    const response = await fetch(`${API_BASE}/stt`, {
        method: 'POST',
        body: formData,
        // KHÔNG set Content-Type header – trình duyệt tự set boundary cho multipart
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `STT error (${response.status})`);
    }

    const data = await response.json();
    return data.text || '';
}
