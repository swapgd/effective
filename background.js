chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(t => {
      console.log("Tab:", t.url);
    });
  });
});
