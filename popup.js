const OPENAI_API_KEY = "";
let chatHistory = [];

async function populateTabs() {
  try {
    console.log('=== POPULATE TABS START ===');
    
    // Check if Chrome APIs are available
    if (!chrome || !chrome.tabs) {
      console.error('Chrome tabs API not available');
      const select = document.getElementById("tabSelect");
      if (select) select.innerHTML = '<option value="">Chrome API unavailable</option>';
      return;
    }
    
    console.log('Chrome API available, querying tabs...');
    const tabs = await chrome.tabs.query({});
    console.log('Raw tabs result:', tabs);
    console.log('Number of tabs found:', tabs?.length || 0);
    
    const select = document.getElementById("tabSelect");
    if (!select) {
      console.error('Tab select element not found in DOM!');
      return;
    }
    
    console.log('Select element found, clearing options...');
    select.innerHTML = "";
    
    if (!tabs || tabs.length === 0) {
      console.warn('No tabs found, adding placeholder');
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No tabs available - Try refresh 🔄";
      select.appendChild(option);
      return;
    }
    
    console.log('Processing', tabs.length, 'tabs...');
    tabs.forEach((tab, index) => {
      console.log(`Tab ${index}:`, tab.id, tab.title?.slice(0, 30), tab.url?.slice(0, 50));
      const option = document.createElement("option");
      option.value = tab.id;
      option.textContent = `${tab.title?.slice(0, 50) || tab.url?.slice(0, 50) || 'Unknown tab'}`;
      select.appendChild(option);
    });
    
    console.log('=== POPULATE TABS SUCCESS ===');
    
  } catch (error) {
    console.error('=== POPULATE TABS ERROR ===', error);
    const select = document.getElementById("tabSelect");
    if (select) {
      select.innerHTML = `<option value="">Error: ${error.message}</option>`;
    }
  }
}

// Universal content extraction that works on any website
async function extractPageContent(tabId, query = '') {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: (searchQuery) => {
        const content = [];
        const queryLower = searchQuery.toLowerCase();
        
        // Extract page metadata
        const pageInfo = {
          url: window.location.href,
          title: document.title,
          domain: window.location.hostname
        };
        
        // Universal relevance calculation
        function calculateRelevance(text, query) {
          if (!query) return 0;
          const queryWords = query.split(/\s+/).filter(w => w.length > 2);
          if (queryWords.length === 0) return 0;
          
          let score = 0;
          for (const word of queryWords) {
            const regex = new RegExp(word, 'gi');
            const matches = (text.match(regex) || []).length;
            score += matches;
          }
          return score / queryWords.length;
        }
        
        // 1. Extract all headings (universal)
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
          if (heading.textContent?.trim()) {
            const text = heading.textContent.trim();
            content.push({
              type: 'heading',
              level: heading.tagName.toLowerCase(),
              text: text,
              relevance: calculateRelevance(text.toLowerCase(), queryLower),
              importance: heading.tagName === 'H1' ? 'high' : 'medium'
            });
          }
        });

        // 2. Extract main content areas (universal semantic HTML)
        document.querySelectorAll('main, [role="main"], .main, .content, #main, #content').forEach(main => {
          if (main.textContent?.trim()) {
            const text = main.textContent.trim();
            content.push({
              type: 'main-content',
              text: text.slice(0, 2000),
              relevance: calculateRelevance(text.toLowerCase(), queryLower),
              importance: 'high'
            });
          }
        });

        // 3. Extract articles and posts (universal)
        document.querySelectorAll('article, .article, .post, .entry, .item').forEach(article => {
          if (article.textContent?.trim()) {
            const title = article.querySelector('h1, h2, h3, .title, .headline, .name')?.textContent?.trim() || '';
            const text = article.textContent.trim();
            content.push({
              type: 'article',
              title: title,
              text: text.slice(0, 1000),
              relevance: calculateRelevance(`${title} ${text}`.toLowerCase(), queryLower),
              importance: 'medium'
            });
          }
        });

        // 4. Extract lists (universal structured data)
        document.querySelectorAll('ul, ol').forEach(list => {
          if (list.textContent?.trim() && list.children.length > 1) {
            const text = list.textContent.trim();
            const listItems = Array.from(list.children).map(li => li.textContent?.trim()).filter(Boolean);
            
            content.push({
              type: 'list',
              text: text.slice(0, 500),
              items: listItems.slice(0, 15),
              relevance: calculateRelevance(text.toLowerCase(), queryLower),
              importance: 'medium'
            });
          }
        });

        // 5. Extract navigation and sidebar content (universal)
        document.querySelectorAll('nav, aside, .nav, .sidebar, .menu, .navigation').forEach(element => {
          if (element.textContent?.trim()) {
            const text = element.textContent.trim();
            const title = element.querySelector('h1, h2, h3, .title')?.textContent?.trim() || element.tagName;
            
            content.push({
              type: 'navigation',
              title: title,
              text: text.slice(0, 600),
              relevance: calculateRelevance(text.toLowerCase(), queryLower),
              importance: 'medium'
            });
          }
        });

        // 6. Extract sections and containers (universal)
        document.querySelectorAll('section, .section, .block, .card, .container, .box').forEach(section => {
          if (section.textContent?.trim() && section.textContent.length > 50) {
            const text = section.textContent.trim();
            const title = section.querySelector('h1, h2, h3, .title, .header')?.textContent?.trim() || '';
            
            content.push({
              type: 'section',
              title: title,
              text: text.slice(0, 800),
              relevance: calculateRelevance(`${title} ${text}`.toLowerCase(), queryLower),
              importance: 'medium'
            });
          }
        });

        // 7. Extract tables (universal structured data)
        document.querySelectorAll('table').forEach(table => {
          if (table.textContent?.trim()) {
            const text = table.textContent.trim();
            content.push({
              type: 'table',
              text: text.slice(0, 800),
              relevance: calculateRelevance(text.toLowerCase(), queryLower),
              importance: 'medium'
            });
          }
        });

        // 8. Fallback: extract from body if nothing substantial found
        if (content.length < 3) {
          const bodyText = document.body.textContent.trim();
          if (bodyText) {
            content.push({
              type: 'body-fallback',
              text: bodyText.slice(0, 3000),
              relevance: calculateRelevance(bodyText.toLowerCase(), queryLower),
              importance: 'low'
            });
          }
        }

        // Sort by relevance and importance
        content.sort((a, b) => {
          const aScore = (a.relevance || 0) * 2 + (a.importance === 'high' ? 1 : a.importance === 'medium' ? 0.5 : 0);
          const bScore = (b.relevance || 0) * 2 + (b.importance === 'high' ? 1 : b.importance === 'medium' ? 0.5 : 0);
          return bScore - aScore;
        });

        // Check if we found relevant content
        const queryWantsList = searchQuery.toLowerCase().includes('list') || 
                               searchQuery.toLowerCase().includes('show me') ||
                               searchQuery.toLowerCase().includes('all') ||
                               searchQuery.toLowerCase().includes('get me') ||
                               searchQuery.toLowerCase().includes('display');
        
        const hasActualList = content.some(item => 
          item.type === 'list' && item.items && item.items.length > 3 ||
          (item.text && item.text.split('\n').length > 5) ||
          (item.type === 'article' && item.text.length > 200)
        );
        
        const hasRelevantContent = queryWantsList ? 
          hasActualList : 
          content.some(item => (item.relevance || 0) > 0.5);
        
        return {
          ...pageInfo,
          content: content.slice(0, 15),
          contentCount: content.length,
          hasRelevantContent: hasRelevantContent,
          queryAnalyzed: queryLower.length > 0,
          wantsList: queryWantsList,
          hasActualList: hasActualList
        };
      },
      args: [query]
    });

    return results[0].result;
  } catch (error) {
    console.error('Content extraction failed:', error);
    return {
      url: 'unknown',
      title: 'Error',
      domain: 'unknown',
      content: [{ type: 'error', text: `Failed to extract content: ${error.message}` }],
      hasRelevantContent: false,
      contentCount: 0
    };
  }
}

// Universal URL generation based on common web patterns
function generatePotentialUrls(query, currentUrl) {
  const urls = [];
  const queryLower = query.toLowerCase();
  const urlObj = new URL(currentUrl);
  const baseDomain = `${urlObj.protocol}//${urlObj.hostname}`;
  
  // Clean query for URL generation
  const cleanQuery = query.toLowerCase()
    .replace(/\b(show me|list|display|get me|find|all)\b/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Universal common URL patterns
  if (cleanQuery) {
    urls.push(
      `${baseDomain}/${cleanQuery}`,
      `${baseDomain}/search?q=${encodeURIComponent(query)}`,
      `${baseDomain}/search?query=${encodeURIComponent(query)}`,
      `${baseDomain}/find?q=${encodeURIComponent(query)}`,
      `${baseDomain}/${cleanQuery}s`, // plural
      `${baseDomain}/category/${cleanQuery}`,
      `${baseDomain}/topic/${cleanQuery}`,
      `${baseDomain}/tag/${cleanQuery}`,
      `${baseDomain}/topics/${cleanQuery}`,
      `${baseDomain}/categories/${cleanQuery}`,
      `${baseDomain}/tags/${cleanQuery}`
    );
  }

  // Try different search parameter names (common across sites)
  const searchParams = ['q', 'query', 'search', 's', 'term', 'keyword'];
  for (const param of searchParams) {
    urls.push(`${baseDomain}/search?${param}=${encodeURIComponent(query)}`);
  }

  // Try current page with different query parameters
  if (urlObj.pathname !== '/') {
    urls.push(`${baseDomain}${urlObj.pathname}?q=${encodeURIComponent(query)}`);
  }

  return [...new Set(urls)]; // Remove duplicates
}

// Universal decision logic for when to fetch content elsewhere
function shouldFetchElsewhere(query, currentContent, currentUrl) {
  try {
    if (!currentContent) return true;
    
    const queryLower = query.toLowerCase();
    
    // Universal intent keywords that suggest user wants specific content
    const actionWords = ['show', 'list', 'get', 'find', 'display', 'give me', 'show me'];
    const hasActionWord = actionWords.some(word => queryLower.includes(word));
    
    // If user is asking for something specific but current content is limited
    if (hasActionWord && (!currentContent.hasRelevantContent || currentContent.contentCount < 5)) {
      console.log('Action word detected with limited content, will fetch elsewhere');
      return true;
    }
    
    // If user wants lists but current page doesn't have structured lists
    if (currentContent.wantsList && !currentContent.hasActualList) {
      console.log('User wants list but current page lacks structured content');
      return true;
    }
    
    // If query has multiple specific words but low relevance
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length >= 2 && (!currentContent.hasRelevantContent)) {
      console.log('Multi-word query with low relevance, will fetch elsewhere');
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error('Error deciding whether to fetch elsewhere:', error);
    return true; // Default to fetching when in doubt
  }
}

// Universal content fetching with error handling
async function fetchContentFromUrl(url) {
  let tab = null;
  try {
    console.log('Creating tab for:', url);
    
    tab = await chrome.tabs.create({ url: url, active: false });
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Tab loading timeout'));
      }, 8000); // 8 second timeout
      
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for render
    
    const content = await extractPageContent(tab.id, '');
    
    await chrome.tabs.remove(tab.id);
    
    return content || {
      url: url,
      title: 'No content',
      domain: new URL(url).hostname,
      content: [],
      hasRelevantContent: false,
      contentCount: 0
    };
    
  } catch (error) {
    console.error('Fetch failed:', error);
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) {}
    }
    return null;
  }
}

// Main smart fetching logic
async function smartContentFetch(tabId, query) {
  try {
    const currentTab = await chrome.tabs.get(tabId);
    const currentContent = await extractPageContent(tabId, query);
    
    if (!currentContent) {
      throw new Error('Failed to extract current page content');
    }
    
    if (shouldFetchElsewhere(query, currentContent, currentTab.url)) {
      const potentialUrls = generatePotentialUrls(query, currentTab.url);
      console.log('Will try URLs:', potentialUrls.slice(0, 3));
      
      for (const url of potentialUrls.slice(0, 3)) {
        const fetchedContent = await fetchContentFromUrl(url);
        if (fetchedContent && (fetchedContent.hasRelevantContent || fetchedContent.contentCount > currentContent.contentCount)) {
          return {
            ...fetchedContent,
            fetchedFrom: url,
            originalPage: currentTab.url,
            autoFetched: true
          };
        }
      }
    }
    
    return currentContent;
    
  } catch (error) {
    console.error('Smart fetch error:', error);
    return {
      url: 'error',
      title: 'Error',
      domain: 'error',
      content: [{ type: 'error', text: `Error: ${error.message}` }],
      hasRelevantContent: false,
      contentCount: 0
    };
  }
}

// Format content for LLM
function formatContentForLLM(extractedData, originalQuery) {
  let formatted = `Website: ${extractedData.domain}\nPage: ${extractedData.title}\nURL: ${extractedData.url}\n`;
  
  if (extractedData.autoFetched) {
    formatted += `Content auto-fetched from: ${extractedData.fetchedFrom}\n`;
  }
  
  formatted += `Query: "${originalQuery}"\n\n`;

  extractedData.content.forEach((item, index) => {
    const relevanceIcon = (item.relevance || 0) > 1 ? "🎯 " : "";
    
    switch (item.type) {
      case 'heading':
        formatted += `${relevanceIcon}${item.level.toUpperCase()}: ${item.text}\n\n`;
        break;
      case 'list':
        formatted += `${relevanceIcon}LIST:\n${item.items?.map(i => `• ${i}`).join('\n') || item.text}\n\n`;
        break;
      case 'article':
        formatted += `${relevanceIcon}${item.title ? `${item.title}: ` : ''}${item.text}\n\n`;
        break;
      default:
        formatted += `${relevanceIcon}${item.text}\n\n`;
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

  const emptyChat = chatBox.querySelector('.empty-chat');
  if (emptyChat) emptyChat.remove();

  chatHistory.push({ role: "user", content: userText });
  chatBox.innerHTML += `<div class="user"><b>You:</b> ${userText}</div>`;
  inputEl.value = "";

  chatBox.innerHTML += `<div class="bot"><b>Bot:</b> <i>Analyzing and searching for: "${userText}"...</i></div>`;
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const extractedData = await smartContentFetch(tabId, userText);
    const formattedContent = formatContentForLLM(extractedData, userText);

    const messages = [
      {
        role: "system",
        content: `You are a helpful AI assistant analyzing web content. 
        
        ${extractedData.autoFetched ? 
          `I automatically found and fetched relevant content from ${extractedData.fetchedFrom} for the user's query. Present this content directly.` :
          `Content is from the current page.`}
        
        Provide detailed, helpful answers based on the extracted content. If presenting lists or structured data, format them clearly.`
      },
      {
        role: "system", 
        content: `Content:\n\n${formattedContent}`
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
        max_tokens: 700,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const botReply = data.choices?.[0]?.message?.content || "No response generated.";
    
    chatHistory.push({ role: "assistant", content: botReply });

    const chatMessages = chatBox.children;
    const lastMessage = chatMessages[chatMessages.length - 1];
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

// Multiple initialization attempts to ensure tabs load
function initializeExtension() {
  console.log('Initializing extension...');
  
  // Try immediate load
  populateTabs();
  
  // Add refresh button
  const tabSelect = document.getElementById('tabSelect');
  if (tabSelect && tabSelect.parentNode) {
    // Remove existing refresh button if present
    const existingBtn = tabSelect.parentNode.querySelector('button[title="Refresh tabs"]');
    if (existingBtn) existingBtn.remove();
    
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '🔄';
    refreshBtn.style.cssText = 'margin-left:5px;padding:5px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:white;';
    refreshBtn.title = 'Refresh tabs';
    refreshBtn.onclick = populateTabs;
    tabSelect.parentNode.insertBefore(refreshBtn, tabSelect.nextSibling);
  }
  
  // Fallback loads with delays
  setTimeout(populateTabs, 100);
  setTimeout(populateTabs, 500);
  setTimeout(populateTabs, 1000);
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  // DOM already loaded
  initializeExtension();
}

// Also initialize when popup becomes visible (Chrome extension specific)
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'popupOpened') {
      initializeExtension();
    }
  });
}