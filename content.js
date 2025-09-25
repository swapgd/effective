// Content script for Tab Chatbot extension
// This script runs in the context of web pages

(() => {
  'use strict';

  // Function to extract structured content from the current page
  function extractPageContent() {
    const content = {
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      content: []
    };

    try {
      // Extract headings
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
        if (heading.textContent?.trim()) {
          content.content.push({
            type: 'heading',
            level: heading.tagName.toLowerCase(),
            text: heading.textContent.trim(),
            id: heading.id || null
          });
        }
      });

      // Stack Overflow specific extractors
      if (window.location.hostname.includes('stackoverflow.com')) {
        // Questions
        document.querySelectorAll('.s-post-summary, .question-summary').forEach(post => {
          const titleEl = post.querySelector('.s-link, .question-hyperlink');
          const excerptEl = post.querySelector('.s-post-summary--content-excerpt, .excerpt');
          const tagsEl = post.querySelector('.s-post-summary--meta-tags, .tags');
          
          if (titleEl?.textContent?.trim()) {
            content.content.push({
              type: 'question',
              title: titleEl.textContent.trim(),
              excerpt: excerptEl?.textContent?.trim() || '',
              tags: tagsEl?.textContent?.trim() || '',
              url: titleEl.href || ''
            });
          }
        });

        // Pinned collective content
        document.querySelectorAll('.js-pinned-collective-post, .s-card.js-pinned-collective-post, [data-testid="pinned-collective-post"]').forEach(pinned => {
          if (pinned.textContent?.trim()) {
            content.content.push({
              type: 'pinned-collective',
              text: pinned.textContent.trim()
            });
          }
        });

        // Collective information
        document.querySelectorAll('.collective-info, .s-sidebarwidget').forEach(widget => {
          const headerEl = widget.querySelector('.s-sidebarwidget--header, .collective-info--header');
          const header = headerEl?.textContent?.trim() || 'Info';
          
          if (widget.textContent?.trim()) {
            content.content.push({
              type: 'collective-info',
              title: header,
              text: widget.textContent.trim()
            });
          }
        });
      }

      // GitHub specific extractors
      if (window.location.hostname.includes('github.com')) {
        // Repository info
        const repoHeader = document.querySelector('[data-testid="repository-container-header"]');
        if (repoHeader) {
          content.content.push({
            type: 'repository-info',
            text: repoHeader.textContent.trim()
          });
        }

        // README content
        const readme = document.querySelector('[data-testid="readme"]');
        if (readme) {
          content.content.push({
            type: 'readme',
            text: readme.textContent.trim().slice(0, 2000)
          });
        }
      }

      // Generic content extraction
      document.querySelectorAll('main, article, section[role="main"]').forEach((section, index) => {
        if (section.textContent?.trim() && content.content.length < 20) {
          content.content.push({
            type: 'main-content',
            index: index,
            text: section.textContent.trim().slice(0, 1500)
          });
        }
      });

      // Fallback: extract from body if no content found
      if (content.content.length === 0) {
        content.content.push({
          type: 'body-fallback',
          text: document.body.textContent.trim().slice(0, 3000)
        });
      }

    } catch (error) {
      content.content.push({
        type: 'error',
        message: error.message
      });
    }

    return content;
  }

  // Listen for messages from the extension
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
      try {
        const content = extractPageContent();
        sendResponse({ success: true, content });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }
    return true; // Indicates async response
  });

  // Optional: Auto-extract content when page loads (for background analysis)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Could send content to background script for caching
    });
  }

})();