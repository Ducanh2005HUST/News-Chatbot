// Trong Docker: nginx proxy /chat, /stats, /health, /stt về backend → dùng URL tương đối (empty).
// Trong dev local: Vite proxy cũng handle → vẫn dùng empty.
// Nếu muốn override (e.g., staging), set VITE_API_BASE trong .env
const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Send a chat question to the backend RAG pipeline.
 * @param {string} question
 * @param {{ sources?: string[], categories?: string[] }} filters
 * @param {boolean} [stream=false] - Enable streaming mode
 * @param {function} [onToken] - Callback for each token when streaming
 * @param {function} [onDone] - Callback when streaming completes
 * @returns {Promise<{ answer: string, sources: Array, intent: string }>} when not streaming
 */
export async function sendChatMessage(question, filters = {}, stream = false, onToken, onDone) {
    const url = `${API_BASE}/chat${stream ? '?stream=true' : ''}`;
    const response = await fetch(url, {
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

    if (stream && response.body && onToken && onDone) {
        // Handle streaming
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || ''; // keep incomplete line in buffer
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6).trim();
                        if (!jsonStr) continue;
                        try {
                            const data = JSON.parse(jsonStr);
                            if (data.token) {
                                onToken(data.token);
                            }
                            if (data.done) {
                                onDone(data.done);
                                return; // exit loop after done
                            }
                        } catch (e) {
                            console.warn('Failed to parse SSE data:', e, jsonStr);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
        return; // streaming handled via callbacks
    }

    // Non-streaming: return JSON
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
