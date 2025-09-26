const OPENAI_API_KEY = "";
let chatHistory = [];

// Simple tab population
async function populateTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const select = document.getElementById("tabSelect");
    if (!select) return;
    
    select.innerHTML = "";
    if (!tabs?.length) {
      select.innerHTML = '<option value="">No tabs available</option>';
      return;
    }
    
    tabs.forEach((tab) => {
      const option = document.createElement("option");
      option.value = tab.id;
      option.textContent = `${tab.title?.slice(0, 50) || tab.url?.slice(0, 50)}`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Tab loading error:', error);
  }
}

// Simple content extraction - just get everything
async function extractPageContent(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: () => {
        // Extract all meaningful content from page
        const content = [];
        
        // Get page metadata
        const pageInfo = {
          url: window.location.href,
          title: document.title,
          domain: window.location.hostname
        };
        
        // Extract headings
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading, i) => {
          if (heading.textContent?.trim()) {
            content.push({
              type: 'heading',
              text: heading.textContent.trim(),
              level: heading.tagName.toLowerCase()
            });
          }
        });
        
        // Extract main content areas
        const contentSelectors = [
          'main', '[role="main"]', '.main', '#main',
          'article', '.article', '.post', '.entry',
          'section', '.section', '.content', '#content',
          '.container', '.wrapper', 'aside', '.sidebar'
        ];
        
        contentSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach((element, i) => {
            if (element.textContent?.trim() && element.textContent.length > 50) {
              content.push({
                type: selector.replace(/[.#\[\]="']/g, ''),
                text: element.textContent.trim().slice(0, 1500)
              });
            }
          });
        });
        
        // Extract lists
        document.querySelectorAll('ul, ol').forEach((list, i) => {
          if (list.children.length > 1) {
            const items = Array.from(list.children)
              .map(li => li.textContent?.trim())
              .filter(Boolean)
              .slice(0, 20);
            
            if (items.length > 0) {
              content.push({
                type: 'list',
                text: list.textContent.trim().slice(0, 1000),
                items: items
              });
            }
          }
        });
        
        // Extract tables
        document.querySelectorAll('table').forEach((table, i) => {
          if (table.textContent?.trim()) {
            content.push({
              type: 'table',
              text: table.textContent.trim().slice(0, 1000)
            });
          }
        });
        
        // If nothing substantial, get body
        if (content.length < 3) {
          content.push({
            type: 'body',
            text: document.body.textContent.trim().slice(0, 3000)
          });
        }
        
        return {
          ...pageInfo,
          content: content.slice(0, 20) // Limit to prevent overwhelming
        };
      }
    });

    return results[0].result;
  } catch (error) {
    console.error('Content extraction failed:', error);
    return null;
  }
}

// Use AI to understand if current page has what user wants
async function analyzeContentRelevance(userQuery, currentPageData) {
  try {
    const messages = [
      {
        role: "system",
        content: `You are an AI that analyzes if a webpage contains what a user is looking for.

Current webpage: ${currentPageData.title}
URL: ${currentPageData.url}
Domain: ${currentPageData.domain}

User's query: "${userQuery}"

Analyze the webpage content and determine:
1. Does this page contain what the user is asking for?
2. If not, what kind of page/URL should contain this content?
3. What are 2-3 most likely URLs on this domain that would have the content?

Respond in JSON format:
{
  "hasRelevantContent": boolean,
  "confidence": number (0-1),
  "reasoning": "brief explanation",
  "suggestedUrls": ["url1", "url2", "url3"]
}`
      },
      {
        role: "user",
        content: `Page content summary:\n${currentPageData.content.map(item => 
          `${item.type}: ${item.text.slice(0, 200)}${item.items ? '\nItems: ' + item.items.slice(0, 5).join(', ') : ''}`
        ).join('\n\n')}`
      }
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        max_tokens: 300,
        temperature: 0.3
      })
    });

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;
    
    // Parse JSON response
    try {
      return JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      return {
        hasRelevantContent: false,
        confidence: 0,
        reasoning: "AI response parsing failed",
        suggestedUrls: []
      };
    }
    
  } catch (error) {
    console.error('AI analysis failed:', error);
    return {
      hasRelevantContent: false,
      confidence: 0,
      reasoning: "AI analysis failed",
      suggestedUrls: []
    };
  }
}

// Fetch content from a URL
async function fetchFromUrl(url) {
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url: url, active: false });
    
    // Wait for page load
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 8000);
      
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for content to render
    
    const content = await extractPageContent(tab.id);
    await chrome.tabs.remove(tab.id);
    
    return content;
    
  } catch (error) {
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) {}
    }
    console.error('Fetch failed for', url, ':', error);
    return null;
  }
}

// Main intelligent content fetching
async function intelligentContentFetch(tabId, userQuery) {
  try {
    // Step 1: Get current page content
    const currentTab = await chrome.tabs.get(tabId);
    const currentContent = await extractPageContent(tabId);
    
    if (!currentContent) {
      throw new Error('Failed to extract current page content');
    }
    
    // Step 2: Use AI to analyze if current page has what user wants
    const analysis = await analyzeContentRelevance(userQuery, currentContent);
    
    console.log('AI Analysis:', analysis);
    
    // Step 3: If current page doesn't have it, try to fetch from suggested URLs
    if (!analysis.hasRelevantContent && analysis.suggestedUrls.length > 0) {
      console.log('Current page lacks content, trying suggested URLs...');
      
      for (const suggestedUrl of analysis.suggestedUrls.slice(0, 3)) {
        try {
          console.log('Trying:', suggestedUrl);
          const fetchedContent = await fetchFromUrl(suggestedUrl);
          
          if (fetchedContent && fetchedContent.content.length > currentContent.content.length) {
            console.log('Successfully fetched better content from:', suggestedUrl);
            return {
              ...fetchedContent,
              autoFetched: true,
              fetchedFrom: suggestedUrl,
              aiReasoning: analysis.reasoning
            };
          }
        } catch (error) {
          console.log('Failed to fetch from:', suggestedUrl, error);
          continue;
        }
      }
    }
    
    // Step 4: Return current content if no better alternative found
    return {
      ...currentContent,
      aiAnalysis: analysis
    };
    
  } catch (error) {
    console.error('Intelligent fetch failed:', error);
    return {
      url: 'error',
      title: 'Error',
      content: [{ type: 'error', text: error.message }]
    };
  }
}

// Format content for final LLM response
function formatContentForLLM(contentData, userQuery) {
  let formatted = `Page: ${contentData.title}\nURL: ${contentData.url}\n`;
  
  if (contentData.autoFetched) {
    formatted += `Content auto-fetched from: ${contentData.fetchedFrom}\n`;
    formatted += `AI reasoning: ${contentData.aiReasoning}\n`;
  }
  
  formatted += `\nUser query: "${userQuery}"\n\nPage content:\n\n`;
  
  contentData.content.forEach((item, i) => {
    if (item.items) {
      formatted += `${item.type.toUpperCase()} (${item.items.length} items):\n`;
      item.items.forEach(listItem => formatted += `• ${listItem}\n`);
      formatted += '\n';
    } else {
      formatted += `${item.type.toUpperCase()}: ${item.text}\n\n`;
    }
  });
  
  return formatted;
}

// Main event handler
document.getElementById("sendInput").addEventListener("click", async () => {
  const inputEl = document.getElementById("userInput");
  const chatBox = document.getElementById("chat");
  const userText = inputEl.value.trim();
  const tabId = parseInt(document.getElementById("tabSelect").value);

  if (!userText) return;

  // Clear welcome message and add user message
  const emptyChat = chatBox.querySelector('.empty-chat');
  if (emptyChat) emptyChat.remove();
  
  chatHistory.push({ role: "user", content: userText });
  chatBox.innerHTML += `<div class="user"><b>You:</b> ${userText}</div>`;
  inputEl.value = "";

  // Show loading
  chatBox.innerHTML += `<div class="bot"><b>Bot:</b> <i>🤖 Understanding your request...</i></div>`;
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    // Step 1: Intelligent content fetching
    const contentData = await intelligentContentFetch(tabId, userText);
    
    // Update loading message
    const chatMessages = chatBox.children;
    const lastMessage = chatMessages[chatMessages.length - 1];
    
    if (contentData.autoFetched) {
      lastMessage.innerHTML = `<b>Bot:</b> <i>✅ Found relevant content, generating response...</i>`;
    } else {
      lastMessage.innerHTML = `<b>Bot:</b> <i>📄 Analyzing current page content...</i>`;
    }
    
    // Step 2: Format content for LLM
    const formattedContent = formatContentForLLM(contentData, userText);
    
    // Step 3: Generate final response
    const messages = [
      {
        role: "system",
        content: `You are a helpful assistant that answers questions about webpage content.
        
        ${contentData.autoFetched ? 
          'I found and fetched the relevant content for the user. Present this information as the direct answer to their question.' :
          'I analyzed the current page content. Answer based on what I found.'}
        
        Be specific, detailed, and helpful. If you found lists or structured data, present them clearly.`
      },
      {
        role: "system",
        content: formattedContent
      },
      ...chatHistory
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        max_tokens: 800,
        temperature: 0.7
      })
    });

    const data = await response.json();
    const botReply = data.choices?.[0]?.message?.content || "I couldn't generate a response.";
    
    chatHistory.push({ role: "assistant", content: botReply });

    // Update UI with final response
    lastMessage.innerHTML = `<b>Bot:</b> ${botReply}`;
    lastMessage.className = 'bot';
    chatBox.scrollTop = chatBox.scrollHeight;

  } catch (error) {
    console.error('Error:', error);
    const chatMessages = chatBox.children;
    const lastMessage = chatMessages[chatMessages.length - 1];
    lastMessage.innerHTML = `<b>Error:</b> ${error.message}`;
    lastMessage.className = 'bot error';
  }
});

// Enter key support
document.getElementById("userInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("sendInput").click();
  }
});

// Initialize
function initializeExtension() {
  populateTabs();
  
  const tabSelect = document.getElementById('tabSelect');
  if (tabSelect?.parentNode && !tabSelect.parentNode.querySelector('[title="Refresh tabs"]')) {
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '🔄';
    refreshBtn.style.cssText = 'margin-left:5px;padding:5px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;';
    refreshBtn.title = 'Refresh tabs';
    refreshBtn.onclick = populateTabs;
    tabSelect.parentNode.insertBefore(refreshBtn, tabSelect.nextSibling);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}