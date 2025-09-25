// Background script for Tab Chatbot extension
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Tab Chatbot extension installed');
  } else if (details.reason === 'update') {
    console.log('Tab Chatbot extension updated');
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // The popup will handle the interaction
  console.log('Extension clicked on tab:', tab.url);
});

// Optional: Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTabInfo') {
    chrome.tabs.query({}, (tabs) => {
      sendResponse({ tabs: tabs });
    });
    return true; // Indicates async response
  }
});

// Optional: Context menu for right-click functionality
chrome.contextMenus.create({
  id: 'analyzeWithChatbot',
  title: 'Analyze with Chatbot',
  contexts: ['page']
}, () => {
  if (chrome.runtime.lastError) {
    console.log('Context menu creation failed:', chrome.runtime.lastError.message);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'analyzeWithChatbot') {
    // Open the popup or perform analysis
    chrome.action.openPopup();
  }
});