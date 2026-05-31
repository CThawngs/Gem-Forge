export interface RevisionRequest {
  currentContent: string;
  activeTab: string;
  userPrompt: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  selectedText?: string;
}

export async function reviseWithOpenRouter(request: RevisionRequest): Promise<string> {
  try {
    const API_BASE_URL = import.meta.env.VITE_API_URL || '';
    const response = await fetch(`${API_BASE_URL}/api/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentContent: request.currentContent,
        activeTab: request.activeTab,
        userPrompt: request.userPrompt,
        chatHistory: request.chatHistory,
        selectedText: request.selectedText,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content || '';
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number })?.status;
    const msgLower = message.toLowerCase();
    const isNetwork = 
      msgLower.includes('failed to fetch') || 
      msgLower.includes('fetch') || 
      msgLower.includes('timeout') || 
      msgLower.includes('time out') || 
      msgLower.includes('504') || 
      msgLower.includes('gateway') || 
      msgLower.includes('aborted') || 
      msgLower.includes('abort') || 
      msgLower.includes('unreachable') || 
      msgLower.includes('network');

    if (isNetwork) {
      console.warn('Revise API network/timeout warning:', message);
    } else {
      console.error('Revise API error:', err);
    }

    // Handle rate limit error
    if (message.includes('429') || status === 429) {
      throw new Error(
        'API quota exceeded. Please wait a moment and try again. Rate limits apply to free tier usage.',
        { cause: err }
      );
    }

    throw new Error(
      message || 'Failed to revise content. Please try again.',
      { cause: err }
    );
  }
}
