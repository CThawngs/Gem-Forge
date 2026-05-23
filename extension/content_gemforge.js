/**
 * Content Script for GemForge Web App
 * Intercepts clicks on the "Export to Gemini" button and saves the generated Gem configuration to local storage.
 */

document.addEventListener('click', (e) => {
  const exportBtn = e.target.closest('#convert-gemini-btn') || e.target.closest('a[href*="gemini.google.com/gems/create"]');
  
  if (exportBtn) {
    console.log('[GemForge Extension] Export clicked. Attempting to capture Gem data...');
    
    try {
      let payloadStr = exportBtn.getAttribute('data-payload');
      
      // If clicked a nested element or a link, look up by id
      if (!payloadStr) {
        const btn = document.getElementById('convert-gemini-btn');
        if (btn) {
          payloadStr = btn.getAttribute('data-payload');
        }
      }

      let payload = {};
      if (payloadStr) {
        payload = JSON.parse(payloadStr);
      } else {
        // Fallback: local storage (only works if page and extension share localStorage in some contexts, e.g., debug)
        const rawOutput = localStorage.getItem('gemforge_output');
        if (rawOutput) {
          payload = JSON.parse(rawOutput);
        } else {
          // Fallback: DOM Extraction strategy (if visible on screen)
          const activeContent = document.querySelector('.results-content')?.innerText || '';
          payload = {
            rawContent: activeContent,
            timestamp: Date.now()
          };
        }
      }

      chrome.storage.local.set({ pendingGemExport: payload }, () => {
        console.log('[GemForge Extension] Data saved to extension storage successfully:', payload);
      });
    } catch (err) {
      console.error('[GemForge Extension] Failed to capture Gem data:', err);
    }
  }
});
