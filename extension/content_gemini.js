(function () {
  'use strict';

  console.log('[GemForge Extension] Loaded on Gemini page.');

  var isAutofilling = false;
  var lastUrl = '';
  var fallbackInMemoryData = null;

  // Visual status toast to inform user
  function showStatusToast(message, type) {
    try {
      var toast = document.getElementById('gemforge-status-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'gemforge-status-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.right = '24px';
        toast.style.padding = '12px 20px';
        toast.style.borderRadius = '10px';
        toast.style.zIndex = '999999';
        toast.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        toast.style.fontSize = '14px';
        toast.style.fontWeight = '600';
        toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '8px';
        toast.style.transition = 'all 0.3s ease';
        document.body.appendChild(toast);
      }
      
      toast.textContent = message;
      if (type === 'success') {
        toast.style.backgroundColor = '#10B981'; // vibrant green
        toast.style.color = '#FFFFFF';
      } else if (type === 'info') {
        toast.style.backgroundColor = '#3B82F6'; // vibrant blue
        toast.style.color = '#FFFFFF';
      } else {
        toast.style.backgroundColor = '#EF4444'; // red
        toast.style.color = '#FFFFFF';
      }
      
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
      
      setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(function() {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }, 4000);
    } catch (e) {
      console.error('[GemForge Extension] Failed to display status toast:', e);
    }
  }

  // Capture payload from URL hash or search parameter immediately
  function captureUrlData() {
    try {
      var hashStr = window.location.hash;
      var searchStr = window.location.search;
      var dataStr = null;

      if (hashStr && hashStr.indexOf('gemforge_data=') !== -1) {
        var match = hashStr.match(/gemforge_data=([^&]*)/);
        if (match && match[1]) {
          dataStr = match[1];
        }
      } else if (searchStr && searchStr.indexOf('gemforge_data=') !== -1) {
        var match = searchStr.match(/gemforge_data=([^&]*)/);
        if (match && match[1]) {
          dataStr = match[1];
        }
      }

      if (dataStr) {
        console.log('[GemForge Extension] Found gemforge_data in URL.');
        var decodedStr = decodeURIComponent(dataStr);
        var data = JSON.parse(decodedStr);
        if (data && (data.name || data.description || data.instructions)) {
          console.log('[GemForge Extension] Captured data from URL:', data);
          
          // Cache in memory immediately to prevent race conditions before chrome.storage.local write is flushed
          fallbackInMemoryData = data;

          chrome.storage.local.set({ pendingGemExport: data }, function() {
            console.log('[GemForge Extension] Saved URL data to chrome.storage.local.');
          });

          // Clean up URL parameters immediately to keep URL clean and prevent reprocessing on reload
          try {
            var cleanUrl = window.location.href.split('#')[0].split('?')[0];
            var newHash = hashStr.replace(/gemforge_data=[^&]*&?/, '').replace(/#$/, '');
            var newSearch = searchStr.replace(/gemforge_data=[^&]*&?/, '').replace(/\?$/, '');
            
            var finalUrl = cleanUrl;
            if (newSearch && newSearch !== '?') {
              finalUrl += newSearch;
            }
            if (newHash && newHash !== '#') {
              finalUrl += newHash;
            }
            window.history.replaceState(null, '', finalUrl);
          } catch (urlCleanupErr) {
            console.warn('[GemForge Extension] Failed to clean up URL:', urlCleanupErr);
          }
        }
      }
    } catch (e) {
      console.error('[GemForge Extension] Error capturing URL data:', e);
    }
  }

  // Run captureUrlData immediately at document_start
  captureUrlData();

  function checkUrlAndAutofill() {
    var url = window.location.href;
    if (url === lastUrl) {
      return; // URL hasn't changed, do nothing
    }
    
    lastUrl = url;

    // Check if we are on a create or edit page
    var isTargetPage = url.indexOf('/gems/create') !== -1 || 
                       url.indexOf('/gem/create') !== -1 || 
                       url.indexOf('/gems/edit') !== -1 || 
                       url.indexOf('/gem/edit') !== -1;

    if (!isTargetPage) {
      isAutofilling = false;
      return;
    }

    if (isAutofilling) {
      return; 
    }

    isAutofilling = true;

    chrome.storage.local.get(['pendingGemExport'], function (result) {
      var data = result.pendingGemExport || fallbackInMemoryData;

      if (!data) {
        isAutofilling = false;
        return;
      }

      // Clear the in-memory cache now that it is consumed
      fallbackInMemoryData = null;

      console.log('[GemForge Extension] Found pending export data:', data);
      showStatusToast('GemForge: Autofilling Gem configuration...', 'info');
      runAutofillSequence(data);
    });
  }

  // Poll the URL for SPA client-side route changes
  setInterval(checkUrlAndAutofill, 500);
  // Also run immediately on page load
  checkUrlAndAutofill();

  function runAutofillSequence(data) {
    var maxAttempts = 60; // 30 seconds total
    var attempts = 0;
    var firstFoundAttempt = 0;
    
    var poller = setInterval(function () {
      attempts++;

      var allFields = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), textarea, div[contenteditable="true"]'));
      
      // Filter out hidden/useless fields
      var visibleFields = allFields.filter(function(el) {
        var style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (el.tagName.toLowerCase() === 'input' && (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'checkbox' || el.type === 'radio')) return false;
        return true;
      });

      function getFieldText(el) {
        var texts = [];
        texts.push(el.getAttribute('aria-label') || '');
        texts.push(el.getAttribute('placeholder') || '');
        texts.push(el.getAttribute('id') || '');
        texts.push(el.getAttribute('name') || '');
        
        if (el.id) {
          var label = document.querySelector('label[for="' + el.id + '"]');
          if (label) texts.push(label.textContent || '');
        }

        var parent = el.parentElement;
        var depth = 0;
        while (parent && depth < 3) {
          var headings = parent.querySelectorAll('h1, h2, h3, h4, h5, label, legend, .heading, .title, .label');
          headings.forEach(function(h) {
            texts.push(h.textContent || '');
          });
          var prev = parent.previousElementSibling;
          if (prev) {
            texts.push(prev.textContent || '');
          }
          parent = parent.parentElement;
          depth++;
        }
        return texts.join(' ').toLowerCase();
      }

      var scoredFields = visibleFields.map(function(el) {
        var fullText = getFieldText(el);
        var tagName = el.tagName.toLowerCase();
        
        var nameScore = 0;
        var descScore = 0;
        var instScore = 0;

        // 1. Name Scoring
        if (fullText.includes('name') || fullText.includes('tên')) {
          nameScore += 10;
        }
        if (fullText.includes('title') || fullText.includes('tiêu đề')) {
          nameScore += 8;
        }
        if (fullText.includes('description') || fullText.includes('mô tả')) {
          nameScore -= 12;
        }
        if (fullText.includes('instruction') || fullText.includes('hướng dẫn') || fullText.includes('horticulturist') || fullText.includes('ví dụ:')) {
          nameScore -= 12;
        }
        if (tagName === 'input') {
          nameScore += 5;
        } else if (tagName === 'textarea') {
          nameScore -= 5;
        }

        // 2. Description Scoring
        if (fullText.includes('description') || fullText.includes('mô tả')) {
          descScore += 15;
        }
        if (fullText.includes('explain what it does') || fullText.includes('what does') || fullText.includes('what it does') || fullText.includes('mô tả về')) {
          descScore += 12;
        }
        if (fullText.includes('describe your gem') || fullText.includes('explain what it does') || fullText.includes('tính năng của gem')) {
          descScore += 20;
        }
        if (fullText.includes('example: you are') || fullText.includes('ví dụ: bạn là') || fullText.includes('you are a') || fullText.includes('bạn là')) {
          descScore -= 10;
        }

        // 3. Instructions Scoring
        if (fullText.includes('instruction') || fullText.includes('hướng dẫn') || fullText.includes('chỉ dẫn')) {
          instScore += 15;
        }
        if (fullText.includes('behave') || fullText.includes('how it should') || fullText.includes('hoạt động thế nào') || fullText.includes('hoạt động ra sao')) {
          instScore += 12;
        }
        if (fullText.includes('horticulturist') || fullText.includes('example: you are') || fullText.includes('ví dụ: bạn là') || fullText.includes('you are a') || fullText.includes('bạn là')) {
          instScore += 20;
        }
        if (tagName === 'textarea' || el.getAttribute('contenteditable') === 'true') {
          instScore += 5;
        } else if (tagName === 'input') {
          instScore -= 10;
        }

        return {
          element: el,
          nameScore: nameScore,
          descScore: descScore,
          instScore: instScore
        };
      });

      var nameInput = null;
      var descInput = null;
      var targetInput = null;

      // Assign targetInput (instructions) first based on score
      var instCandidates = scoredFields.slice().sort(function(a, b) { return b.instScore - a.instScore; });
      if (instCandidates.length > 0 && instCandidates[0].instScore > 0) {
        targetInput = instCandidates[0].element;
      }

      // Assign descInput based on score
      var descCandidates = scoredFields.filter(function(x) { return x.element !== targetInput; })
                                       .sort(function(a, b) { return b.descScore - a.descScore; });
      if (descCandidates.length > 0 && descCandidates[0].descScore > 0) {
        descInput = descCandidates[0].element;
      }

      // Assign nameInput based on score
      var nameCandidates = scoredFields.filter(function(x) { return x.element !== targetInput && x.element !== descInput; })
                                       .sort(function(a, b) { return b.nameScore - a.nameScore; });
      if (nameCandidates.length > 0 && nameCandidates[0].nameScore > 0) {
        nameInput = nameCandidates[0].element;
      }

      var hasName = !!nameInput;
      var hasDesc = !!descInput;
      var hasTarget = !!targetInput;

      var foundAllScored = hasName && hasDesc && hasTarget;
      var foundAnyScored = hasName || hasDesc || hasTarget;

      if (foundAnyScored && !firstFoundAttempt) {
        firstFoundAttempt = attempts;
        console.log('[GemForge Extension] First input field(s) detected. Starting countdown to ensure all fields are rendered...');
      }

      console.log('[GemForge Extension] Poller status - attempts:', attempts, 'firstFoundAttempt:', firstFoundAttempt, 'foundAllScored:', foundAllScored);

      // Determine if we should perform the injection now
      var shouldInject = false;
      if (foundAllScored) {
        shouldInject = true;
        console.log('[GemForge Extension] All 3 target fields detected via scoring. Injecting immediately.');
      } else if (firstFoundAttempt && (attempts - firstFoundAttempt >= 6)) {
        shouldInject = true;
        console.log('[GemForge Extension] Countdown reached (3 seconds since first detection). Proceeding with fallback/available fields.');
      } else if (attempts >= maxAttempts) {
        shouldInject = true;
        console.log('[GemForge Extension] Poller reached max attempts. Proceeding with fallback/available fields.');
      }

      if (shouldInject) {
        clearInterval(poller);

        // Apply fallbacks ONLY now when we are executing injection
        var remainingCandidates = visibleFields.filter(function(el) {
          return el !== nameInput && el !== descInput && el !== targetInput;
        });

        if (!nameInput && remainingCandidates.length > 0) {
          var firstInput = remainingCandidates.find(function(el) { return el.tagName.toLowerCase() === 'input'; });
          if (firstInput) {
            nameInput = firstInput;
            remainingCandidates = remainingCandidates.filter(function(el) { return el !== nameInput; });
          }
        }

        if (!descInput && remainingCandidates.length > 0) {
          var firstTextarea = remainingCandidates.find(function(el) { return el.tagName.toLowerCase() === 'textarea'; });
          if (firstTextarea) {
            descInput = firstTextarea;
            remainingCandidates = remainingCandidates.filter(function(el) { return el !== descInput; });
          } else {
            descInput = remainingCandidates[0];
            remainingCandidates = remainingCandidates.filter(function(el) { return el !== descInput; });
          }
        }

        if (!targetInput && remainingCandidates.length > 0) {
          targetInput = remainingCandidates.find(function(el) { return el.tagName.toLowerCase() === 'textarea' || el.getAttribute('contenteditable') === 'true'; }) || remainingCandidates[0];
        }

        console.log('[GemForge Extension] Fields evaluated for injection:', {
          nameInput: !!nameInput,
          descInput: !!descInput,
          targetInput: !!targetInput
        });

        if (targetInput || nameInput || descInput) {
          console.log('[GemForge Extension] Injecting data into fields...');

          function injectVal(el, val) {
            if (!el) return;
            el.focus();
            
            var isInputTextarea = el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input';
            if (isInputTextarea) {
              el.value = val;
              try {
                var proto = el.tagName.toLowerCase() === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                if (setter) {
                  setter.call(el, val);
                }
              } catch (e) {
                console.warn('[GemForge Extension] Prototype setter failed:', e);
              }
            } else {
              el.innerText = val;
              el.textContent = val;
            }

            el.dispatchEvent(new Event('focus', { bubbles: true }));
            
            try {
              var inputEvent = new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                data: val,
                inputType: 'insertText'
              });
              el.dispatchEvent(inputEvent);
            } catch (e) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }

            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            
            try {
              el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
              el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            } catch (e) {}
          }

          try {
            if (nameInput && data.name) {
              injectVal(nameInput, data.name);
              console.log('[GemForge Extension] Injected name:', data.name);
            }
            if (descInput && data.description) {
              injectVal(descInput, data.description);
              console.log('[GemForge Extension] Injected description:', data.description);
            }
            if (targetInput && data.instructions) {
              injectVal(targetInput, data.instructions);
              console.log('[GemForge Extension] Injected instructions:', data.instructions);
            }
            console.log('[GemForge Extension] Auto-fill completed successfully.');
            showStatusToast('GemForge: Auto-fill completed successfully!', 'success');
          } catch (err) {
            console.error('[GemForge Extension] Error during auto-fill injection:', err);
            showStatusToast('GemForge: Auto-fill encountered an error.', 'error');
          }
        } else {
          console.log('[GemForge Extension] No fields found to inject.');
          showStatusToast('GemForge: Could not detect form input fields.', 'error');
        }

        chrome.storage.local.remove('pendingGemExport', function () {
          console.log('[GemForge Extension] Cleared pending export data.');
          isAutofilling = false;
        });
      }
    }, 500);
  }
})();
